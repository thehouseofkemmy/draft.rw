import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Avatar from "@/components/feed/Avatar";
import { VerifiedBadge } from "@/components/feed/VerifiedBadge";

const HANDLE_RE = /^[a-z0-9_]{2,24}$/;

type Step = "handle" | "follow";

type Suggested = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_official?: boolean;
};

export default function Onboarding() {
  const { user } = useAuth();
  const { refresh: refreshMyProfile } = useProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("handle");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Follow step
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    // Pre-fill display name from email
    setDisplayName(user.email?.split("@")[0] ?? "");
    // Pre-fill handle suggestion
    const suggestion = (user.email?.split("@")[0] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 24);
    setHandle(suggestion);
  }, [user, navigate]);

  // Debounced uniqueness check
  useEffect(() => {
    if (!handle || !HANDLE_RE.test(handle)) { setError(""); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .neq("id", user?.id ?? "")
        .maybeSingle();
      setChecking(false);
      setError(data ? "handle taken. try another." : "");
    }, 400);
    return () => clearTimeout(t);
  }, [handle, user]);

  const handleChange = (v: string) => {
    setHandle(v.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24));
  };

  const saveHandle = async () => {
    if (!user) return;
    if (!HANDLE_RE.test(handle)) return setError("2–24 chars: letters, numbers, underscore.");
    if (error) return;
    setSaving(true);

    const { error: err } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, handle, display_name: displayName.trim() || handle },
        { onConflict: "id" },
      );
    setSaving(false);
    if (err) { setError(err.message); return; }

    // Fire-and-forget welcome email
    fetch("/api/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, handle, displayName: displayName.trim() || handle }),
    }).catch(() => {});

    // CRITICAL: refresh the global profile cache so LeftNav / Profile / etc. see the new handle.
    // Without this, navigating away from onboarding sends the user right back here.
    await refreshMyProfile();

    // Move to follow step
    await loadSuggested();
    setStep("follow");
  };

  // Load suggested drafters: @drafts first (pre-followed), then most active others
  const loadSuggested = async () => {
    if (!user) return;

    // The official account
    const { data: official } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio")
      .eq("handle", "drafts")
      .maybeSingle();

    // Other drafters with the most recent published activity (top 8)
    const { data: recentDrafts } = await supabase
      .from("drafts")
      .select("author_id")
      .eq("published", true)
      .is("reply_to_id" as any, null)
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);

    const otherIds = [...new Set(
      (recentDrafts ?? [])
        .map((d: any) => d.author_id)
        .filter(Boolean)
        .filter((id: string) => id !== official?.id)
    )].slice(0, 8) as string[];

    let others: Suggested[] = [];
    if (otherIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio")
        .in("id", otherIds);
      others = (profs ?? []) as Suggested[];
    }

    const list: Suggested[] = [];
    if (official) {
      list.push({ ...(official as Suggested), is_official: true });
      // Pre-follow the official account
      setFollowed((f) => ({ ...f, [official.id]: true }));
      await supabase.from("follows").upsert(
        { follower_id: user.id, following_id: official.id },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      );
    }
    list.push(...others);
    setSuggested(list);
  };

  const toggleFollow = async (id: string) => {
    if (!user) return;
    const next = !followed[id];
    setFollowed((f) => ({ ...f, [id]: next }));
    if (next) {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: id });
    } else {
      await supabase.from("follows").delete()
        .eq("follower_id", user.id).eq("following_id", id);
    }
  };

  const finishOnboarding = async () => {
    setFinishing(true);
    // Make absolutely sure the profile cache is fresh before leaving
    await refreshMyProfile();
    navigate("/", { replace: true });
  };

  const followingCount = Object.values(followed).filter(Boolean).length;
  const canFinish = followingCount >= 1;
  const valid = HANDLE_RE.test(handle) && !error && !checking;

  // ────────────────────────────── HANDLE STEP
  if (step === "handle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-[400px]">
          <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-terra mb-8">
            drafts.rw
          </p>
          <h1 className="font-serif text-[30px] font-medium text-ink leading-tight mb-1">
            choose your handle
          </h1>
          <p className="text-[14px] text-ink-dim mb-8 leading-relaxed">
            this is how others will find you. you can change it later.
          </p>

          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted block mb-1.5">
            handle
          </label>
          <div className="flex items-center border-b border-rule/80 focus-within:border-ink mb-1 transition-colors">
            <span className="font-mono text-[15px] text-ink-muted pr-0.5">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="yourhandle"
              autoFocus
              className="flex-1 bg-transparent outline-none font-mono text-[15px] text-ink py-2.5 placeholder:text-ink-muted/50"
            />
            {checking && (
              <span className="font-mono text-[10px] text-ink-muted">checking…</span>
            )}
            {!checking && handle && HANDLE_RE.test(handle) && !error && (
              <i className="ti ti-check text-[14px] text-[hsl(140_45%_38%)]" />
            )}
          </div>
          {error && (
            <p className="font-mono text-[10px] text-[hsl(0_60%_48%)] mb-4">{error}</p>
          )}
          {!error && handle && !HANDLE_RE.test(handle) && (
            <p className="font-mono text-[10px] text-ink-muted mb-4">
              2–24 chars: letters, numbers, underscores only.
            </p>
          )}

          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted block mb-1.5 mt-6">
            display name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
            maxLength={60}
            className="w-full bg-transparent border-b border-rule/80 focus:border-ink py-2.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted/50 transition-colors mb-8 block"
          />

          <button
            onClick={saveHandle}
            disabled={!valid || saving}
            className="w-full bg-terra text-[hsl(38_35%_96%)] border-none py-3 font-mono text-[11px] tracking-[0.14em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "saving…" : "continue →"}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────── FOLLOW STEP
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[440px]">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-terra mb-8">
          drafts.rw
        </p>
        <h1 className="font-serif text-[30px] font-medium text-ink leading-tight mb-1">
          follow your first writer
        </h1>
        <p className="text-[14px] text-ink-dim mb-8 leading-relaxed">
          your feed comes alive when you follow people. start with at least one —
          you can always discover more later.
        </p>

        <div className="border-t border-rule/40">
          {suggested.length === 0 && (
            <p className="font-serif italic text-ink-muted text-[14px] py-8 text-center">
              no drafters yet — you're early. come back soon.
            </p>
          )}
          {suggested.map((s) => {
            const name   = s.display_name ?? s.handle ?? "drafter";
            const isFollowing = !!followed[s.id];
            return (
              <div
                key={s.id}
                className="flex items-start gap-3 py-4 border-b border-rule/40"
              >
                <Avatar id={s.id} name={name} avatarUrl={s.avatar_url} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] text-ink truncate">
                      {name}
                    </span>
                    {s.is_official && <VerifiedBadge size={15} />}
                  </div>
                  {s.handle && (
                    <div className="font-mono text-[11px] text-ink-muted">@{s.handle}</div>
                  )}
                  {s.bio && (
                    <p className="font-serif text-[12px] text-ink-dim leading-snug mt-1 line-clamp-2">
                      {s.bio}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleFollow(s.id)}
                  className={`flex-shrink-0 border text-[10px] font-mono tracking-[0.08em] uppercase px-3 py-1.5 cursor-pointer transition-colors mt-0.5
                    ${isFollowing
                      ? "bg-transparent border-rule/60 text-ink hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                      : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                >
                  {isFollowing ? "following" : "follow"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="font-mono text-[11px] text-ink-muted mt-6 mb-3">
          following <strong className="text-ink">{followingCount}</strong>
          {followingCount < 1 ? " — follow at least one to continue" : ""}
        </p>

        <button
          onClick={finishOnboarding}
          disabled={!canFinish || finishing}
          className="w-full bg-terra text-[hsl(38_35%_96%)] border-none py-3 font-mono text-[11px] tracking-[0.14em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {finishing ? "loading…" : "let's go →"}
        </button>
      </div>
    </div>
  );
}
