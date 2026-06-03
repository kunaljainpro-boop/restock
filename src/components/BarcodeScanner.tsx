"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        startDetecting();
      }
    } catch {
      setError("Camera access denied. Please allow camera permission.");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function startDetecting() {
    const hasBD = typeof window !== "undefined" && "BarcodeDetector" in window;
    if (!hasBD || !videoRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
    });

    let lastCode = "";
    let sameCount = 0;

    async function detect() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          const code = results[0].rawValue;
          if (code === lastCode) {
            sameCount++;
            if (sameCount >= 2) {
              stopCamera();
              onDetected(code);
              return;
            }
          } else {
            lastCode = code;
            sameCount = 1;
          }
        }
      } catch { /* ignore */ }
      rafRef.current = requestAnimationFrame(detect);
    }
    detect();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>Scan Barcode</span>
        <button onClick={() => { stopCamera(); onClose(); }} style={{ width: 38, height: 38, borderRadius: 99, background: "rgba(255,255,255,0.15)", border: 0, display: "grid", placeItems: "center", color: "#fff" }}>
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
          <ScanOverlay scanning={scanning} />
          {!("BarcodeDetector" in (typeof window !== "undefined" ? window : {})) && (
            <div style={{ position: "absolute", bottom: 32, left: 16, right: 16, background: "rgba(0,0,0,0.7)", borderRadius: 14, padding: 14, color: "#fff", textAlign: "center", fontSize: 13 }}>
              Auto-detect not supported. Use Chrome on Android for best results.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanOverlay({ scanning }: { scanning: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ width: 260, height: 180, position: "relative" }}>
        {/* corners */}
        {[
          { top: 0, left: 0, borderTop: "3px solid #ef1d27", borderLeft: "3px solid #ef1d27" },
          { top: 0, right: 0, borderTop: "3px solid #ef1d27", borderRight: "3px solid #ef1d27" },
          { bottom: 0, left: 0, borderBottom: "3px solid #ef1d27", borderLeft: "3px solid #ef1d27" },
          { bottom: 0, right: 0, borderBottom: "3px solid #ef1d27", borderRight: "3px solid #ef1d27" },
        ].map((s, i) => (
          <span key={i} style={{ position: "absolute", width: 22, height: 22, ...s }} />
        ))}
        {scanning && (
          <div style={{ position: "absolute", left: 2, right: 2, height: 2, background: "linear-gradient(90deg, transparent, #ef1d27, transparent)", animation: "scanLine 2s ease-in-out infinite" }} />
        )}
      </div>
      <div style={{ position: "absolute", bottom: "22%", color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>
        Point camera at barcode
      </div>
    </div>
  );
}
