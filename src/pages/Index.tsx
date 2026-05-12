import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Layout from "@/components/draft/Layout";
import ComposeBox from "@/components/feed/ComposeBox";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";
import RightSidebar from "@/components/feed/RightSidebar";

type Tab = "foryou" | "recent";

type RawDraft = {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  author_id: string | null;
  reply_to_id: string | null;
  quote_of_id: string | null;
  profiles: { display_name: string | null; handle: string | null; avatar_url: string | null } | null;
};

type Writer = { id: string; name: string; handle: string; avatarUrl?: string | null };

/**
 * Module-level cache. Survives in-app navigation (Search → back to /, etc.)
 * but is wiped on a hard page reload — that's the right tradeoff.
 *
 * When the user navigates back to /, we hydrate state synchronously from this
 * cache so the feed shows instantly, then refetch in the background.
 */
const feedCache: {
  pieces: Piece[];
  writers: Writer[];
  tabScroll: Record<Tab, number>;
  homeScroll: number;
  tab: Tab;
  loadedAt: number;
} = {
  pieces: [],
  writers: [],
  tabScroll: { foryou: 0, recent: 0 },
  homeScroll: 0,
  tab: "foryou",
  loadedAt: 0,
};

function toPiece(
  d: RawDraft,
  likedIds: Set<string>,
  repostedIds: Set<string>,
  bookmarkedIds: Set<string>,
): Piece {
  const name = d.profiles?.display_name ?? d.author_id?.slice(0, 8) ?? "drafter";
  const handle = d.profiles?.handle
    ?? name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._]/g, "");
  return {
    id: d.id,
    title: d.title ?? null,
    body: d.content,
    created_at: d.created_at,
    authorId: d.author_id ?? d.id,
    authorName: name,
    authorHandle: handle,
    authorAvatarUrl: d.profiles?.avatar_url ?? null,
    likes: 0, comments: 0, reposts: 0,
    liked: likedIds.has(d.id),
    reposted: repostedIds.has(d.id),
    bookmarked: bookmarkedIds.has(d.id),
  };
}

