"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(params.get("callbackUrl") ?? "/");
    }
  }, [status, router, params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    // Custom Validation
    if (!email || !email.includes("@") || !email.includes(".")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (!password) {
      setError("Please provide your password.");
      return;
    }

    setLoading(true);
    const res = await signIn("credentials", {
      email, password, redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.replace(params.get("callbackUrl") ?? "/");
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.10) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, rgba(0,245,255,0.07) 0%, transparent 50%), #0c0c0f",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-geist-sans)",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div suppressHydrationWarning style={{
            position: "relative", width: 64, height: 64, margin: "0 auto 12px",
            borderRadius: 18, overflow: "hidden",
            boxShadow: "0 0 28px rgba(109, 40, 217, 0.5), 0 0 60px rgba(0,245,255,0.15)"
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img suppressHydrationWarning src="/kyapehnu-icon.png" alt="KyaPehnu" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <h1 style={{
            margin: "8px 0 4px",
            fontSize: "1.8rem", fontWeight: 800,
            letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #f4f4f6 30%, #a78bfa 70%, #60a5fa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>KyaPehnu</h1>
          <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: 0 }}>
            Your AI-powered wardrobe companion
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(18,18,22,0.80)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "32px 28px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
        }}>
          <h2 style={{ margin: "0 0 22px", fontSize: "1.15rem", fontWeight: 700, color: "#f4f4f6" }}>
            Welcome back
          </h2>

          {/* Google button */}
          <button
            onClick={() => signIn("google", { callbackUrl: params.get("callbackUrl") ?? "/" })}
            style={{
              width: "100%", padding: "11px 16px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#f4f4f6", fontSize: "0.88rem", fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10, marginBottom: 20,
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
          >
            {/* Google G SVG */}
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600,
                color: "#9ca3af", marginBottom: 6, letterSpacing: "0.04em" }}>
                EMAIL
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)", color: "#f4f4f6",
                  fontSize: "0.88rem", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => { e.target.style.borderColor = "rgba(167,139,250,0.5)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600,
                color: "#9ca3af", marginBottom: 6, letterSpacing: "0.04em" }}>
                PASSWORD
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)", color: "#f4f4f6",
                  fontSize: "0.88rem", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => { e.target.style.borderColor = "rgba(167,139,250,0.5)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
            </div>

            {error && (
              <div style={{ fontSize: "0.78rem", color: "#f87171",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 8, padding: "8px 12px" }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                padding: "11px 0", borderRadius: 12, border: "none",
                background: loading
                  ? "rgba(167,139,250,0.35)"
                  : "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)",
                color: "#fff", fontSize: "0.9rem", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 0 20px rgba(167,139,250,0.30)",
                transition: "all 0.2s",
                marginTop: 4,
              }}
            >
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.82rem", color: "#6b7280" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color: "#a78bfa", fontWeight: 600, textDecoration: "none" }}>
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0c0c0f",
        color: "#8b8b9a"
      }}>
        Loading...
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

