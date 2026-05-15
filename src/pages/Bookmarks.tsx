import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/draft/Layout";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";

// Module-level cache — survives in-app navigation
const cache: { pieces: Piece[]; scroll: number; loadedAt: number } = {
  pieces: [],
  scroll: 0,
  loadedAt: 0,
};

export default function Bookmarks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasCache = cache.pieces.length > 0;
  const [pieces, setPieces] = useState<Piece[]>(cache.pieces);
  const [loading, setLoading] = useState(!hasCache);

  // Restore scroll on mount; persist on every scroll
  useLayoutEffect(() => {
    if (hasCache) window.scrollTo({ top: cache.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onScroll = () => { cache.scroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { cache.pieces = pieces; }, [pieces]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    const stale = Date.now() - cache.loadedAt > 60_000;
    if (!hasCache || stale) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    if (!user) return;
    if (cache.pieces.length === 0) setLoading(true);

    // Step 1: fetch bookmark rows (just IDs — no nested join)
    const { data: bmData } = await supabase
      .from("bookmarks")
      .select("draft_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const bmRows = (bmData ?? []) as Array<{ draft_id: string; created_at: string }>;
    if (bmRows.length === 0) { setPieces([]); setLoading(false); cache.loadedAt = Date.now(); return; }

    const draftIds = bmRows.map((r) => r.draft_id);

    // Step 2: fetch draft details + author profiles + counts in parallel
    const { data: draftsData } = await supabase
      .from("drafts")
      .select("id, title, content, created_at, author_id, quote_of_id")
      .in("id", draftIds);

    const drafts = (draftsData ?? []) as Array<{
      id: string; title: string | null; content: string;
      created_at: string; author_id: string | null; quote_of_id: string | null;
    }>;

    const authorIds = [...new Set(drafts.map((d) => d.author_id).filter(Boolean))] as string[];
    const quoteIds  = [...new Set(drafts.map((d) => d.quote_of_id).filter(Boolean) as string[])];

    const [profilesRes, quotedRes, lc, myLikes] = await Promise.all([
      authorIds.length > 0
        ? supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", authorIds)
        : Promise.resolve({ data: [] }),
      quoteIds.length > 0
        ? supabase.from("drafts").select("id, content, author_id").in("id", quoteIds)
        : Promise.resolve({ data: [] }),
      supabase.from("likes").select("draft_id").in("draft_id", draftIds),
      supabase.from("likes").select("draft_id").eq("user_id", user.id).in("draft_id", draftIds),
    ]);

    const profileMap: Record<string, any> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Build quoted piece map
    const quotedDrafts = (quotedRes.data ?? []) as Array<{ id: string; content: string; author_id: string | null }>;
    const missingQuotedAuthors = [...new Set(
      quotedDrafts.map((d) => d.author_id).filter((a): a is string => !!a && !profileMap[a])
    )];
    if (missingQuotedAuthors.length > 0) {
      const { data: qProfs } = await supabase
        .from("profiles").select("id, display_name, handle, avatar_url").in("id", missingQuotedAuthors);
      (qProfs ?? []).forEach((p: any) => { profileMap[p.id] = p; });
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

    const likeMap: Record<string, number> = {};
    const myLikedSet = new Set((myLikes.data ?? []).map((r: { draft_id: string }) => r.draft_id));
    (lc.data ?? []).forEach((r: { draft_id: string }) => { likeMap[r.draft_id] = (likeMap[r.draft_id] ?? 0) + 1; });

    // Build a lookup by draft id so we can preserve bookmark order
    const draftMap: Record<string, typeof drafts[0]> = {};
    drafts.forEach((d) => { draftMap[d.id] = d; });

    const mapped: Piece[] = bmRows
      .map((bm) => {
        const d = draftMap[bm.draft_id];
        if (!d) return null;
        const profile = d.author_id ? profileMap[d.author_id] ?? null : null;
        const name   = profile?.display_name ?? d.author_id?.slice(0, 8) ?? "drafter";
        const handle = profile?.handle ?? name.toLowerCase().replace(/\s+/g, ".");
        const piece: Piece = {
          id: d.id, title: d.title ?? null, body: d.content, created_at: d.created_at,
          authorId: d.author_id ?? d.id,
          authorName: name, authorHandle: handle,
          authorAvatarUrl: profile?.avatar_url ?? null,
          likes: likeMap[d.id] ?? 0,
          comments: 0, reposts: 0,
          liked: myLikedSet.has(d.id),
          reposted: false, bookmarked: true,
        };
        if (d.quote_of_id && quotedPieceMap[d.quote_of_id]) {
          piece.quoteOf = quotedPieceMap[d.quote_of_id];
        }
        return piece;
      })
      .filter(Boolean) as Piece[];

    setPieces(mapped);
    setLoading(false);
    cache.loadedAt = Date.now();
  };

  const handleLike = async (id: string) => {
    if (!user) { navigate("/auth"); return; }
    const piece = pieces.find((p) => p.id === id)!;
    const next = !piece.liked;
    setPieces((ps) => ps.map((p) => p.id === id ? { ...p, liked: next, likes: p.likes + (next ? 1 : -1) } : p));
    if (next) await supabase.from("likes").insert({ draft_id: id, user_id: user.id });
    else await supabase.from("likes").delete().eq("draft_id", id).eq("user_id", user.id);
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
        <span className="font-semibold text-[17px] text-ink">bookmarks</span>
      </div>

      {loading ? (
        <div>
          <SkeletonPiece variant={0} />
          <SkeletonPiece variant={1} />
          <SkeletonPiece variant={2} />
        </div>
      ) : pieces.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <i className="ti ti-bookmark text-[36px] text-ink-muted block mb-3" />
          <p className="font-serif italic text-ink-muted">no bookmarks yet.</p>
          <p className="font-mono text-[11px] text-ink-muted mt-1">
            tap ··· on any piece and save it here.
          </p>
        </div>
      ) : (
        <div>
          {pieces.map((p) => (
            <PieceCard
              key={p.id}
              piece={p}
              onLike={handleLike}
              onAuthOpen={() => navigate("/auth")}
              isAuthenticated={!!user}
              onDelete={(id) => setPieces((ps) => ps.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
