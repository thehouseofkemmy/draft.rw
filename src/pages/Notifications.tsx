import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import Layout from "@/components/draft/Layout";
import Avatar from "@/components/feed/Avatar";

type Notif = {
  id: string;
  type: "like" | "comment" | "follow" | "repost";
  read: boolean;
  created_at: string;
  draft_id: string | null;
  from_user_id: string | null;
  from_profile: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
  draft_content: string | null;
};

const TYPE_ICON: Record<string, string> = {
  like:    "ti-heart",
  comment: "ti-message-circle",
  follow:  "ti-user-plus",
  repost:  "ti-repeat",
};

const TYPE_COLOR: Record<string, string> = {
  like:    "hsl(0 60% 52%)",
  comment: "hsl(196 36% 35%)",
  follow:  "hsl(15 54% 37%)",
  repost:  "hsl(140 45% 38%)",
};

const TYPE_TEXT: Record<string, string> = {
  like:    "liked your piece",
  comment: "replied to your piece",
  follow:  "followed you",
  repost:  "reposted your piece",
};

// Module-level cache — survives in-app navigation, wiped on hard refresh
const cache: { notifs: Notif[]; scroll: number; loadedAt: number } = {
  notifs: [],
  scroll: 0,
  loadedAt: 0,
};

export default function Notifications() {
  const { user } = useAuth();
  const { markAllRead } = useNotifications();
  const navigate = useNavigate();
  const hasCache = cache.notifs.length > 0;
  const [notifs, setNotifs] = useState<Notif[]>(cache.notifs);
  const [loading, setLoading] = useState(!hasCache);

  // Restore scroll before paint, save scroll continuously
  useLayoutEffect(() => {
    if (hasCache) window.scrollTo({ top: cache.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onScroll = () => { cache.scroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { cache.notifs = notifs; }, [notifs]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    const stale = Date.now() - cache.loadedAt > 60_000;
    if (!hasCache || stale) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    if (!user) return;
    if (cache.notifs.length === 0) setLoading(true); // only show skeleton on true cold start

    // Step 1: fetch raw notifications (no embedded joins — they silently fail)
    const { data: rawNotifs } = await supabase
      .from("notifications")
      .select("id, type, read, created_at, draft_id, from_user_id")
      .eq("to_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);

    const raw = (rawNotifs ?? []) as Array<{
      id: string;
      type: "like" | "comment" | "follow" | "repost";
      read: boolean;
      created_at: string;
      draft_id: string | null;
      from_user_id: string | null;
    }>;

    if (raw.length === 0) {
      setNotifs([]);
      setLoading(false);
      cache.loadedAt = Date.now();
      markAllRead();
      return;
    }

    // Step 2: batch-fetch sender profiles + referenced draft content in parallel
    const fromIds  = [...new Set(raw.map((n) => n.from_user_id).filter(Boolean))] as string[];
    const draftIds = [...new Set(raw.map((n) => n.draft_id).filter(Boolean))] as string[];

    const [profilesRes, draftsRes] = await Promise.all([
      fromIds.length > 0
        ? supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", fromIds)
        : Promise.resolve({ data: [] }),
      draftIds.length > 0
        ? supabase.from("drafts").select("id, content").in("id", draftIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, { display_name: string | null; handle: string | null; avatar_url: string | null }> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    const draftMap: Record<string, string> = {};
    (draftsRes.data ?? []).forEach((d: any) => { draftMap[d.id] = d.content; });

    const mapped: Notif[] = raw.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      created_at: n.created_at,
      draft_id: n.draft_id,
      from_user_id: n.from_user_id,
      from_profile: n.from_user_id ? profileMap[n.from_user_id] ?? null : null,
      draft_content: n.draft_id ? draftMap[n.draft_id] ?? null : null,
    }));

    setNotifs(mapped);
    setLoading(false);
    cache.loadedAt = Date.now();

    // Mark all read
    markAllRead();
  };

  if (!user) return null;

  return (
    <Layout>
      {/* Header */}
      <div className="sticky top-0 bg-background z-[5] border-b border-rule/50 px-4 py-3 flex items-center gap-3">
        <button
          className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1 -ml-1"
          onClick={() => navigate(-1)}
        >
          <i className="ti ti-arrow-left text-[20px]" />
        </button>
        <span className="font-semibold text-[17px] text-ink">notifications</span>
      </div>

      {loading ? (
        <div>
          {[
            { textW: "72%", icon: 20, hasExcerpt: true },
            { textW: "58%", icon: 20, hasExcerpt: false },
            { textW: "80%", icon: 20, hasExcerpt: true },
            { textW: "44%", icon: 20, hasExcerpt: false },
            { textW: "65%", icon: 20, hasExcerpt: true },
          ].map((row, i) => (
            <div key={i} className="px-4 py-4 border-b border-rule/50 flex gap-3 animate-pulse">
              {/* Type icon column */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                <div className="w-5 h-5 rounded-sm bg-paper" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-paper flex-shrink-0" />
                  <div className="h-3 bg-paper rounded" style={{ width: row.textW }} />
                  <div className="ml-auto h-2.5 bg-paper/60 rounded w-9" />
                </div>
                {row.hasExcerpt && (
                  <div className="pl-1 ml-1 border-l-2 border-rule/40 space-y-1.5 pt-0.5">
                    <div className="h-2.5 bg-paper/70 rounded w-[90%]" />
                    <div className="h-2.5 bg-paper/70 rounded w-[64%]" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <i className="ti ti-bell text-[36px] text-ink-muted block mb-3" />
          <p className="font-serif italic text-ink-muted">nothing yet.</p>
          <p className="font-mono text-[11px] text-ink-muted mt-1">when someone likes, replies, or follows you — it'll show here.</p>
        </div>
      ) : (
        <div>
          {notifs.map((n) => {
            const fromName   = n.from_profile?.display_name ?? n.from_user_id?.slice(0, 8) ?? "someone";
            const fromHandle = n.from_profile?.handle ?? fromName.toLowerCase().replace(/\s+/g, ".");
            const excerpt    = n.draft_content
              ? n.draft_content.length > 60
                ? n.draft_content.slice(0, 60) + "…"
                : n.draft_content
              : null;
            const timeAgo = formatDistanceToNow(new Date(n.created_at), { addSuffix: true })
              .replace("about ", "").replace("less than a minute ago", "just now");

            return (
              <div
                key={n.id}
                className={`px-4 py-4 border-b border-rule/50 flex gap-3 cursor-pointer transition-colors hover:bg-paper/60
                  ${!n.read ? "bg-[hsl(15_54%_37%_/_0.04)]" : ""}`}
                onClick={() => {
                  if (n.draft_id) navigate(`/drafts/${n.draft_id}`);
                  else if (fromHandle) navigate(`/${fromHandle}`);
                }}
              >
                {/* Icon */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                  <i
                    className={`ti ${TYPE_ICON[n.type] ?? "ti-bell"} text-[20px]`}
                    style={{ color: TYPE_COLOR[n.type] }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      name={fromName}
                      id={n.from_user_id ?? "?"}
                      avatarUrl={n.from_profile?.avatar_url}
                      size={28}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-semibold text-[13px] text-ink cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/${fromHandle}`); }}
                      >
                        {fromName}
                      </span>
                      {" "}
                      <span className="text-[13px] text-ink-dim">{TYPE_TEXT[n.type]}</span>
                    </div>
                    <span className="font-mono text-[10px] text-ink-muted flex-shrink-0">{timeAgo}</span>
                  </div>
                  {excerpt && (
                    <p className="font-serif text-[13px] text-ink-muted italic leading-snug pl-1 border-l-2 border-rule/50 ml-1">
                      {excerpt}
                    </p>
                  )}
                </div>

                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-terra flex-shrink-0 mt-2" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
