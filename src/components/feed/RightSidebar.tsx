import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/feed/Avatar";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";
import FindWritersModal from "@/components/feed/FindWritersModal";

type Writer = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
};

export default function RightSidebar({ onSearch }: { onSearch: (q: string) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [writers, setWriters]         = useState<Writer[]>([]);
  const [followed, setFollowed]       = useState<Record<string, boolean>>({});
  const [busy, setBusy]               = useState<Record<string, boolean>>({});
  const [showModal, setShowModal]     = useState(false);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    loadWriters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadWriters = async () => {
    // Get most recently active writers
    const { data: recentDrafts } = await supabase
      .from("drafts")
      .select("author_id")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(100);

    let ids = [...new Set(
      (recentDrafts ?? []).map((d: any) => d.author_id).filter(Boolean)
    )] as string[];

    // Supplement to ensure at least 5
    if (ids.length < 5) {
      const { data: extra } = await supabase
        .from("profiles")
        .select("id")
        .not("handle", "is", null)
        .limit(10);
      const extraIds = (extra ?? []).map((p: any) => p.id).filter((id: string) => !ids.includes(id));
      ids = [...ids, ...extraIds];
    }

    // Exclude self
    if (user) ids = ids.filter((id) => id !== user.id);
    ids = ids.slice(0, 5);

    if (ids.length === 0) return;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .in("id", ids);

    const list: Writer[] = (profiles ?? [])
      .filter((p: any) => p.handle)
      .map((p: any) => ({
        id: p.id,
        handle: p.handle,
        name: p.display_name ?? p.handle,
        avatarUrl: p.avatar_url,
      }));

    setWriters(list);

    // Load follow states
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
    if (!user) { navigate("/auth"); return; }
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
    <>
      <div className="py-4 pl-5 pr-3 sticky top-0 h-screen overflow-y-auto">
        {/* Search */}
        <div className="relative mb-6">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted pointer-events-none" />
          <input
            className="w-full bg-paper border border-rule/50 py-2 pl-9 pr-3 text-[13px] font-sans text-ink outline-none focus:border-terra transition-colors placeholder:text-ink-muted"
            placeholder="search"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* Drafters */}
        <div>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-3 block">
            drafters
          </span>

          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 py-2.5 border-b border-rule/40 last:border-none animate-pulse">
                <div className="w-[34px] h-[34px] rounded-full bg-paper flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-paper rounded w-24" />
                  <div className="h-2 bg-paper/70 rounded w-16" />
                </div>
                <div className="h-6 w-14 bg-paper rounded flex-shrink-0" />
              </div>
            ))
          ) : writers.length > 0 ? (
            <>
            {writers.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-2.5 py-2.5 border-b border-rule/40 last:border-none cursor-pointer hover:bg-paper/60 -mx-1 px-1 rounded transition-colors"
                onClick={() => navigate(`/${w.handle}`)}
              >
                <Avatar id={w.id} name={w.name} avatarUrl={w.avatarUrl} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate leading-tight flex items-center gap-1">
                    <span className="truncate">{w.name}</span>
                    {isVerified(w.handle) && <VerifiedBadge size={12} />}
                  </div>
                  <div className="font-mono text-[11px] text-ink-muted">@{w.handle}</div>
                </div>
                {(!user || user.id !== w.id) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(w.id); }}
                    disabled={busy[w.id]}
                    className={`border text-[10px] font-mono tracking-[0.08em] px-3 py-1 flex-shrink-0 cursor-pointer transition-colors disabled:opacity-50
                      ${followed[w.id]
                        ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                        : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                  >
                    {followed[w.id] ? "following" : "follow"}
                  </button>
                )}
              </div>
            ))}

            <button
              className="font-mono text-[10px] text-terra mt-3 bg-transparent border-none cursor-pointer hover:underline p-0"
              onClick={() => setShowModal(true)}
            >
              find more writers →
            </button>
            </>
          ) : null}
        </div>
      </div>

      {showModal && <FindWritersModal onClose={() => setShowModal(false)} />}
    </>
  );
}
