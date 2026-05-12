import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Layout from "@/components/draft/Layout";
import Avatar from "@/components/feed/Avatar";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";
import { HeartIcon, BookmarkIcon } from "@/components/feed/Icons";

type Draft = {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  author_id: string | null;
  profiles: { display_name: string | null; handle: string | null; avatar_url: string | null } | null;
  quote_of_id?: string | null;
};

type Stats = { likes: number; comments: number; reposts: number };

// Per-draft cache — opening a draft you've already seen this session loads instantly
type DraftCacheEntry = {
  draft: Draft | null;
  mainQuoteOf: QuotedPiece | null;
  stats: Stats;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  replies: Piece[];
  moreByAuthor: Piece[];
  youMightLike: Piece[];
  scroll: number;
  loadedAt: number;
};
const draftCache: Map<string, DraftCacheEntry> = new Map();

export default function DraftDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const cached = id ? draftCache.get(id) : undefined;
  const [draft, setDraft]           = useState<Draft | null>(cached?.draft ?? null);
  const [mainQuoteOf, setMainQuoteOf] = useState<QuotedPiece | null>(cached?.mainQuoteOf ?? null);
  const [stats, setStats]           = useState<Stats>(cached?.stats ?? { likes: 0, comments: 0, reposts: 0 });
  const [liked, setLiked]           = useState(cached?.liked ?? false);
  const [reposted, setReposted]     = useState(cached?.reposted ?? false);
  const [bookmarked, setBookmarked] = useState(cached?.bookmarked ?? false);
  const [loading, setLoading]       = useState(!cached);

  const [replies, setReplies]       = useState<Piece[]>(cached?.replies ?? []);
  const [reply, setReply]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [justLiked, setJustLiked]   = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const [moreByAuthor, setMoreByAuthor] = useState<Piece[]>(cached?.moreByAuthor ?? []);
  const [youMightLike, setYouMightLike] = useState<Piece[]>(cached?.youMightLike ?? []);

  // Restore scroll on mount, persist as the user scrolls
  useLayoutEffect(() => {
    if (cached) window.scrollTo({ top: cached.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const onScroll = () => {
      if (!id) return;
      const entry = draftCache.get(id);
      if (entry) entry.scroll = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [id]);

  // Sync state → cache on any change
  useEffect(() => {
    if (!id) return;
    const existing = draftCache.get(id);
    draftCache.set(id, {
      draft, mainQuoteOf, stats, liked, reposted, bookmarked,
      replies, moreByAuthor, youMightLike,
      scroll: existing?.scroll ?? 0,
      loadedAt: existing?.loadedAt ?? 0,
    });
  }, [id, draft, mainQuoteOf, stats, liked, reposted, bookmarked, replies, moreByAuthor, youMightLike]);

  // Auto-focus reply box when navigated here with #reply hash
  useEffect(() => {
    if (location.hash === "#reply") {
      setTimeout(() => replyRef.current?.focus(), 300);
    }
  }, [location.hash]);

  useEffect(() => {
    if (!id) return;
    const stale = !cached || Date.now() - cached.loadedAt > 60_000;
    if (stale) loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const loadDraft = async () => {
    if (!id) return;
    if (!draftCache.get(id)?.draft) setLoading(true);

    // Step 1: all non-profile data in parallel (NO profiles join)
    const [draftRes, repliesRes, likeCountRes, repostCountRes] = await Promise.all([
      supabase.from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .eq("id", id)
        .maybeSingle(),
      // Replies = drafts that reference this one
      // @ts-ignore reply_to_id type inference depth
      supabase.from("drafts")
        .select("id, content, created_at, author_id, quote_of_id")
        .eq("reply_to_id", id)
        .order("created_at", { ascending: true }),
      supabase.from("likes").select("user_id").eq("draft_id", id),
      supabase.from("reposts").select("user_id").eq("draft_id", id),
    ]);

    const draftRaw = draftRes.data as {
      id: string; title: string | null; content: string; created_at: string;
      author_id: string | null; quote_of_id?: string | null;
    } | null;

    if (!draftRaw) {
      setDraft(null);
      setLoading(false);
      return;
    }

    const rawReplies = (repliesRes.data ?? []) as Array<{
      id: string; content: string; created_at: string;
      author_id: string | null; quote_of_id?: string | null;
    }>;

    // Step 2: collect all user IDs needing profiles
    const allAuthorIds = [
      ...(draftRaw.author_id ? [draftRaw.author_id] : []),
      ...rawReplies.map((r) => r.author_id).filter(Boolean),
    ];
    const uniqueAuthorIds = [...new Set(allAuthorIds)] as string[];

    // Also collect quote_of_ids that need fetching
    const quoteIds = [
      ...(draftRaw.quote_of_id ? [draftRaw.quote_of_id] : []),
      ...rawReplies.map((r) => r.quote_of_id).filter(Boolean),
    ] as string[];

    // Step 3: batch-fetch profiles + bookmark + quoted pieces in parallel
    const [profilesRes, bookmarkRes, quotedDraftsRes] = await Promise.all([
      uniqueAuthorIds.length > 0
        ? supabase.from("profiles")
            .select("id, display_name, handle, avatar_url")
            .in("id", uniqueAuthorIds)
        : Promise.resolve({ data: [] }),
      user
        ? supabase.from("bookmarks")
            .select("id")
            .eq("draft_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      quoteIds.length > 0
        ? supabase.from("drafts")
            .select("id, content, author_id")
            .in("id", quoteIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, { display_name: string | null; handle: string | null; avatar_url: string | null }> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Fetch profiles for quoted draft authors (may overlap with profileMap)
    const quotedDrafts = (quotedDraftsRes.data ?? []) as Array<{ id: string; content: string; author_id: string | null }>;
    const quotedAuthorIds = [...new Set(quotedDrafts.map(d => d.author_id).filter(Boolean))] as string[];
    const missingAuthorIds = quotedAuthorIds.filter(aid => !profileMap[aid]);
    if (missingAuthorIds.length > 0) {
      const { data: extraProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url")
        .in("id", missingAuthorIds);
      (extraProfiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
    }

    // Build quoted piece map
    const quotedPieceMap: Record<string, QuotedPiece> = {};
    quotedDrafts.forEach((qd) => {
      const qp = qd.author_id ? profileMap[qd.author_id] ?? null : null;
      quotedPieceMap[qd.id] = {
        id: qd.id,
        body: qd.content,
        authorName: qp?.display_name ?? qd.author_id?.slice(0, 8) ?? "drafter",
        authorHandle: qp?.handle ?? "",
        authorAvatarUrl: qp?.avatar_url ?? null,
      };
    });

    // Build main draft
    const authorProfile = draftRaw.author_id ? profileMap[draftRaw.author_id] ?? null : null;
    const draftFull: Draft = { ...draftRaw, profiles: authorProfile };
    setDraft(draftFull);

    // Set main quote embed if applicable
    if (draftRaw.quote_of_id && quotedPieceMap[draftRaw.quote_of_id]) {
      setMainQuoteOf(quotedPieceMap[draftRaw.quote_of_id]);
    } else {
      setMainQuoteOf(null);
    }

    // Build replies as Piece objects
    const replyLikeCountRes = rawReplies.length > 0
      ? await supabase.from("likes").select("draft_id").in("draft_id", rawReplies.map(r => r.id))
      : { data: [] };
    // @ts-ignore reply_to_id type inference depth
    const replyCommentCountRes = rawReplies.length > 0
      ? await supabase.from("drafts").select("reply_to_id").in("reply_to_id", rawReplies.map(r => r.id))
      : { data: [] };
    const myReplyLikesRes = user && rawReplies.length > 0
      ? await supabase.from("likes").select("draft_id").eq("user_id", user.id).in("draft_id", rawReplies.map(r => r.id))
      : { data: [] };

    const replyLikeMap: Record<string, number> = {};
    const replyCommentMap: Record<string, number> = {};
    (replyLikeCountRes.data ?? []).forEach((r: any) => { replyLikeMap[r.draft_id] = (replyLikeMap[r.draft_id] ?? 0) + 1; });
    (replyCommentCountRes.data ?? []).forEach((r: any) => { replyCommentMap[r.reply_to_id] = (replyCommentMap[r.reply_to_id] ?? 0) + 1; });
    const myLikedReplyIds = new Set((myReplyLikesRes.data ?? []).map((r: any) => r.draft_id));

    const replyPieces: Piece[] = rawReplies.map((r) => {
      const rp = r.author_id ? profileMap[r.author_id] ?? null : null;
      const rName   = rp?.display_name ?? r.author_id?.slice(0, 8) ?? "drafter";
      const rHandle = rp?.handle ?? rName.toLowerCase().replace(/\s+/g, ".");
      return {
        id: r.id,
        body: r.content,
        created_at: r.created_at,
        authorId: r.author_id ?? r.id,
        authorName: rName,
        authorHandle: rHandle,
        authorAvatarUrl: rp?.avatar_url ?? null,
        likes: replyLikeMap[r.id] ?? 0,
        comments: replyCommentMap[r.id] ?? 0,
        reposts: 0,
        liked: myLikedReplyIds.has(r.id),
        reposted: false,
        bookmarked: false,
        quoteOf: r.quote_of_id ? quotedPieceMap[r.quote_of_id] ?? null : null,
      };
    });
    setReplies(replyPieces);

    setStats({
      likes: (likeCountRes.data ?? []).length,
      comments: rawReplies.length,
      reposts: (repostCountRes.data ?? []).length,
    });

    if (user) {
      setLiked(!!(likeCountRes.data ?? []).find((r: { user_id: string }) => r.user_id === user.id));
      setReposted(!!(repostCountRes.data ?? []).find((r: { user_id: string }) => r.user_id === user.id));
      setBookmarked(!!(bookmarkRes as any).data);
    }

    setLoading(false);
    if (id) {
      const entry = draftCache.get(id);
      if (entry) entry.loadedAt = Date.now();
    }
    loadSuggestions(draftFull);
  };

  const loadSuggestions = async (d: Draft | null) => {
    if (!d?.author_id) return;

    const [moreRes, recentRes] = await Promise.all([
      supabase.from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .eq("author_id", d.author_id)
        .eq("published", true)
        .is("reply_to_id" as any, null)
        .neq("id", d.id)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .eq("published", true)
        .is("reply_to_id" as any, null)
        .neq("author_id", d.author_id)
        .neq("id", d.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    type RawSugg = {
      id: string; title: string | null; content: string;
      created_at: string; author_id: string | null; quote_of_id: string | null;
    };
    const moreData = (moreRes.data ?? []) as RawSugg[];
    const recentData = (recentRes.data ?? []) as RawSugg[];
    const allRaw = [...moreData, ...recentData];
    if (allRaw.length === 0) return;

    const authorIds = [...new Set(allRaw.map((r) => r.author_id).filter(Boolean))] as string[];
    const quoteIds  = [...new Set(allRaw.map((r) => r.quote_of_id).filter(Boolean) as string[])];

    // Author profiles + quoted drafts in parallel
    const [profilesRes, quotedRes] = await Promise.all([
      authorIds.length > 0
        ? supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", authorIds)
        : Promise.resolve({ data: [] }),
      quoteIds.length > 0
        ? supabase.from("drafts").select("id, content, author_id").in("id", quoteIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, any> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Fetch any quoted-piece authors we don't already have
    const quotedDrafts = (quotedRes.data ?? []) as Array<{ id: string; content: string; author_id: string | null }>;
    const missingQuotedAuthors = [...new Set(
      quotedDrafts.map((qd) => qd.author_id).filter((a): a is string => !!a && !profileMap[a])
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

    const toPiece = (raw: RawSugg): Piece => {
      const profile = raw.author_id ? profileMap[raw.author_id] ?? null : null;
      const name   = profile?.display_name ?? raw.author_id?.slice(0, 8) ?? "drafter";
      const handle = profile?.handle ?? name.toLowerCase().replace(/\s+/g, ".");
      const piece: Piece = {
        id: raw.id, title: raw.title ?? null, body: raw.content, created_at: raw.created_at,
        authorId: raw.author_id ?? raw.id, authorName: name, authorHandle: handle,
        authorAvatarUrl: profile?.avatar_url ?? null,
        likes: 0, comments: 0, reposts: 0,
        liked: false, reposted: false, bookmarked: false,
      };
      if (raw.quote_of_id && quotedPieceMap[raw.quote_of_id]) {
        piece.quoteOf = quotedPieceMap[raw.quote_of_id];
      }
      return piece;
    };

    if (moreData.length > 0) setMoreByAuthor(moreData.map(toPiece));
    setYouMightLike(recentData.slice(0, 3).map(toPiece));
  };

  const handleLike = async () => {
    if (!user) { navigate("/auth"); return; }
    const next = !liked;
    if (next) { setJustLiked(true); setTimeout(() => setJustLiked(false), 450); }
    setLiked(next);
    setStats((s) => ({ ...s, likes: s.likes + (next ? 1 : -1) }));
    if (next) await supabase.from("likes").insert({ draft_id: id!, user_id: user.id });
    else await supabase.from("likes").delete().eq("draft_id", id!).eq("user_id", user.id);
  };

  const handleRepost = async () => {
    if (!user) { navigate("/auth"); return; }
    const next = !reposted;
    setReposted(next);
    setStats((s) => ({ ...s, reposts: s.reposts + (next ? 1 : -1) }));
    if (next) await supabase.from("reposts").insert({ draft_id: id!, user_id: user.id });
    else await supabase.from("reposts").delete().eq("draft_id", id!).eq("user_id", user.id);
  };

  const handleBookmark = async () => {
    if (!user) { navigate("/auth"); return; }
    const next = !bookmarked;
    setBookmarked(next);
    if (next) await supabase.from("bookmarks").insert({ draft_id: id!, user_id: user.id });
    else await supabase.from("bookmarks").delete().eq("draft_id", id!).eq("user_id", user.id);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submitReply = async () => {
    if (!user || !reply.trim()) return;
    setSubmitting(true);
    const { data } = await supabase
      .from("drafts")
      .insert({
        content: reply.trim(),
        title: "",
        published: true,
        author_id: user.id,
        reply_to_id: id,
      } as any)
      .select("id, created_at")
      .single();
    if (data) {
      const d = data as { id: string; created_at: string };
      const newReply: Piece = {
        id: d.id,
        body: reply.trim(),
        created_at: d.created_at,
        authorId: user.id,
        authorName: myProfile?.display_name ?? user.email?.split("@")[0] ?? "drafter",
        authorHandle: myProfile?.handle ?? "",
        authorAvatarUrl: myProfile?.avatar_url ?? null,
        likes: 0, comments: 0, reposts: 0,
        liked: false, reposted: false, bookmarked: false,
      };
      setReplies((prev) => [...prev, newReply]);
      setStats((s) => ({ ...s, comments: s.comments + 1 }));
      setReply("");
      toast.success("reply posted", { duration: 2500 });
    }
    setSubmitting(false);
  };

  const handleReplyLike = async (replyId: string) => {
    if (!user) { navigate("/auth"); return; }
    const rp = replies.find((r) => r.id === replyId)!;
    const next = !rp.liked;
    setReplies((rs) => rs.map((r) => r.id === replyId
      ? { ...r, liked: next, likes: r.likes + (next ? 1 : -1) }
      : r
    ));
    if (next) await supabase.from("likes").insert({ draft_id: replyId, user_id: user.id });
    else await supabase.from("likes").delete().eq("draft_id", replyId).eq("user_id", user.id);
  };

  const authorName   = draft?.profiles?.display_name ?? draft?.author_id?.slice(0, 8) ?? "drafter";
  const authorHandle = draft?.profiles?.handle ?? authorName.toLowerCase().replace(/\s+/g, ".");
  const myName       = myProfile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const myHandle     = myProfile?.handle ?? user?.email?.split("@")[0] ?? "";

  if (loading) {
    return (
      <Layout>
        {/* Header */}
        <div className="px-4 py-3 border-b border-rule/50 flex items-center gap-3 animate-pulse">
          <div className="w-5 h-5 rounded bg-paper" />
          <div className="h-4 bg-paper rounded w-16" />
        </div>
        {/* Main draft area */}
        <div className="px-4 pt-5 pb-4 border-b border-rule/50 animate-pulse">
          <div className="flex gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-paper flex-shrink-0" />
            <div className="space-y-1.5 pt-1">
              <div className="h-3.5 bg-paper rounded w-32" />
              <div className="h-2.5 bg-paper/70 rounded w-20" />
            </div>
          </div>
          <div className="space-y-2.5 mb-5">
            <div className="h-[15px] bg-paper rounded w-[96%]" />
            <div className="h-[15px] bg-paper rounded w-[88%]" />
            <div className="h-[15px] bg-paper rounded w-[92%]" />
            <div className="h-[15px] bg-paper rounded w-[54%]" />
          </div>
          <div className="h-3 bg-paper/60 rounded w-44 mb-4" />
          {/* Action bar */}
          <div className="flex items-center justify-around py-2 border-b border-rule/40">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-1.5 px-3 py-2">
                <div className="w-4 h-4 rounded bg-paper" />
                {i <= 3 && <div className="w-3 h-2.5 rounded bg-paper/70" />}
              </div>
            ))}
          </div>
        </div>
        {/* Reply input placeholder */}
        <div className="px-4 py-4 border-b border-rule/50 flex gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-paper flex-shrink-0" />
          <div className="flex-1 h-[60px] bg-paper/40 rounded" />
        </div>
        {/* Replies */}
        <SkeletonPiece variant={0} />
        <SkeletonPiece variant={1} />
      </Layout>
    );
  }

  if (!draft) {
    return (
      <Layout>
        <div className="px-4 py-12 text-center">
          <p className="font-serif italic text-ink-muted">draft not found.</p>
          <button
            className="mt-4 font-mono text-[11px] text-terra bg-transparent border-none cursor-pointer"
            onClick={() => navigate("/")}
          >
            ← back to feed
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Back */}
      <div className="px-4 py-3 border-b border-rule/50 flex items-center gap-3">
        <button
          className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1 -ml-1"
          onClick={() => navigate(-1)}
        >
          <i className="ti ti-arrow-left text-[20px]" />
        </button>
        <span className="font-semibold text-[17px] text-ink">draft</span>
      </div>

      {/* Main draft */}
      <div className="px-4 pt-5 pb-4 border-b border-rule/50">
        <div className="flex gap-3 mb-4">
          <div className="flex-shrink-0 cursor-pointer" onClick={() => navigate(`/${authorHandle}`)}>
            <Avatar name={authorName} id={draft.author_id ?? draft.id} avatarUrl={draft.profiles?.avatar_url} size={44} />
          </div>
          <div>
            <div
              className="font-semibold text-[15px] text-ink cursor-pointer hover:underline leading-tight"
              onClick={() => navigate(`/${authorHandle}`)}
            >
              {authorName}
            </div>
            <div
              className="font-mono text-[12px] text-ink-muted cursor-pointer hover:underline"
              onClick={() => navigate(`/${authorHandle}`)}
            >
              @{authorHandle}
            </div>
          </div>
        </div>

        {/* Title (if present) */}
        {draft.title?.trim() && (
          <h1 className="font-serif italic text-[22px] text-ink leading-snug mb-2">
            {draft.title}
          </h1>
        )}

        {/* Body */}
        <p className="font-serif text-[17px] leading-[1.8] text-ink whitespace-pre-wrap mb-4">
          {draft.content}
        </p>

        {/* Quote embed (if this draft quotes another) */}
        {mainQuoteOf && (
          <div
            className="mb-4 border border-rule/60 px-3 py-2.5 cursor-pointer hover:bg-paper/60 transition-colors"
            onClick={() => navigate(`/drafts/${mainQuoteOf.id}`)}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Avatar name={mainQuoteOf.authorName} id={mainQuoteOf.id} avatarUrl={mainQuoteOf.authorAvatarUrl} size={14} />
              <span className="text-[12px] font-semibold text-ink">{mainQuoteOf.authorName}</span>
              {mainQuoteOf.authorHandle && (
                <span className="font-mono text-[10px] text-ink-muted">@{mainQuoteOf.authorHandle}</span>
              )}
            </div>
            <p className="font-serif text-[13px] leading-[1.65] text-ink-dim whitespace-pre-wrap line-clamp-4">
              {mainQuoteOf.body}
            </p>
          </div>
        )}

        {/* Timestamp */}
        <p className="font-mono text-[12px] text-ink-muted mb-4">
          {format(new Date(draft.created_at), "h:mm a · MMMM d, yyyy")}
        </p>

        {/* Count bar */}
        {(stats.likes > 0 || stats.reposts > 0 || stats.comments > 0) && (
          <div className="flex items-center gap-4 py-3 border-y border-rule/50 mb-1">
            {stats.reposts > 0 && (
              <span className="text-[14px] text-ink-dim">
                <strong className="text-ink font-semibold">{stats.reposts}</strong>
                <span className="font-mono text-[12px] ml-1">repost{stats.reposts !== 1 ? "s" : ""}</span>
              </span>
            )}
            {stats.likes > 0 && (
              <span className="text-[14px] text-ink-dim">
                <strong className="text-ink font-semibold">{stats.likes}</strong>
                <span className="font-mono text-[12px] ml-1">like{stats.likes !== 1 ? "s" : ""}</span>
              </span>
            )}
            {stats.comments > 0 && (
              <span className="text-[14px] text-ink-dim">
                <strong className="text-ink font-semibold">{stats.comments}</strong>
                <span className="font-mono text-[12px] ml-1">repl{stats.comments !== 1 ? "ies" : "y"}</span>
              </span>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-around py-1 border-b border-rule/50">
          <Act
            icon="ti-message-circle"
            count={stats.comments}
            hoverColor="hsl(196 36% 28%)"
            hoverBg="hsl(196 36% 28% / 0.08)"
            onClick={() => replyRef.current?.focus()}
          />
          <Act
            icon="ti-repeat"
            count={stats.reposts}
            active={reposted}
            activeColor="hsl(140 45% 38%)"
            hoverColor="hsl(140 45% 38%)"
            hoverBg="hsl(140 45% 38% / 0.08)"
            onClick={handleRepost}
          />
          {/* Like */}
          <button
            className={`flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-3 py-2 font-mono text-[12px] transition-colors ${justLiked ? "heart-pop" : ""}`}
            style={{ color: liked ? "hsl(0 60% 52%)" : "hsl(var(--ink-muted))", borderRadius: "9999px" }}
            onClick={handleLike}
          >
            <HeartIcon filled={liked} size={18} />
            <span>{stats.likes}</span>
          </button>
          {/* Bookmark */}
          <button
            className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-3 py-2 font-mono text-[12px] transition-colors"
            style={{ color: bookmarked ? "hsl(15 54% 37%)" : "hsl(var(--ink-muted))", borderRadius: "9999px" }}
            onClick={handleBookmark}
          >
            <BookmarkIcon filled={bookmarked} size={18} />
          </button>
          <Act
            icon="ti-upload"
            hoverColor="hsl(var(--ink-dim))"
            hoverBg="hsl(var(--paper))"
            onClick={copyLink}
            label={copied ? "copied!" : undefined}
          />
        </div>
      </div>

      {/* Reply composer */}
      {user && (
        <div id="reply" className="px-4 py-4 border-b border-rule/50 flex gap-3">
          <Avatar name={myName} id={user.id} avatarUrl={myProfile?.avatar_url} size={36} />
          <div className="flex-1 min-w-0">
            <textarea
              ref={replyRef}
              className="w-full bg-transparent border-none outline-none font-serif text-[14px] leading-[1.7] text-ink resize-none placeholder:text-ink-muted placeholder:italic"
              rows={2}
              maxLength={3000}
              placeholder={`reply as @${myHandle}…`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply(); }}
            />
            <div className="flex justify-end pt-1">
              <button
                onClick={submitReply}
                disabled={!reply.trim() || submitting}
                className="bg-terra text-[hsl(38_35%_96%)] border-none rounded-[3px] px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {submitting ? "…" : "reply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replies as full PieceCards */}
      {replies.length === 0 && !user && (
        <p className="font-serif italic text-ink-muted px-4 py-8 text-center text-[14px]">
          no replies yet. be the first.
        </p>
      )}
      {replies.length === 0 && user && (
        <p className="font-serif italic text-ink-muted px-4 py-6 text-center text-[14px]">
          no replies yet.
        </p>
      )}
      {replies.map((rp) => (
        <PieceCard
          key={rp.id}
          piece={rp}
          onLike={handleReplyLike}
          onAuthOpen={() => navigate("/auth")}
          isAuthenticated={!!user}
        />
      ))}

      {/* ── More from @author ── */}
      {moreByAuthor.length > 0 && (
        <section className="mt-2">
          <div className="px-4 py-4">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted mb-0">
              more from{" "}
              <span
                className="text-terra cursor-pointer hover:underline"
                onClick={() => navigate(`/${authorHandle}`)}
              >
                @{authorHandle}
              </span>
            </p>
          </div>
          {moreByAuthor.map((p) => (
            <PieceCard key={p.id} piece={p} onLike={() => {}} onAuthOpen={() => navigate("/auth")} isAuthenticated={!!user} />
          ))}
        </section>
      )}

      {/* ── You might also like ── */}
      {youMightLike.length > 0 && (
        <section className="mt-2">
          <div className="px-4 py-4">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">
              you might also like
            </p>
          </div>
          {youMightLike.map((p) => (
            <PieceCard key={p.id} piece={p} onLike={() => {}} onAuthOpen={() => navigate("/auth")} isAuthenticated={!!user} />
          ))}
        </section>
      )}
    </Layout>
  );
}

function Act({
  icon, count, active, activeColor, hoverColor, hoverBg, onClick, label,
}: {
  icon: string; count?: number; active?: boolean;
  activeColor?: string; hoverColor: string; hoverBg: string;
  onClick: () => void; label?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-3 py-2 font-mono text-[12px] text-ink-muted transition-colors"
      style={{
        color: active ? activeColor : hov ? hoverColor : undefined,
        background: hov ? hoverBg : "transparent",
        borderRadius: "9999px",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >
      <i className={`ti ${icon} text-[18px]`} />
      {label && <span className="text-[11px]">{label}</span>}
      {count != null && !label && <span>{count}</span>}
    </button>
  );
}
