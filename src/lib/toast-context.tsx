"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastCtx {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => undefined });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom,0px) + 84px)", left: 0, right: 0, maxWidth: 480, margin: "0 auto", padding: "0 16px", zIndex: 200, pointerEvents: "none", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: t.type === "error" ? "#ef1d27" : t.type === "info" ? "#0891b2" : "#1a1a2e", color: "#fff", borderRadius: 14, padding: "11px 18px", fontSize: 13.5, fontWeight: 700, boxShadow: "0 8px 32px rgba(7,20,38,0.22)", animation: "toastIn 0.26s cubic-bezier(0.2,0.9,0.3,1) both", maxWidth: "100%", textAlign: "center", lineHeight: 1.4 }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
