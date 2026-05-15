import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/feed/Avatar";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";

type Writer = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
};

export default function FindWritersModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [writers, setWriters]   = useState<Writer[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy]         = useState<Record<string, boolean>>({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    // Fetch active writers — those with at least one published post, ordered by recency
    const { data: recentDrafts } = await supabase
      .from("drafts")
      .select("author_id")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(200);

    const orderedIds = [...new Set(
      (recentDrafts ?? []).map((d: any) => d.author_id).filter(Boolean)
    )] as string[];

    // Supplement with any other profiles if fewer than 20
    let ids = orderedIds.slice(0, 20);
    if (ids.length < 20) {
      const { data: extra } = await supabase
        .from("profiles")
        .select("id")
        .not("handle", "is", null)
        .limit(20);
      const extraIds = (extra ?? []).map((p: any) => p.id).filter((id: string) => !ids.includes(id));
      ids = [...ids, ...extraIds].slice(0, 20);
    }

    if (ids.length === 0) { setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio")
      .in("id", ids);

    const list: Writer[] = (profiles ?? [])
      .filter((p: any) => p.handle && (!user || p.id !== user.id))
      .map((p: any) => ({
        id: p.id,
        handle: p.handle,
        name: p.display_name ?? p.handle,
        avatarUrl: p.avatar_url,
        bio: p.bio,
      }));

    setWriters(list);

    if (user && list.length > 0) {
      const { data: myFollows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", list.map((w) => w.id));
      const map: Record<string, boolean> = {};
      (myFollows ?? []).forEach((r: any) => { map[r.following_id] = true; });
      setFollowed(map);
    }

    setLoading(false);
  };

  const toggle = async (writerId: string) => {
    if (!user) { onClose(); navigate("/auth"); return; }
    setBusy((b) => ({ ...b, [writerId]: true }));
    const isFollowing = !!followed[writerId];
    setFollowed((f) => ({ ...f, [writerId]: !isFollowing }));
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", writerId);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: writerId });
    }
    setBusy((b) => ({ ...b, [writerId]: false }));
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full sm:max-w-[420px] h-[72vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule/50 flex-shrink-0">
          <span className="font-semibold text-[15px] text-ink">find writers</span>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-rule/50 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-paper flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-paper rounded w-28" />
                  <div className="h-2.5 bg-paper/70 rounded w-20" />
                </div>
                <div className="h-6 w-16 bg-paper rounded flex-shrink-0" />
              </div>
            ))
          ) : writers.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="font-serif italic text-ink-muted text-[14px]">no writers yet.</p>
            </div>
          ) : (
            writers.map((w) => (
              <div
                key={w.id}
                className="px-4 py-3 border-b border-rule/50 flex items-center gap-3 hover:bg-paper/50 transition-colors cursor-pointer"
                onClick={() => { onClose(); navigate(`/${w.handle}`); }}
              >
                <Avatar name={w.name} id={w.id} avatarUrl={w.avatarUrl} size={40} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] text-ink truncate flex items-center gap-1">
                    <span className="truncate">{w.name}</span>
                    {isVerified(w.handle) && <VerifiedBadge size={12} />}
                  </div>
                  <div className="font-mono text-[11px] text-ink-muted">@{w.handle}</div>
                  {w.bio && (
                    <p className="font-serif text-[12px] text-ink-dim leading-snug mt-0.5 truncate">{w.bio}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(w.id); }}
                  disabled={busy[w.id]}
                  className={`flex-shrink-0 border font-mono text-[10px] tracking-[0.08em] px-3 py-1 cursor-pointer transition-colors disabled:opacity-50
                    ${followed[w.id]
                      ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                      : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                >
                  {followed[w.id] ? "following" : "follow"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
