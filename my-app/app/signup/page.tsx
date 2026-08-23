"use client";

import { useState, useCallback, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1); // step 1: details, step 2: username
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "taken" | "ok">("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Check username availability on blur ────────────────────────────────────
  async function checkUsername(val: string) {
    if (!val || val.length < 3) { setUsernameStatus("idle"); return; }
    setUsernameStatus("checking");
    const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(val)}`);
    const data = await res.json();
    setUsernameStatus(data.taken ? "taken" : "ok");
  }

  async function handleSignup() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, username }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }

    // Auto sign-in after successful signup
    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) { setError("Account created but sign-in failed. Try logging in."); return; }
    router.replace("/");
  }

  const usernameHint =
    usernameStatus === "checking" ? "Checking…" :
    usernameStatus === "taken"    ? "⚠ Already taken" :
    usernameStatus === "ok"       ? "✓ Available" : "";

  const usernameHintColor =
    usernameStatus === "taken" ? "#f87171" :
    usernameStatus === "ok"    ? "#34d399" : "#9ca3af";

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.10) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, rgba(0,245,255,0.07) 0%, transparent 50%), #0c0c0f",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-geist-sans)", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            position: "relative", width: 64, height: 64, margin: "0 auto 12px",
            borderRadius: 18, overflow: "hidden",
            boxShadow: "0 0 28px rgba(109, 40, 217, 0.5), 0 0 60px rgba(0,245,255,0.15)"
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kyapehnu-icon.png" alt="KyaPehnu" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <h1 style={{
            margin: "8px 0 4px", fontSize: "1.8rem", fontWeight: 800, letterSpacing: "-0.04em",
            background: "linear-gradient(135deg, #f4f4f6 30%, #a78bfa 70%, #60a5fa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>KyaPehnu</h1>
          <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: 0 }}>
            Create your wardrobe profile
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              width: s === step ? 24 : 8, height: 8, borderRadius: 99,
              background: s === step ? "var(--accent, #a78bfa)" : "rgba(255,255,255,0.12)",
              transition: "width 0.3s ease, background 0.3s ease",
            }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(18,18,22,0.80)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          padding: "32px 28px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
        }}>

          {step === 1 && (
            <>
              <h2 style={{ margin: "0 0 22px", fontSize: "1.15rem", fontWeight: 700, color: "#f4f4f6" }}>
                Create your account
              </h2>

              {/* Google */}
              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                style={{
                  width: "100%", padding: "11px 16px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)", color: "#f4f4f6",
                  fontSize: "0.88rem", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 10, marginBottom: 20, transition: "background 0.2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>or with email</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              </div>

              <form onSubmit={e => e.preventDefault()} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "YOUR NAME", value: name, onChange: setName, type: "text", placeholder: "Rahul Sharma", autoComplete: "name" },
                  { label: "EMAIL",     value: email, onChange: setEmail, type: "email", placeholder: "you@example.com", autoComplete: "email" },
                  { label: "PASSWORD",  value: password, onChange: setPassword, type: "password", placeholder: "Min. 8 characters", autoComplete: "new-password" },
                ].map(({ label, value, onChange, type, placeholder, autoComplete }) => (
                  <div key={label}>
                    <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600,
                      color: "#9ca3af", marginBottom: 6, letterSpacing: "0.04em" }}>
                      {label}
                    </label>
                    <input
                      type={type} value={value}
                      onChange={e => onChange(e.target.value)}
                      placeholder={placeholder} required autoComplete={autoComplete}
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
                ))}

                <button
                  onClick={() => {
                    if (!name || !email || !password) {
                      setError("Please fill all fields."); return;
                    }
                    if (!email.includes("@") || !email.includes(".")) {
                      setError("Please provide a valid email address."); return;
                    }
                    if (password.length < 8) {
                      setError("Password must be at least 8 characters long."); return;
                    }
                    setError(""); setStep(2);
                  }}
                  style={{
                    padding: "11px 0", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)",
                    color: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
                    boxShadow: "0 0 20px rgba(167,139,250,0.30)", marginTop: 4,
                  }}
                >
                  Continue →
                </button>

                {error && (
                  <p style={{ fontSize: "0.78rem", color: "#f87171",
                    background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                    borderRadius: 8, padding: "8px 12px", margin: 0 }}>
                    {error}
                  </p>
                )}
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} style={{
                background: "none", border: "none", color: "#9ca3af",
                fontSize: "0.82rem", cursor: "pointer", padding: "0 0 16px",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                ← Back
              </button>

              <h2 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700, color: "#f4f4f6" }}>
                Pick your username
              </h2>
              <p style={{ margin: "0 0 22px", fontSize: "0.78rem", color: "#9ca3af" }}>
                This must be unique — it defines your wardrobe identity.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600,
                  color: "#9ca3af", marginBottom: 6, letterSpacing: "0.04em" }}>
                  USERNAME
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    color: "#6b7280", fontSize: "0.88rem", pointerEvents: "none" }}>@</span>
                  <input
                    type="text" value={username}
                    onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setUsernameStatus("idle"); }}
                    onBlur={() => checkUsername(username)}
                    placeholder="rahul_sharma" maxLength={20}
                    style={{
                      width: "100%", padding: "10px 14px 10px 28px", borderRadius: 10,
                      border: `1px solid ${usernameStatus === "taken" ? "rgba(248,113,113,0.5)" : usernameStatus === "ok" ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.10)"}`,
                      background: "rgba(255,255,255,0.04)", color: "#f4f4f6",
                      fontSize: "0.88rem", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                {usernameHint && (
                  <p style={{ margin: "5px 0 0", fontSize: "0.73rem", color: usernameHintColor }}>
                    {usernameHint}
                  </p>
                )}
                <p style={{ margin: "5px 0 0", fontSize: "0.70rem", color: "#6b7280" }}>
                  3–20 chars · lowercase letters, numbers, underscores only
                </p>
              </div>

              {error && (
                <p style={{ fontSize: "0.78rem", color: "#f87171",
                  background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                  borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSignup}
                disabled={loading || usernameStatus === "taken" || usernameStatus === "checking"}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
                  background: loading || usernameStatus === "taken"
                    ? "rgba(167,139,250,0.30)"
                    : "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)",
                  color: "#fff", fontSize: "0.9rem", fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "0 0 20px rgba(167,139,250,0.25)",
                }}
              >
                {loading ? "Creating account…" : "Create Account 🎉"}
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.82rem", color: "#6b7280" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#a78bfa", fontWeight: 600, textDecoration: "none" }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
