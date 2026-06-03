"use client";

import type { Session } from "@supabase/supabase-js";
import { Home, ListChecks, Printer, Settings, Store } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { ToastProvider } from "@/lib/toast-context";
import { HomeTab } from "@/components/HomeTab";
import { BrandsTab } from "@/components/BrandsTab";
import { ListTab } from "@/components/ListTab";
import { PrintTab } from "@/components/PrintTab";
import { SettingsTab } from "@/components/SettingsTab";

type TabId = "home" | "brands" | "list" | "print" | "settings";

const tabs: { id: TabId; label: string; icon: ReactNode; color: string }[] = [
  { id: "home",     label: "Home",     icon: <Home size={21} />,       color: "#ef1d27" },
  { id: "brands",   label: "Brands",   icon: <Store size={21} />,      color: "#0891b2" },
  { id: "list",     label: "List",     icon: <ListChecks size={21} />, color: "#61bd45" },
  { id: "print",    label: "Print",    icon: <Printer size={21} />,    color: "#071426" },
  { id: "settings", label: "Settings", icon: <Settings size={21} />,   color: "#ffac1d" },
];

const VALID_TABS = new Set<TabId>(["home", "brands", "list", "print", "settings"]);

function tabFromHash(): TabId {
  const h = window.location.hash.replace("#", "") as TabId;
  return VALID_TABS.has(h) ? h : "home";
}

// Global PWA install prompt — captured once, used anywhere
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function ReStockApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(Boolean(supabase));
  const [tab, setTab] = useState<TabId>("home");
  const [canInstall, setCanInstall] = useState(false);

  // Apply theme
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  // PWA service worker + install prompt
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", () => setCanInstall(false));
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // ── History API — fixes back button closing the app ───────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    // CRITICAL: if Supabase auth params are in the hash, don't touch the URL
    const isAuthCallback = hash.includes("access_token=") || hash.includes("refresh_token=") || window.location.search.includes("code=");

    if (!isAuthCallback) {
      const initial = tabFromHash();
      setTab(initial);
      window.history.replaceState({ tab: initial }, "", "#" + initial);
    }

    function onPopState(e: PopStateEvent) {
      const t = (e.state?.tab ?? tabFromHash()) as TabId;
      if (VALID_TABS.has(t)) setTab(t);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigateTo(newTab: TabId) {
    if (newTab === tab) return;
    window.history.pushState({ tab: newTab }, "", "#" + newTab);
    setTab(newTab);
  }

  // Auth
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    // Check BOTH search params (PKCE) AND hash (implicit flow)
    const hasCallback = window.location.search.includes("code=") ||
      window.location.hash.includes("access_token=");
    const sessionPromise = supabase.auth.getSession();
    const p = hasCallback
      ? sessionPromise
      : Promise.race([
          sessionPromise,
          new Promise<{ data: { session: Session | null } }>((res) =>
            setTimeout(() => res({ data: { session: null } }), 1800)
          ),
        ]);
    p.then(({ data }) => { if (alive) { setSession(data.session); setLoadingAuth(false); } });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoadingAuth(false); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  async function signIn() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  }

  if (loadingAuth) return <SplashScreen />;
  if (!session)   return <LoginScreen onGoogle={signIn} />;

  async function installPWA() {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") { deferredInstallPrompt = null; setCanInstall(false); }
  }

  return (
    <ToastProvider>
      <main className="app-shell">
        {/* PWA install banner — shows only when installable */}
        {canInstall && (
          <div style={{ background: "linear-gradient(90deg,#ef1d27,#c1121f)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Image src="/restock.png" alt="" width={28} height={28} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 7 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#fff" }}>Install ReStock on your phone</span>
            <button onClick={installPWA} style={{ height: 32, borderRadius: 10, background: "#fff", color: "#ef1d27", border: 0, padding: "0 14px", fontWeight: 900, fontSize: 13 }}>Install</button>
            <button onClick={() => setCanInstall(false)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.2)", border: 0, color: "#fff", fontWeight: 900, fontSize: 16 }}>×</button>
          </div>
        )}
        <div className="scroll-page">
          {tab === "home"     && <HomeTab userId={session.user.id} onTabChange={(t) => navigateTo(t as TabId)} />}
          {tab === "brands"   && <BrandsTab userId={session.user.id} />}
          {tab === "list"     && <ListTab userId={session.user.id} />}
          {tab === "print"    && <PrintTab userId={session.user.id} />}
          {tab === "settings" && <SettingsTab session={session} canInstall={canInstall} onInstall={installPWA} />}
        </div>
        <BottomNav tab={tab} setTab={navigateTo} />
      </main>
    </ToastProvider>
  );
}

// ── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen() {
  return (
    <main style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#fff", zIndex: 9999 }}>
      <div style={{ textAlign: "center" }}>
        <Image src="/restock.png" alt="ReStock" width={150} height={150} priority style={{ width: 150, height: 150, objectFit: "contain" }} />
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 34 }}>
          {[0, 1, 2].map((d) => (
            <span key={d} style={{ width: 6, height: 6, borderRadius: 99, background: "#ef1d27", animation: `pulse 1.1s ease-in-out ${d * 0.18}s infinite` }} />
          ))}
        </div>
      </div>
    </main>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onGoogle }: { onGoogle: () => void }) {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 20px", background: "linear-gradient(160deg,#fff 0%,#fff3f3 38%,#eef7ff 100%)", position: "relative", overflow: "hidden" }}>
      <Aurora />
      <section className="fade-in-up" style={{ width: "100%", maxWidth: 390, position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <Image src="/restock.png" alt="ReStock" width={116} height={116} priority style={{ width: 116, height: 116, objectFit: "contain", borderRadius: 28, boxShadow: "0 0 0 1px rgba(239,29,39,0.22), 0 0 46px rgba(239,29,39,0.22), 0 16px 48px rgba(7,20,38,0.16)" }} />
          <h1 style={{ marginTop: 16, fontSize: 38, lineHeight: 1, fontWeight: 950, letterSpacing: 0, color: "#071426" }}>ReStock</h1>
          <p style={{ marginTop: 8, fontSize: 13, fontWeight: 650, color: "#768398" }}>The Modern FMCG Reorder List</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.88)", border: "1.5px solid rgba(239,29,39,0.12)", borderRadius: 30, padding: "28px 24px", boxShadow: "0 16px 58px rgba(7,20,38,0.12), 0 2px 12px rgba(7,20,38,0.05)", backdropFilter: "blur(18px)" }}>
          <p style={{ textAlign: "center", fontSize: 19, fontWeight: 900, color: "#071426" }}>Sign in to your restock desk</p>
          <button
            onClick={onGoogle}
            disabled={!isSupabaseConfigured}
            style={{ width: "100%", height: 54, marginTop: 22, borderRadius: 17, border: "1.5px solid rgba(7,20,38,0.1)", background: "#fff", color: "#071426", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 15, fontWeight: 850, boxShadow: "0 4px 18px rgba(7,20,38,0.08)", cursor: isSupabaseConfigured ? "pointer" : "not-allowed", opacity: isSupabaseConfigured ? 1 : 0.5 }}
          >
            <GoogleMark /> Continue with Google
          </button>
          {!isSupabaseConfigured && (
            <p style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: "#ef1d27", fontWeight: 700 }}>
              Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable login.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
function BottomNav({ tab, setTab }: { tab: TabId; setTab: (t: TabId) => void }) {
  return (
    <nav className="no-print" style={{ position: "relative", background: "var(--nav-bg)", borderTop: "1px solid var(--border)", boxShadow: "var(--shadow-nav)", display: "flex", zIndex: 50, padding: "6px 4px calc(env(safe-area-inset-bottom,0px) + 7px)" }}>
      {tabs.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{ flex: 1, minHeight: 54, border: 0, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? item.color : "var(--text-dim)", fontWeight: active ? 900 : 600, fontSize: 9 }}
          >
            <span style={{ width: 44, height: 30, borderRadius: 12, display: "grid", placeItems: "center", background: active ? `${item.color}22` : "transparent", boxShadow: active ? `0 0 12px ${item.color}44` : "none", transform: active ? "scale(1.06)" : "scale(1)", transition: "all 0.18s ease" }}>
              {item.icon}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Decorative ────────────────────────────────────────────────────────────────
function Aurora() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <span style={{ position: "absolute", top: "-16%", right: "-22%", width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle,#ef1d27,transparent 68%)", filter: "blur(95px)", opacity: 0.17, animation: "auroraA 13s ease-in-out infinite" }} />
      <span style={{ position: "absolute", bottom: "-14%", left: "-24%", width: 470, height: 470, borderRadius: "50%", background: "radial-gradient(circle,#0891b2,transparent 68%)", filter: "blur(100px)", opacity: 0.14, animation: "auroraB 16s ease-in-out infinite 2s" }} />
      <span style={{ position: "absolute", top: "18%", left: "-16%", width: 330, height: 330, borderRadius: "50%", background: "radial-gradient(circle,#ffac1d,transparent 68%)", filter: "blur(82px)", opacity: 0.12, animation: "auroraA 11s ease-in-out infinite 5s" }} />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
