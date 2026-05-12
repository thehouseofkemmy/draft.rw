import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/draft/Layout";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";
import Avatar from "@/components/feed/Avatar";

type SearchTab = "drafts" | "people";

type PersonResult = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

// Module-level cache — last query and its results
const cache: {
  query: string;
  tab: SearchTab;
  draftResults: Piece[];
  peopleResults: PersonResult[];
  scroll: number;
} = {
  query: "",
  tab: "drafts",
  draftResults: [],
  peopleResults: [],
  scroll: 0,
};

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get("q") ?? cache.query;
  const hasCachedResults =
    cache.query === initialQuery && (cache.draftResults.length > 0 || cache.peopleResults.length > 0);

  const [query, setQuery]         = useState(initialQuery);
  const [tab, setTab]             = useState<SearchTab>(cache.tab);
  const [draftResults, setDraftResults] = useState<Piece[]>(hasCachedResults ? cache.draftResults : []);
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>(hasCachedResults ? cache.peopleResults : []);
  const [loading, setLoading]     = useState(false);
  const [followed, setFollowed]   = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount; restore scroll before paint
  useLayoutEffect(() => {
    if (hasCachedResults) window.scrollTo({ top: cache.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    inputRef.current?.focus();
    const onScroll = () => { cache.scroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sync state → cache
  useEffect(() => {
    cache.query = query;
    cache.tab = tab;
    cache.draftResults = draftResults;
    cache.peopleResults = peopleResults;
  }, [query, tab, draftResults, peopleResults]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDraftResults([]);
      setPeopleResults([]);
      return;
    }
    setSearchParams(q ? { q } : {});
    const t = setTimeout(() => doSearch(q), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Load follow states when people results change
  useEffect(() => {
    if (!user || peopleResults.length === 0) return;
    const ids = peopleResults.map((p) => p.id).filter((id) => id !== user.id);
    if (ids.length === 0) return;
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .in("following_id", ids)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data ?? []).forEach((r: { following_id: string }) => { map[r.following_id] = true; });
        setFollowed(map);
      });
  }, [user, peopleResults]);

  const doSearch = async (q: string) => {
    // Only show skeleton if we have no results to display from cache
    if (cache.draftResults.length === 0 && cache.peopleResults.length === 0) setLoading(true);
    const pattern = `%${q}%`;

    // Fetch drafts WITHOUT profiles join + people in parallel
    const [draftsRes, peopleRes] = await Promise.all([
      supabase
        .from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .ilike("content", pattern)
        .eq("published", true)
        .is("reply_to_id" as any, null)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio")
        .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`)
        .limit(20),
    ]);

    const rawDrafts = (draftsRes.data ?? []) as Array<{
      id: string; title: string | null; content: string; created_at: string;
      author_id: string | null; quote_of_id?: string | null;
    }>;

    let draftPieces: Piece[] = [];

    if (rawDrafts.length > 0) {
      // Batch-fetch author profiles + quoted drafts in parallel
      const authorIds = [...new Set(rawDrafts.map((d) => d.author_id).filter(Boolean))] as string[];
      const quoteIds  = [...new Set(rawDrafts.map((d) => d.quote_of_id).filter(Boolean) as string[])];

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

      draftPieces = rawDrafts.map((d) => {
        const profile = d.author_id ? profileMap[d.author_id] ?? null : null;
        const name   = profile?.display_name ?? d.author_id?.slice(0, 8) ?? "drafter";
        const handle = profile?.handle ?? name.toLowerCase().replace(/\s+/g, ".");
        const piece: Piece = {
          id: d.id, title: d.title ?? null, body: d.content, created_at: d.created_at,
          authorId: d.author_id ?? d.id, authorName: name, authorHandle: handle,
          authorAvatarUrl: profile?.avatar_url ?? null,
          likes: 0, comments: 0, reposts: 0,
          liked: false, reposted: false, bookmarked: false,
        };
        if (d.quote_of_id && quotedPieceMap[d.quote_of_id]) {
          piece.quoteOf = quotedPieceMap[d.quote_of_id];
        }
        return piece;
      });

      // Enrich with like counts
      const ids = draftPieces.map((p) => p.id);
      const [lc, myLikes] = await Promise.all([
        supabase.from("likes").select("draft_id").in("draft_id", ids),
        user
          ? supabase.from("likes").select("draft_id").eq("user_id", user.id).in("draft_id", ids)
          : Promise.resolve({ data: [] }),
      ]);
      const likeMap: Record<string,number> = {};
      const myLikedSet = new Set((myLikes.data ?? []).map((r: {draft_id:string}) => r.draft_id));
      (lc.data ?? []).forEach((r: {draft_id:string}) => { likeMap[r.draft_id] = (likeMap[r.draft_id]??0)+1; });
      draftPieces = draftPieces.map((p) => ({ ...p, likes: likeMap[p.id]??0, liked: myLikedSet.has(p.id) }));
    }

    setDraftResults(draftPieces);
    setPeopleResults((peopleRes.data ?? []) as PersonResult[]);
    setLoading(false);
  };

  const toggleFollow = async (personId: string) => {
    if (!user) { navigate("/auth"); return; }
    const next = !followed[personId];
    setFollowed((f) => ({ ...f, [personId]: next }));
    if (next) await supabase.from("follows").insert({ follower_id: user.id, following_id: personId });
    else await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", personId);
  };

  const handleLike = async (id: string) => {
    if (!user) { navigate("/auth"); return; }
    const piece = draftResults.find((p) => p.id === id)!;
    const next = !piece.liked;
    setDraftResults((ps) => ps.map((p) => p.id === id ? { ...p, liked: next, likes: p.likes + (next ? 1 : -1) } : p));
    if (next) await supabase.from("likes").insert({ draft_id: id, user_id: user.id });
    else await supabase.from("likes").delete().eq("draft_id", id).eq("user_id", user.id);
  };

  const hasQuery = query.trim().length > 0;

  return (
    <Layout>
      {/* Search bar */}
      <div className="sticky top-0 bg-background z-[5] border-b border-rule/50 px-4 py-3">
        <div className="relative flex items-center gap-2">
          <button
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1 flex-shrink-0"
            onClick={() => navigate(-1)}
          >
            <i className="ti ti-arrow-left text-[20px]" />
          </button>
          <div className="relative flex-1">
            <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search drafts.rw"
              className="w-full bg-paper border border-rule/50 py-2 pl-9 pr-3 text-[13px] font-sans text-ink outline-none focus:border-terra transition-colors placeholder:text-ink-muted"
            />
            {query && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink"
                onClick={() => setQuery("")}
              >
                <i className="ti ti-x text-[14px]" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs — only shown when there's a query */}
        {hasQuery && (
          <div className="flex mt-2 -mx-4 border-b border-rule/30">
            {(["drafts", "people"] as SearchTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 font-mono text-[11px] tracking-[0.14em] uppercase py-2 border-none bg-transparent cursor-pointer border-b-2 transition-colors
                  ${tab === t ? "text-ink border-terra" : "text-ink-muted border-transparent hover:text-ink-dim"}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty state — no query */}
      {!hasQuery && (
        <div className="px-4 py-16 text-center">
          <i className="ti ti-search text-[36px] text-ink-muted block mb-3" />
          <p className="font-serif italic text-ink-muted">search for pieces or writers.</p>
        </div>
      )}

      {/* Loading */}
      {loading && hasQuery && (
        <div>
          <SkeletonPiece variant={0} />
          <SkeletonPiece variant={1} />
          <SkeletonPiece variant={2} />
        </div>
      )}

      {/* Results */}
      {!loading && hasQuery && (
        <>
          {tab === "drafts" && (
            draftResults.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="font-serif italic text-ink-muted">no pieces found for "<strong>{query}</strong>"</p>
              </div>
            ) : (
              <div>
                {draftResults.map((p) => (
                  <PieceCard
                    key={p.id}
                    piece={p}
                    onLike={handleLike}
                    onAuthOpen={() => navigate("/auth")}
                    isAuthenticated={!!user}
                  />
                ))}
              </div>
            )
          )}

          {tab === "people" && (
            peopleResults.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="font-serif italic text-ink-muted">no writers found for "<strong>{query}</strong>"</p>
              </div>
            ) : (
              <div>
                {peopleResults.map((person) => {
                  const name   = person.display_name ?? person.handle ?? "drafter";
                  const handle = person.handle ?? "";
                  return (
                    <div
                      key={person.id}
                      className="px-4 py-4 border-b border-rule/50 flex items-center gap-3 cursor-pointer hover:bg-paper/60 transition-colors"
                      onClick={() => handle && navigate(`/${handle}`)}
                    >
                      <Avatar name={name} id={person.id} avatarUrl={person.avatar_url} size={42} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] text-ink truncate">{name}</div>
                        {handle && <div className="font-mono text-[11px] text-ink-muted">@{handle}</div>}
                        {person.bio && (
                          <p className="font-serif text-[12px] text-ink-dim leading-snug mt-0.5 truncate">{person.bio}</p>
                        )}
                      </div>
                      {user && user.id !== person.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFollow(person.id); }}
                          className={`border text-[10px] font-mono tracking-[0.08em] px-3 py-1 flex-shrink-0 cursor-pointer transition-colors
                            ${followed[person.id]
                              ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                              : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                        >
                          {followed[person.id] ? "following" : "follow"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}
    </Layout>
  );
}