export default function Index() {
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const navigate = useNavigate();
  // Hydrate synchronously from the module cache so navigating back to /
  // shows the feed instantly instead of flashing the skeleton.
  const hasCache = feedCache.pieces.length > 0;
  const [pieces, setPieces] = useState<Piece[]>(feedCache.pieces);
  const [loading, setLoading] = useState(!hasCache); // skeleton only on cold start
  const [tab, setTab] = useState<Tab>(feedCache.tab);
  // Per-tab scroll position
  const tabScroll = useRef<Record<Tab, number>>({ ...feedCache.tabScroll });
  const prevTab = useRef<Tab>(feedCache.tab);

  // Restore scroll BEFORE the browser paints the newly-sorted list.
  // useLayoutEffect runs after DOM mutations but before paint, eliminating the visible jump.
  useLayoutEffect(() => {
    if (prevTab.current === tab) return;
    const target = tabScroll.current[tab] ?? 0;
    window.scrollTo({ top: target, behavior: "auto" });
    prevTab.current = tab;
  }, [tab, pieces]);

  // Keep tabScroll up-to-date as the user scrolls within the active tab
  useEffect(() => {
    const onScroll = () => { tabScroll.current[tab] = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);
  const [search, setSearch] = useState("");
  const [authModal, setAuthModal] = useState<"join" | "login" | null>(null);
  const [showNewPill, setShowNewPill] = useState(false);
  const [writers, setWriters] = useState<Writer[]>(feedCache.writers);
  const pillTimer = useRef<ReturnType<typeof setTimeout>>();

  // Restore overall page scroll when remounting (Search → /, profile → /, etc.)
  useLayoutEffect(() => {
    if (hasCache) {
      window.scrollTo({ top: feedCache.homeScroll, behavior: "auto" });
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist scroll position continuously so navigating away preserves it
  useEffect(() => {
    const onScroll = () => { feedCache.homeScroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Persist current state into the cache whenever it changes so a navigate-away preserves it
  useEffect(() => {
    feedCache.pieces = pieces;
    feedCache.writers = writers;
    feedCache.tab = tab;
    feedCache.tabScroll = { ...tabScroll.current };
  }, [pieces, writers, tab]);

  useEffect(() => {
    // Fresh-fetch on user change; or if cache is older than 60s, refetch silently in background.
    const stale = Date.now() - feedCache.loadedAt > 60_000;
    if (!hasCache || stale) {
      loadFeed();
    }
    pillTimer.current = setTimeout(() => setShowNewPill(true), 30_000);
    return () => clearTimeout(pillTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadFeed = async () => {
    // Only show the skeleton if we have nothing to show at all
    if (feedCache.pieces.length === 0) setLoading(true);
    setShowNewPill(false);

    // ── PHASE 1 — Fetch drafts + author profiles only. Render ASAP.
    const { data: rawDrafts } = await supabase
      .from("drafts")
      .select("id, title, content, created_at, author_id, reply_to_id, quote_of_id")
      .eq("published", true)
      .is("reply_to_id" as any, null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!rawDrafts || rawDrafts.length === 0) {
      setPieces([]);
      setWriters([]);
      setLoading(false);
      return;
    }
    const draftsBase = rawDrafts as Array<{
      id: string; title: string | null; content: string; created_at: string;
      author_id: string | null; reply_to_id: string | null; quote_of_id: string | null;
    }>;
    const ids = draftsBase.map((d) => d.id);
    const authorIds = [...new Set(draftsBase.map((d) => d.author_id).filter(Boolean))] as string[];
    const quoteOfIds = [...new Set(
      draftsBase.map((d) => d.quote_of_id).filter(Boolean) as string[]
    )];

    // PHASE 1 — Profiles + quoted drafts (content) in parallel.
    // Quotes are part of the post's meaning, not metadata, so they render with the initial pieces.
    const [profilesRes, quotedRes] = await Promise.all([
      authorIds.length > 0
        ? supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", authorIds)
        : Promise.resolve({ data: [] }),
      quoteOfIds.length > 0
        ? supabase.from("drafts").select("id, content, author_id").in("id", quoteOfIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, { display_name: string | null; handle: string | null; avatar_url: string | null }> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Build quoted piece map, fetching any quoted authors we don't already have
    const quotedDrafts = (quotedRes.data ?? []) as Array<{ id: string; content: string; author_id: string | null }>;
    const missingQuotedAuthors = [...new Set(
      quotedDrafts.map((d) => d.author_id).filter((a): a is string => !!a && !profileMap[a])
    )];
    if (missingQuotedAuthors.length > 0) {
      const { data: qProfiles } = await supabase
        .from("profiles").select("id, display_name, handle, avatar_url").in("id", missingQuotedAuthors);
      (qProfiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    }
    const quotedPieceMap: Record<string, QuotedPiece> = {};
    quotedDrafts.forEach((qd) => {
      const qp = qd.author_id ? profileMap[qd.author_id] ?? null : null;
      const qName   = qp?.display_name ?? qd.author_id?.slice(0, 8) ?? "drafter";
      const qHandle = qp?.handle ?? qName.toLowerCase().replace(/\s+/g, ".");
      quotedPieceMap[qd.id] = {
        id: qd.id, body: qd.content,
        authorName: qName, authorHandle: qHandle,
        authorAvatarUrl: qp?.avatar_url ?? null,
      };
    });

    // Build Phase 1 pieces (author info + quotes, zero counts)
    const drafts: RawDraft[] = draftsBase.map((d) => ({
      ...d,
      profiles: d.author_id ? profileMap[d.author_id] ?? null : null,
    }));
    const firstPass = drafts.map((d) => {
      const piece = toPiece(d, new Set(), new Set(), new Set());
      if (d.quote_of_id && quotedPieceMap[d.quote_of_id]) {
        piece.quoteOf = quotedPieceMap[d.quote_of_id];
      }
      return piece;
    });

    // Derive writers list (exclude self) — ready to set once we reveal
    const seen = new Set<string>();
    const ws: Writer[] = [];
    firstPass.forEach((p) => {
      if (p.authorId === user?.id) return;
      if (!seen.has(p.authorId)) {
        seen.add(p.authorId);
        ws.push({ id: p.authorId, name: p.authorName, handle: p.authorHandle, avatarUrl: p.authorAvatarUrl });
      }
    });

    // ── PHASE 2 — Enrich interaction counts + my-interactions.
    // We wait for this before revealing so there's a single skeleton→content
    // transition with no intermediate re-render flinch.
    let enriched = firstPass;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [likesRes, repostsRes, bookmarksRes, likeCountRes, replyCountRes, repostCountRes]: any[] =
        await Promise.all([
          user
            ? supabase.from("likes").select("draft_id").eq("user_id", user.id).in("draft_id", ids)
            : Promise.resolve({ data: [] }),
          user
            ? supabase.from("reposts").select("draft_id").eq("user_id", user.id).in("draft_id", ids)
            : Promise.resolve({ data: [] }),
          user
            ? supabase.from("bookmarks").select("draft_id").eq("user_id", user.id).in("draft_id", ids)
            : Promise.resolve({ data: [] }),
          supabase.from("likes").select("draft_id").in("draft_id", ids),
          // @ts-ignore reply_to_id type inference depth
          supabase.from("drafts").select("reply_to_id").in("reply_to_id", ids),
          supabase.from("reposts").select("draft_id").in("draft_id", ids),
        ]);

      const likedIds      = new Set<string>((likesRes.data ?? []).map((r: { draft_id: string }) => r.draft_id));
      const repostedIds   = new Set<string>((repostsRes.data ?? []).map((r: { draft_id: string }) => r.draft_id));
      const bookmarkedIds = new Set<string>((bookmarksRes.data ?? []).map((r: { draft_id: string }) => r.draft_id));

      const likeMap: Record<string, number>    = {};
      const commentMap: Record<string, number> = {};
      const repostMap: Record<string, number>  = {};
      (likeCountRes.data ?? []).forEach((r: { draft_id: string }) => {
        likeMap[r.draft_id] = (likeMap[r.draft_id] ?? 0) + 1;
      });
      (replyCountRes.data ?? []).forEach((r: { reply_to_id: string }) => {
        if (r.reply_to_id) commentMap[r.reply_to_id] = (commentMap[r.reply_to_id] ?? 0) + 1;
      });
      (repostCountRes.data ?? []).forEach((r: { draft_id: string }) => {
        repostMap[r.draft_id] = (repostMap[r.draft_id] ?? 0) + 1;
      });

      enriched = firstPass.map((p) => ({
        ...p,
        likes:      likeMap[p.id]    ?? 0,
        comments:   commentMap[p.id] ?? 0,
        reposts:    repostMap[p.id]  ?? 0,
        liked:      likedIds.has(p.id),
        reposted:   repostedIds.has(p.id),
        bookmarked: bookmarkedIds.has(p.id),
      }));
    } catch (err) {
      // Counts failing shouldn't block the reveal; fall back to Phase 1 data.
      console.error("count enrichment failed:", err);
    }

    // Single reveal: skeleton → fully-loaded content, no intermediate flinch.
    setPieces(enriched);
    setWriters(ws.slice(0, 5));
    setLoading(false);
    feedCache.loadedAt = Date.now();
  };

  const handleLike = async (id: string) => {
    if (!user) { setAuthModal("join"); return; }
    const piece = pieces.find((p) => p.id === id)!;
    const nowLiked = !piece.liked;
    setPieces((ps) =>
      ps.map((p) => p.id === id ? { ...p, liked: nowLiked, likes: p.likes + (nowLiked ? 1 : -1) } : p)
    );
    if (nowLiked) {
      await supabase.from("likes").insert({ draft_id: id, user_id: user.id });
    } else {
      await supabase.from("likes").delete().eq("draft_id", id).eq("user_id", user.id);
    }
  };

  const handlePublish = async (body: string, title: string) => {
    if (!user) { setAuthModal("join"); return; }
    const { data } = await supabase
      .from("drafts")
      .insert({ content: body, title: title || "", published: true, author_id: user.id })
      .select("id, created_at")
      .single();
    if (data) {
      const d = data as { id: string; created_at: string };
      const name   = myProfile?.display_name ?? user.email?.split("@")[0] ?? "drafter";
      const handle = myProfile?.handle ?? user.email?.split("@")[0] ?? "";
      const newPiece: Piece = {
        id: d.id,
        title: title || null,
        body,
        created_at: d.created_at,
        authorId: user.id,
        authorName: name,
        authorHandle: handle,
        authorAvatarUrl: myProfile?.avatar_url ?? null,
        likes: 0, comments: 0, reposts: 0,
        liked: false, reposted: false, bookmarked: false,
      };
      setPieces((ps) => [newPiece, ...ps]);

      // Make sure the user actually SEES their new piece:
      // 1. Switch to "recent" (chronological) — "for you" sorts by engagement and would bury a 0-likes post
      // 2. Scroll the page back to the top
      setTab("recent");
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Confirmation + share affordance
      const url = `${window.location.origin}/drafts/${d.id}`;
      toast.success("draft posted", {
        description: "your piece is now live.",
        action: {
          label: "share",
          onClick: () => {
            // Use Web Share API when available (mobile), fall back to clipboard
            const sharePayload = { title: "drafts.rw", text: title || "a new piece on drafts.rw", url };
            if (typeof navigator.share === "function") {
              navigator.share(sharePayload).catch(() => {
                navigator.clipboard.writeText(url).then(() => toast("link copied")).catch(() => {});
              });
            } else {
              navigator.clipboard.writeText(url)
                .then(() => toast("link copied"))
                .catch(() => {});
            }
          },
        },
        duration: 6000,
      });
    }
  };

  const feed = (() => {
    let list = [...pieces];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.body.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q)
      );
    }
    if (tab === "foryou") {
      list.sort((a, b) => (b.likes * 0.6 + b.reposts * 0.4 + (b.liked ? 20 : 0)) - (a.likes * 0.6 + a.reposts * 0.4 + (a.liked ? 20 : 0)));
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  })();

  return (
    <>
      <Layout
        onAuthOpen={(m) => setAuthModal(m)}
        sidebar={<RightSidebar onSearch={setSearch} writers={writers} />}
      >
        {/* Tabs */}
        <div className="sticky top-0 bg-background z-[5] border-b border-rule/50">
          <div className="flex">
            {(["foryou", "recent"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (tab === t) {
                    // Tapping the active tab scrolls to top (Twitter-style)
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }
                  // Snapshot scroll BEFORE the tab change re-renders the list
                  tabScroll.current[tab] = window.scrollY;
                  setTab(t);
                  // useLayoutEffect above restores the incoming tab's scroll before paint
                }}
                className={`flex-1 font-mono text-[11px] tracking-[0.14em] uppercase py-[14px] border-none bg-transparent cursor-pointer border-b-2 transition-colors
                  ${tab === t
                    ? "text-ink border-terra"
                    : "text-ink-muted border-transparent hover:text-ink-dim hover:bg-paper/50"}`}
              >
                {t === "foryou" ? "for you" : "recent"}
              </button>
            ))}
          </div>
          {showNewPill && (
            <div className="flex justify-center pb-2">
              <button
                className="bg-terra/10 text-terra font-mono text-[10px] tracking-[0.08em] px-3 py-1 border-none cursor-pointer hover:bg-terra/20 transition-colors"
                onClick={() => { setShowNewPill(false); loadFeed(); }}
              >
                ↑ new pieces
              </button>
            </div>
          )}
        </div>

        {/* Compose */}
        <ComposeBox onPublish={handlePublish} onAuthOpen={(m) => setAuthModal(m)} />

        {/* Feed */}
        {loading ? (
          <div>
            <SkeletonPiece variant={0} />
            <SkeletonPiece variant={1} />
            <SkeletonPiece variant={2} />
            <SkeletonPiece variant={3} />
          </div>
        ) : feed.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-serif text-[19px] text-ink mb-2">the room is quiet.</p>
            <p className="font-serif italic text-ink-muted text-[15px]">be the first to leave something here.</p>
          </div>
        ) : (
          <div>
            {feed.map((p, i) => (
              <div key={p.id}>
                {i === 2 && !user && <NudgeCard onAuthOpen={(m) => setAuthModal(m)} />}
                <PieceCard
                  piece={p}
                  onLike={handleLike}
                  onAuthOpen={(m) => setAuthModal(m)}
                  isAuthenticated={!!user}
                  onQuotePosted={(q) => {
                    if (!user) return;
                    const name   = myProfile?.display_name ?? user.email?.split("@")[0] ?? "drafter";
                    const handle = myProfile?.handle ?? user.email?.split("@")[0] ?? "";
                    const newPiece: Piece = {
                      id: q.id,
                      title: null,
                      body: q.body,
                      created_at: q.created_at,
                      authorId: user.id,
                      authorName: name,
                      authorHandle: handle,
                      authorAvatarUrl: myProfile?.avatar_url ?? null,
                      likes: 0, comments: 0, reposts: 0,
                      liked: false, reposted: false, bookmarked: false,
                      quoteOf: q.quoteOf,
                    };
                    setPieces((ps) => [newPiece, ...ps]);
                    setTab("recent");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    toast.success("quote posted", { duration: 3000 });
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Layout>

      {authModal && (
        <AuthModal
          onClose={() => setAuthModal(null)}
          onNavigate={() => { setAuthModal(null); navigate("/auth"); }}
        />
      )}
    </>
  );
}

function NudgeCard({ onAuthOpen }: { onAuthOpen: (m: "join" | "login") => void }) {
  return (
    <div className="px-4 py-5 border-b border-rule/50 bg-[hsl(15_54%_37%_/_0.04)] dark:bg-[hsl(15_54%_37%_/_0.08)]">
      <p className="font-serif text-[17px] font-medium text-ink mb-1">stay in the conversation.</p>
      <p className="text-[13px] text-ink-dim leading-[1.6] mb-3">
        create an account to post under your name and follow other writers.
      </p>
      <button
        className="bg-terra text-[hsl(38_35%_96%)] border-none rounded-[3px] px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => onAuthOpen("join")}
      >
        continue with email
      </button>
    </div>
  );
}

function AuthModal({
  onClose, onNavigate,
}: { onClose: () => void; onNavigate: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-[hsl(25_22%_11%_/_0.55)] z-50 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 p-8 w-[360px] max-w-[92vw] relative">
        <button
          className="absolute top-4 right-4 bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors"
          onClick={onClose}
        >
          <i className="ti ti-x text-lg" />
        </button>
        <div className="font-serif text-[19px] font-medium text-ink mb-1">join drafts.rw</div>
        <p className="text-[13px] text-ink-dim mb-6 leading-relaxed">express. explore.</p>
        <button
          className="w-full bg-terra text-[hsl(38_35%_96%)] border-none py-2.5 font-mono text-[11px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          onClick={onNavigate}
        >
          continue with email
        </button>
      </div>
    </div>
  );
}
