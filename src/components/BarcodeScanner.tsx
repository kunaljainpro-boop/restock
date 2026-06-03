"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap } from "lucide-react";

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectedRef = useRef(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      // Try highest res first for best barcode read accuracy
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      }).catch(() =>
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        })
      );
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        startDetecting();
      }
    } catch {
      setError("Camera access denied. Allow camera permission and retry.");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function startDetecting() {
    const hasBD = typeof window !== "undefined" && "BarcodeDetector" in window;
    if (!hasBD || !videoRef.current) return;

    // All formats supported by BarcodeDetector
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({
      formats: [
        "ean_13", "ean_8", "upc_a", "upc_e",
        "code_128", "code_39", "code_93",
        "itf", "codabar", "aztec",
        "data_matrix", "qr_code", "pdf417",
      ],
    });

    // Time-based debounce: same code twice within 400ms = instant confirm
    let lastCode = "";
    let lastTime = 0;

    async function detect() {
      if (detectedRef.current) return;
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          const code = results[0].rawValue;
          const now = Date.now();
          if (code === lastCode && now - lastTime < 500) {
            // Confirmed — same code seen again quickly
            detectedRef.current = true;
            setLastScanned(code);
            stopCamera();
            onDetected(code);
            return;
          }
          // First time seeing this code — show it and wait for confirm
          if (code !== lastCode) {
            setLastScanned(code);
          }
          lastCode = code;
          lastTime = now;
        }
      } catch { /* ignore frame errors */ }
      rafRef.current = requestAnimationFrame(detect);
    }
    detect();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }}>
        <div>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 900 }}>Scan Barcode</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <Zap size={11} color="#fbbf24" fill="#fbbf24" />
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600 }}>Fast scan — all formats</span>
          </div>
        </div>
        <button onClick={() => { stopCamera(); onClose(); }} style={{ width: 38, height: 38, borderRadius: 99, background: "rgba(255,255,255,0.18)", border: 0, display: "grid", placeItems: "center", color: "#fff" }}>
          <X size={20} />
        </button>
      </div>

      {error ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", padding: 32, gap: 16 }}>
          <p style={{ textAlign: "center", fontSize: 15, fontWeight: 600 }}>{error}</p>
          <button onClick={() => { stopCamera(); onClose(); }} style={{ background: "#ef1d27", color: "#fff", border: 0, borderRadius: 14, padding: "12px 24px", fontWeight: 800, fontSize: 14 }}>Close</button>
        </div>
      ) : (
        <div style={{ flex: 1, position: "relative" }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <ScanOverlay scanning={scanning} lastScanned={lastScanned} />
          {!("BarcodeDetector" in (typeof window !== "undefined" ? window : {})) && (
            <div style={{ position: "absolute", bottom: 80, left: 16, right: 16, background: "rgba(239,29,39,0.9)", borderRadius: 14, padding: 14, color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 700 }}>
              Use Chrome on Android for barcode scanning
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanOverlay({ scanning, lastScanned }: { scanning: boolean; lastScanned: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      {/* Dark overlay with hole */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />

      {/* Scan frame */}
      <div style={{ width: 280, height: 160, position: "relative", zIndex: 1 }}>
        {/* Clear hole in overlay */}
        <div style={{ position: "absolute", inset: 0, background: "transparent", boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)", borderRadius: 12 }} />

        {/* Corner brackets */}
        {([
          { top: -2, left: -2, borderTop: "3px solid #ef1d27", borderLeft: "3px solid #ef1d27", borderRadius: "6px 0 0 0" },
          { top: -2, right: -2, borderTop: "3px solid #ef1d27", borderRight: "3px solid #ef1d27", borderRadius: "0 6px 0 0" },
          { bottom: -2, left: -2, borderBottom: "3px solid #ef1d27", borderLeft: "3px solid #ef1d27", borderRadius: "0 0 0 6px" },
          { bottom: -2, right: -2, borderBottom: "3px solid #ef1d27", borderRight: "3px solid #ef1d27", borderRadius: "0 0 6px 0" },
        ] as React.CSSProperties[]).map((s, i) => (
          <span key={i} style={{ position: "absolute", width: 26, height: 26, ...s }} />
        ))}

        {/* Scan line */}
        {scanning && (
          <div style={{ position: "absolute", left: 4, right: 4, height: 2.5, background: "linear-gradient(90deg, transparent, #ef1d27 30%, #ef1d27 70%, transparent)", borderRadius: 2, boxShadow: "0 0 8px #ef1d27", animation: "scanLine 1.6s ease-in-out infinite" }} />
        )}
      </div>

      {/* Last detected code preview */}
      {lastScanned ? (
        <div style={{ position: "absolute", bottom: "18%", left: 24, right: 24, background: "rgba(0,0,0,0.75)", borderRadius: 12, padding: "10px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Detected</p>
          <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: 2, fontFamily: "monospace" }}>{lastScanned}</p>
        </div>
      ) : (
        <div style={{ position: "absolute", bottom: "18%", color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>
          Point camera at barcode or QR code
        </div>
      )}
    </div>
  );
}
