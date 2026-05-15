/**
 * ProfileSettingsModal — mobile profile + settings sheet.
 *
 * Opened from the BottomNav profile button.
 * Contains:
 *   - Profile card  →  taps to full profile
 *   - Profile info  :  location, birthday   (requires DB migration – see below)
 *   - Security      :  phone number, create/change password
 *   - Preferences   :  reading font, dark mode
 *   - Sign out
 *
 * DB migration (run once in Supabase SQL editor):
 *   ALTER TABLE public.profiles
 *     ADD COLUMN IF NOT EXISTS location    TEXT,
 *     ADD COLUMN IF NOT EXISTS birthday    TEXT,
 *     ADD COLUMN IF NOT EXISTS phone       TEXT;
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useFont } from "@/hooks/useFont";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Avatar from "@/components/feed/Avatar";

type Props = {
  onClose: () => void;
};

type ExtraFields = {
  location: string;
  birthday: string;
  phone: string;
};

export default function ProfileSettingsModal({ onClose }: Props) {
  const { user, signOut } = useAuth();
  const { profile, refresh } = useProfile();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { font, setFont } = useFont();
  const push = usePushNotifications();
  const navigate = useNavigate();

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "drafter";
  const handle = profile?.handle ?? null;

  // Extra profile fields (need DB columns – fail gracefully if absent)
  const [extra, setExtra] = useState<ExtraFields>({ location: "", birthday: "", phone: "" });
  const [extraBusy, setExtraBusy] = useState(false);
  const [extraSaved, setExtraSaved] = useState(false);

  // Password creation
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Load extra fields from profile (if columns exist)
  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setExtra({
      location: p.location ?? "",
      birthday: p.birthday ?? "",
      phone: p.phone ?? "",
    });
  }, [profile]);

  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goProfile = () => {
    onClose();
    if (handle) navigate(`/${handle}`);
    else navigate("/onboarding");
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate("/");
  };

  const saveExtra = async () => {
    if (!user) return;
    setExtraBusy(true);
    try {
      await (supabase.from("profiles") as any)
        .update({
          location: extra.location || null,
          birthday: extra.birthday || null,
          phone: extra.phone || null,
        })
        .eq("id", user.id);
      await refresh();
      setExtraSaved(true);
      setTimeout(() => setExtraSaved(false), 2000);
    } catch {}
    setExtraBusy(false);
  };

  const savePassword = async () => {
    if (password !== passwordConfirm) {
      setPasswordMsg({ ok: false, text: "passwords don't match." });
      return;
    }
    if (password.length < 8) {
      setPasswordMsg({ ok: false, text: "at least 8 characters." });
      return;
    }
    setPasswordBusy(true);
    setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPasswordMsg({ ok: false, text: error.message });
    } else {
      setPasswordMsg({ ok: true, text: "password saved." });
      setPassword("");
      setPasswordConfirm("");
      setTimeout(() => { setPasswordMsg(null); setShowPassword(false); }, 2000);
    }
    setPasswordBusy(false);
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full sm:max-w-[420px] max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Drag handle / close row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rule/50 flex-shrink-0">
          <span className="font-semibold text-[14px] text-ink">profile & settings</span>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1">
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* ── Profile card ── */}
          {user ? (
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-paper/60 transition-colors border-b border-rule/50"
              onClick={goProfile}
            >
              <Avatar name={displayName} id={user.id} avatarUrl={profile?.avatar_url} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] text-ink truncate">{displayName}</div>
                <div className="font-mono text-[11px] text-ink-muted">{handle ? `@${handle}` : "finish setup →"}</div>
              </div>
              <i className="ti ti-chevron-right text-[15px] text-ink-muted flex-shrink-0" />
            </div>
          ) : (
            <div className="px-5 py-5 border-b border-rule/50">
              <p className="font-serif italic text-ink-muted text-[14px] mb-3">you're not signed in.</p>
              <button
                onClick={() => { onClose(); navigate("/auth"); }}
                className="bg-terra text-[hsl(38_35%_96%)] border-none px-5 py-2 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90"
              >
                sign in
              </button>
            </div>
          )}

          {user && (
            <>
              {/* ── Profile info ── */}
              <Section label="profile info">
                <SheetRow icon="ti-user-edit" label="edit profile" onClick={goProfile} chevron />
                <div className="px-5 pb-4 flex flex-col gap-3 pt-1">
                  <Field
                    label="location"
                    icon="ti-map-pin"
                    type="text"
                    placeholder="e.g. Lagos, Nigeria"
                    value={extra.location}
                    onChange={(v) => setExtra((x) => ({ ...x, location: v }))}
                  />
                  <Field
                    label="birthday"
                    icon="ti-calendar"
                    type="date"
                    placeholder=""
                    value={extra.birthday}
                    onChange={(v) => setExtra((x) => ({ ...x, birthday: v }))}
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={saveExtra}
                      disabled={extraBusy}
                      className="bg-terra/10 text-terra border border-terra/30 px-4 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer hover:bg-terra/20 transition-colors disabled:opacity-40"
                    >
                      {extraSaved ? "saved ✓" : extraBusy ? "saving…" : "save info"}
                    </button>
                  </div>
                </div>
              </Section>

              {/* ── Security ── */}
              <Section label="account & security">
                <div className="px-5 pb-2 pt-1 flex flex-col gap-3">
                  <Field
                    label="phone number"
                    icon="ti-device-mobile"
                    type="tel"
                    placeholder="+1 234 567 8900"
                    value={extra.phone}
                    onChange={(v) => setExtra((x) => ({ ...x, phone: v }))}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={saveExtra}
                      disabled={extraBusy}
                      className="bg-terra/10 text-terra border border-terra/30 px-4 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer hover:bg-terra/20 transition-colors disabled:opacity-40"
                    >
                      {extraSaved ? "saved ✓" : extraBusy ? "saving…" : "save"}
                    </button>
                  </div>
                </div>

                {/* Password accordion */}
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-paper/50 transition-colors bg-transparent border-none border-t border-rule/30 cursor-pointer"
                >
                  <i className="ti ti-lock text-[17px] text-ink-muted flex-shrink-0" />
                  <span className="text-[13px] text-ink flex-1 text-left">create / change password</span>
                  <i className={`ti ${showPassword ? "ti-chevron-up" : "ti-chevron-down"} text-[14px] text-ink-muted`} />
                </button>
                {showPassword && (
                  <div className="px-5 pb-4 flex flex-col gap-3 border-t border-rule/30">
                    <div className="pt-3">
                      <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-muted block mb-1">new password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="minimum 8 characters"
                        className="w-full bg-paper border border-rule/50 px-3 py-2 text-[13px] text-ink outline-none focus:border-terra/50 font-sans"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-muted block mb-1">confirm password</label>
                      <input
                        type="password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        placeholder="repeat password"
                        className="w-full bg-paper border border-rule/50 px-3 py-2 text-[13px] text-ink outline-none focus:border-terra/50 font-sans"
                      />
                    </div>
                    {passwordMsg && (
                      <p className={`font-mono text-[11px] ${passwordMsg.ok ? "text-[hsl(140_45%_38%)]" : "text-[hsl(0_55%_48%)]"}`}>
                        {passwordMsg.text}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        onClick={savePassword}
                        disabled={passwordBusy || !password}
                        className="bg-terra text-[hsl(38_35%_96%)] border-none px-5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-35"
                      >
                        {passwordBusy ? "saving…" : "set password"}
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              {/* ── Notifications ── */}
              <Section label="notifications">
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <i className="ti ti-bell text-[17px] text-ink-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[13px] text-ink block">push notifications</span>
                      {push.isDenied && (
                        <span className="font-mono text-[10px] text-[hsl(0_55%_48%)]">blocked in browser settings</span>
                      )}
                      {!push.isSupported && !push.isDenied && (
                        <span className="font-mono text-[10px] text-ink-muted">not supported on this browser</span>
                      )}
                    </div>
                  </div>
                  {push.isSupported && !push.isDenied && (
                    <button
                      onClick={push.toggle}
                      disabled={push.isLoading}
                      className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0 disabled:opacity-50
                        ${push.isSubscribed ? "bg-terra" : "bg-rule/60"}`}
                      aria-label="toggle push notifications"
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform ${push.isSubscribed ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  )}
                </div>
              </Section>

              {/* ── Preferences ── */}
              <Section label="preferences">
                {/* Reading font */}
                <div className="px-5 py-3 flex items-center justify-between border-b border-rule/30">
                  <div className="flex items-center gap-3">
                    <i className="ti ti-typography text-[17px] text-ink-muted" />
                    <span className="text-[13px] text-ink">reading font</span>
                  </div>
                  <div className="flex border border-rule/50 overflow-hidden">
                    <FontBtn label="Serif" active={font === "serif"} onClick={() => setFont("serif")} />
                    <FontBtn label="Sans"  active={font === "sans"}  onClick={() => setFont("sans")} />
                  </div>
                </div>

                {/* Dark mode */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <i className={`ti ${isDark ? "ti-moon" : "ti-sun"} text-[17px] text-ink-muted`} />
                    <span className="text-[13px] text-ink">dark mode</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0 ${isDark ? "bg-terra" : "bg-rule/60"}`}
                    aria-label="toggle dark mode"
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform ${isDark ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              </Section>

              {/* ── Sign out ── */}
              <div className="border-t border-rule/50 pb-2">
                <button
                  onClick={handleSignOut}
                  className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-paper/60 transition-colors bg-transparent border-none cursor-pointer text-left"
                >
                  <i className="ti ti-logout text-[17px] text-[hsl(0_55%_48%)]" />
                  <span className="text-[13px] text-[hsl(0_55%_48%)]">sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule/50">
      <p className="px-5 pt-4 pb-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-ink-muted">{label}</p>
      {children}
    </section>
  );
}

function SheetRow({
  icon, label, onClick, chevron, danger,
}: {
  icon: string; label: string; onClick: () => void; chevron?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-5 py-3 flex items-center gap-3 hover:bg-paper/50 transition-colors bg-transparent border-none cursor-pointer text-left"
    >
      <i className={`ti ${icon} text-[17px] ${danger ? "text-[hsl(0_55%_48%)]" : "text-ink-muted"} flex-shrink-0`} />
      <span className={`text-[13px] flex-1 ${danger ? "text-[hsl(0_55%_48%)]" : "text-ink"}`}>{label}</span>
      {chevron && <i className="ti ti-chevron-right text-[14px] text-ink-muted" />}
    </button>
  );
}

function Field({
  label, icon, type, placeholder, value, onChange,
}: {
  label: string; icon: string; type: string;
  placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-muted flex items-center gap-1.5 mb-1">
        <i className={`ti ${icon} text-[12px]`} />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-paper border border-rule/50 px-3 py-2 text-[13px] text-ink outline-none focus:border-terra/50 font-sans placeholder:text-ink-muted/50"
      />
    </div>
  );
}

function FontBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-mono border-none cursor-pointer transition-colors ${
        active ? "bg-terra text-[hsl(38_35%_96%)]" : "bg-transparent text-ink-muted hover:text-ink hover:bg-paper/60"
      }`}
    >
      {label}
    </button>
  );
}
