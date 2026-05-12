import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { OTPInput, SlotProps } from "input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/draft/Layout";

type Step = "email" | "otp";

export default function Auth() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    // Check if this user has set up a handle yet
    supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.handle) {
          navigate("/");
        } else {
          navigate("/onboarding");
        }
      });
  }, [user, navigate]);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) return setError("enter a valid email.");
    setLoading(true);
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "something went wrong.");
      setStep("otp");
    } catch {
      setError("could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (code: string) => {
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: "magiclink",
    });
    setLoading(false);
    if (err) { setError("invalid or expired code. try again."); setOtp(""); return; }
    // useEffect above handles redirect once user is set
  };

  // Auto-submit once 6 digits are entered
  useEffect(() => {
    if (otp.length === 6) submitOtp(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  return (
    <Layout>
      <div className="max-w-[400px] mx-auto px-6 pt-20 pb-24">

        {step === "email" ? (
          <>
            <Link to="/" className="font-serif text-[13px] text-ink-muted hover:text-ink block mb-12">
              ← drafts.rw
            </Link>
            <h1 className="font-serif text-[32px] font-medium text-ink leading-tight mb-1">
              enter your email
            </h1>
            <p className="text-[14px] text-ink-dim mb-8 leading-relaxed">
              we'll send you a one-time code. no password needed.
            </p>
            <form onSubmit={sendOtp}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full bg-transparent border-b border-rule/80 focus:border-ink py-2.5 text-[15px] font-sans text-ink outline-none placeholder:text-ink-muted/60 transition-colors mb-6 block"
              />
              {error && <p className="font-mono text-[11px] text-[hsl(0_60%_48%)] mb-4">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-terra text-[hsl(38_35%_96%)] border-none py-3 font-mono text-[11px] tracking-[0.14em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "sending…" : "continue →"}
              </button>
            </form>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              className="font-mono text-[12px] text-ink-muted hover:text-ink bg-transparent border-none cursor-pointer p-0 mb-12 block transition-colors"
            >
              ← back
            </button>
            <h1 className="font-serif text-[32px] font-medium text-ink leading-tight mb-1">
              check your email
            </h1>
            <p className="text-[14px] text-ink-dim mb-1 leading-relaxed">
              we sent a code to
            </p>
            <p className="font-mono text-[13px] text-ink mb-8">{email}</p>

            <OTPInput
              maxLength={6}
              value={otp}
              onChange={(v) => setOtp(v.replace(/\D/g, ""))}
              disabled={loading}
              autoFocus
              containerClassName="flex gap-2 mb-6"
              render={({ slots }) => (
                <>
                  {slots.map((slot, idx) => <OtpSlot key={idx} {...slot} />)}
                </>
              )}
            />
            {error && <p className="font-mono text-[11px] text-[hsl(0_60%_48%)] mb-4">{error}</p>}
            {loading && <p className="font-mono text-[11px] text-ink-muted">verifying…</p>}

            <p className="font-mono text-[11px] text-ink-muted mt-6">
              didn't get it?{" "}
              <button
                onClick={sendOtp as never}
                className="text-terra underline underline-offset-2 bg-transparent border-none cursor-pointer font-mono text-[11px] p-0"
              >
                resend
              </button>
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

/** Decorative cell for a single OTP digit — driven entirely by input-otp's state */
function OtpSlot({ char, isActive, hasFakeCaret }: SlotProps) {
  return (
    <div
      className={`flex-1 h-[52px] flex items-center justify-center bg-transparent border-b-2 py-2 text-[22px] font-mono text-ink transition-colors
        ${isActive ? "border-terra" : "border-rule/60"}`}
      style={{ minWidth: 0 }}
    >
      {char}
      {hasFakeCaret && (
        <span className="inline-block w-px h-[26px] bg-ink ml-[1px] animate-pulse" />
      )}
    </div>
  );
}
