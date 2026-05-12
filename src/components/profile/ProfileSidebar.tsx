import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/feed/Avatar";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";

type Writer = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/** Shown in the right column on the profile page */
export default function ProfileSidebar({ excludeId }: { excludeId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search,   setSearch]   = useState("");
  const [writers,  setWriters]  = useState<Writer[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy,     setBusy]     = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSuggested();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, excludeId]);

  const loadSuggested = async () => {
    // Grab recent active writers (those who've posted), excluding the viewed profile and self
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .not("handle", "is", null)
      .limit(10);

    let list = (data ?? []) as Writer[];

    // Exclude the profile being viewed and the current user
    if (excludeId) list = list.filter(w => w.id !== excludeId);
    if (user)      list = list.filter(w => w.id !== user.id);

    list = list.slice(0, 5);
    setWriters(list);

    // Load follow states
    if (user && list.length > 0) {
      const ids = list.map(w => w.id);
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", ids);
      const map: Record<string, boolean> = {};
      (follows ?? []).forEach((r: any) => { map[r.following_id] = true; });
      setFollowed(map);
    }
  };

  const toggle = async (writerId: string) => {
    if (!user) { navigate("/auth"); return; }
    setBusy(b => ({ ...b, [writerId]: true }));
    const isFollowing = !!followed[writerId];
    setFollowed(f => ({ ...f, [writerId]: !isFollowing }));
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", writerId);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: writerId });
    }
    setBusy(b => ({ ...b, [writerId]: false }));
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <div className="py-4 pl-5 pr-3 sticky top-0 h-screen overflow-y-auto">
      {/* Search — navigates to /search */}
      <div className="relative mb-6">
        <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearch}
          className="w-full bg-paper border border-rule/50 py-2 pl-9 pr-3 text-[13px] font-sans text-ink outline-none focus:border-terra transition-colors placeholder:text-ink-muted"
          placeholder="search drafts.rw"
        />
      </div>

      {/* Suggested drafters */}
      {writers.length > 0 && (
        <div>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-3 block">
            drafters
          </span>
          {writers.map(w => {
            const name   = w.display_name ?? w.handle ?? "drafter";
            const handle = w.handle ?? "";
            return (
              <div
                key={w.id}
                className="flex items-center gap-2.5 py-2.5 border-b border-rule/40 last:border-none cursor-pointer hover:bg-paper/60 -mx-1 px-1 rounded transition-colors"
                onClick={() => navigate(`/${handle}`)}
              >
                <Avatar id={w.id} name={name} avatarUrl={w.avatar_url} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate leading-tight flex items-center gap-1">
                    <span className="truncate">{name}</span>
                    {isVerified(handle) && <VerifiedBadge size={12} />}
                  </div>
                  {handle && <div className="font-mono text-[11px] text-ink-muted">@{handle}</div>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); toggle(w.id); }}
                  disabled={busy[w.id]}
                  className={`border text-[10px] font-mono tracking-[0.08em] px-3 py-1 flex-shrink-0 cursor-pointer transition-colors disabled:opacity-50
                    ${followed[w.id]
                      ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                      : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                >
                  {followed[w.id] ? "following" : "follow"}
                </button>
              </div>
            );
          })}
          <button
            className="font-mono text-[10px] text-terra mt-3 bg-transparent border-none cursor-pointer hover:underline p-0"
            onClick={() => navigate("/search")}
          >
            find more writers →
          </button>
        </div>
      )}
    </div>
  );
}
