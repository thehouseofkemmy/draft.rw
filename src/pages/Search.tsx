import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/draft/Layout";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";
import Avatar from "@/components/feed/Avatar";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";
import { formatDistanceToNow } from "date-fns";
import { cacheMany } from "@/lib/pieceCache";
import { seedProfileMeta } from "@/lib/profileCache";

type SearchTab = "drafts" | "people";

type PersonResult = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type ExploreData = {
  trending: Piece[];
  suggested: PersonResult[];
  fromFollows: Piece[];
};

// Module-level cache
const cache: {
  query: string;
  tab: SearchTab;
  draftResults: Piece[];
  peopleResults: PersonResult[];
  explore: ExploreData | null;
  scroll: number;
} = { query: "", tab: "drafts", draftResults: [], peopleResults: [], explore: null, scroll: 0 };

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const initialQuery = searchParams.get("q") ?? cache.query;
  const [query, setQuery]     = useState(initialQuery);
  const [tab, setTab]         = useState<SearchTab>(cache.tab);
  const [draftResults, setDraftResults] = useState<Piece[]>(cache.draftResults);
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>(cache.peopleResults);
  const [loading, setLoading] = useState(false);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [explore, setExplore] = useState<ExploreData | null>(cache.explore);
  const [exploreLoading, setExploreLoading] = useState(!cache.explore);

  useLayoutEffect(() => {
    window.scrollTo({ top: cache.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onScroll = () => { cache.scroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    cache.query = query;
    cache.tab = tab;
    cache.draftResults = draftResults;
    cache.peopleResults = peopleResults;
  }, [query, tab, draftResults, peopleResults]);

  // Load explore content once
  useEffect(() => {
    if (cache.explore) return;
    loadExplore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Search with debounce
  useEffect(() => {
    const q = query.trim();
    if (!q) { setDraftResults([]); setPeopleResults([]); return; }
    setSearchParams(q ? { q } : {});
    const t = setTimeout(() => doSearch(q), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Follow states for people results
  useEffect(() => {
    if (!user || peopleResults.length === 0) return;
    const ids = peopleResults.map((p) => p.id).filter((id) => id !== user.id);
    if (!ids.length) return;
    supabase.from("follows").select("following_id")
      .eq("follower_id", user.id).in("following_id", ids)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data ?? []).forEach((r: any) => { map[r.following_id] = true; });
        setFollowed(map);
      });
  }, [user, peopleResults]);

  const loadExplore = async () => {
    setExploreLoading(true);

    // Trending: most liked in last 14 days
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: likeRows } = await supabase
      .from("likes").select("draft_id")
      .gte("created_at", since);
    const likeCount: Record<string, number> = {};
    (likeRows ?? []).forEach((r: any) => { likeCount[r.draft_id] = (likeCount[r.draft_id] ?? 0) + 1; });
    const topIds = Object.entries(likeCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);

    // From follows
    let followIds: string[] = [];
    if (user) {
      const { data: fRows } = await supabase
        .from("follows").select("following_id").eq("follower_id", user.id);
      followIds = (fRows ?? []).map((r: any) => r.following_id);
    }

    // Suggested people: active writers not yet followed
    const { data: recentAuthors } = await supabase
      .from("drafts").select("author_id").eq("published", true)
      .order("created_at", { ascending: false }).limit(100);
    const authorIds = [...new Set((recentAuthors ?? []).map((d: any) => d.author_id).filter(Boolean))] as string[];
    const suggestIds = authorIds
      .filter((id) => id !== user?.id && !followIds.includes(id))
      .slice(0, 6);

    const [trendingRes, fromFollowsRes, suggestedRes] = await Promise.all([
      topIds.length > 0
        ? supabase.from("drafts").select("id, title, content, created_at, author_id, quote_of_id")
            .in("id", topIds).eq("published", true)
        : Promise.resolve({ data: [] }),
      followIds.length > 0
        ? supabase.from("drafts").select("id, title, content, created_at, author_id, quote_of_id")
            .in("author_id", followIds).eq("published", true)
            .is("reply_to_id" as any, null)
            .order("created_at", { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      suggestIds.length > 0
        ? supabase.from("profiles").select("id, handle, display_name, avatar_url, bio")
            .in("id", suggestIds)
        : Promise.resolve({ data: [] }),
    ]);

    const allDraftRows = [
      ...(trendingRes.data ?? []),
      ...(fromFollowsRes.data ?? []),
    ] as any[];

    const enriched = await enrichDrafts(allDraftRows);
    const trendingMap = new Set(topIds);

    const trendingPieces = enriched.filter((p) => trendingMap.has(p.id))
      .sort((a, b) => (likeCount[b.id] ?? 0) - (likeCount[a.id] ?? 0));
    const fromFollowsPieces = enriched.filter((p) => !trendingMap.has(p.id));
    const suggestedPeople = (suggestedRes.data ?? []) as PersonResult[];

    setExplore({ trending: trendingPieces, fromFollows: fromFollowsPieces, suggested: suggestedPeople });
    cache.explore = { trending: trendingPieces, fromFollows: fromFollowsPieces, suggested: suggestedPeople };
    setExploreLoading(false);

    // Seed piece + profile caches
    cacheMany([...trendingPieces, ...fromFollowsPieces]);
    [...trendingPieces, ...fromFollowsPieces].forEach((p) => {
      if (p.authorHandle) seedProfileMeta(p.authorHandle, {
        id: p.authorId, display_name: p.authorName,
        avatar_url: p.authorAvatarUrl ?? null, handle: p.authorHandle,
      });
    });
    suggestedPeople.forEach((person) => {
      if (person.handle) seedProfileMeta(person.handle, {
        id: person.id, display_name: person.display_name,
        avatar_url: person.avatar_url ?? null, handle: person.handle,
      });
    });
  };

  const enrichDrafts = async (rows: any[]): Promise<Piece[]> => {
    if (!rows.length) return [];
    const authorIds = [...new Set(rows.map((d) => d.author_id).filter(Boolean))] as string[];
    const { data: profiles } = await supabase
      .from("profiles").select("id, handle, display_name, avatar_url").in("id", authorIds);
    const profileMap: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    return rows.map((d) => {
      const p = d.author_id ? profileMap[d.author_id] ?? null : null;
      return {
        id: d.id, title: d.title ?? null, body: d.content, created_at: d.created_at,
        authorId: d.author_id ?? d.id,
        authorName: p?.display_name ?? d.author_id?.slice(0, 8) ?? "drafter",
        authorHandle: p?.handle ?? "",
        authorAvatarUrl: p?.avatar_url ?? null,
        likes: 0, comments: 0, reposts: 0,
        liked: false, reposted: false, bookmarked: false,
      } as Piece;
    });
  };

  const doSearch = async (q: string) => {
    if (!cache.draftResults.length && !cache.peopleResults.length) setLoading(true);
    const pattern = `%${q}%`;
    const [draftsRes, peopleRes] = await Promise.all([
      supabase.from("drafts").select("id, title, content, created_at, author_id, quote_of_id")
        .ilike("content", pattern).eq("published", true)
        .is("reply_to_id" as any, null)
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("profiles").select("id, handle, display_name, avatar_url, bio")
        .or(`display_name.ilike.${pattern},handle.ilike.${pattern}`).limit(20),
    ]);

    const enriched = await enrichDrafts((draftsRes.data ?? []) as any[]);
    const people = (peopleRes.data ?? []) as PersonResult[];
    setDraftResults(enriched);
    setPeopleResults(people);
    setLoading(false);

    // Seed caches for instant navigation
    cacheMany(enriched);
    enriched.forEach((p) => {
      if (p.authorHandle) seedProfileMeta(p.authorHandle, {
        id: p.authorId, display_name: p.authorName,
        avatar_url: p.authorAvatarUrl ?? null, handle: p.authorHandle,
      });
    });
    people.forEach((person) => {
      if (person.handle) seedProfileMeta(person.handle, {
        id: person.id, display_name: person.display_name,
        avatar_url: person.avatar_url ?? null, handle: person.handle,
      });
    });
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
      {/* Search bar — no autofocus */}
      <div className="sticky top-0 bg-background z-[5] border-b border-rule/50 px-4 py-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search drafts, writers…"
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

        {/* Tabs — always rendered to prevent height shift */}
        <div className={`flex mt-2 -mx-4 border-b border-rule/30 transition-opacity duration-150 ${hasQuery ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
          {(["drafts", "people"] as SearchTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 font-mono text-[11px] tracking-[0.14em] uppercase py-2 border-none bg-transparent cursor-pointer border-b-2 transition-colors
                ${tab === t ? "text-ink border-terra" : "text-ink-muted border-transparent hover:text-ink-dim"}`}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* ── SEARCH RESULTS ── */}
      {hasQuery && (
        <>
          {loading && <div>{[0,1,2].map((i) => <SkeletonPiece key={i} variant={i} />)}</div>}
          {!loading && tab === "drafts" && (
            draftResults.length === 0
              ? <Empty>no pieces found for "<strong>{query}</strong>"</Empty>
              : draftResults.map((p) => <PieceCard key={p.id} piece={p} onLike={handleLike} onAuthOpen={() => navigate("/auth")} isAuthenticated={!!user} />)
          )}
          {!loading && tab === "people" && (
            peopleResults.length === 0
              ? <Empty>no writers found for "<strong>{query}</strong>"</Empty>
              : peopleResults.map((person) => {
                  const name = person.display_name ?? person.handle ?? "drafter";
                  const handle = person.handle ?? "";
                  return (
                    <div key={person.id}
                      className="px-4 py-4 border-b border-rule/50 flex items-center gap-3 cursor-pointer hover:bg-paper/60 transition-colors"
                      onClick={() => handle && navigate(`/${handle}`)}
                    >
                      <Avatar name={name} id={person.id} avatarUrl={person.avatar_url} size={42} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] text-ink truncate">{name}</div>
                        {handle && <div className="font-mono text-[11px] text-ink-muted">@{handle}</div>}
                        {person.bio && <p className="font-serif text-[12px] text-ink-dim leading-snug mt-0.5 truncate">{person.bio}</p>}
                      </div>
                      {user && user.id !== person.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFollow(person.id); }}
                          className={`border text-[10px] font-mono tracking-[0.08em] px-3 py-1 flex-shrink-0 cursor-pointer transition-colors
                            ${followed[person.id]
                              ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                              : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                        >{followed[person.id] ? "following" : "follow"}</button>
                      )}
                    </div>
                  );
                })
          )}
        </>
      )}

      {/* ── EXPLORE (no query) ── */}
      {!hasQuery && (
        exploreLoading ? (
          <div>{[0,1,2,3].map((i) => <SkeletonPiece key={i} variant={i % 3} />)}</div>
        ) : (
          <>
            {/* Suggested people */}
            {explore && explore.suggested.length > 0 && (
              <section className="border-b border-rule/50 pb-2">
                <SectionLabel>writers to follow</SectionLabel>
                {explore.suggested.map((person) => {
                  const name = person.display_name ?? person.handle ?? "drafter";
                  const handle = person.handle ?? "";
                  return (
                    <div key={person.id}
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-paper/60 transition-colors"
                      onClick={() => handle && navigate(`/${handle}`)}
                    >
                      <Avatar name={name} id={person.id} avatarUrl={person.avatar_url} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[13px] text-ink truncate flex items-center gap-1">
                          <span>{name}</span>
                          {isVerified(handle) && <VerifiedBadge size={12} />}
                        </div>
                        {handle && <div className="font-mono text-[11px] text-ink-muted">@{handle}</div>}
                        {person.bio && <p className="font-serif text-[12px] text-ink-dim truncate mt-0.5">{person.bio}</p>}
                      </div>
                      {user && user.id !== person.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFollow(person.id); }}
                          className={`border text-[10px] font-mono tracking-[0.08em] px-3 py-1 flex-shrink-0 cursor-pointer transition-colors
                            ${followed[person.id]
                              ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                              : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                        >{followed[person.id] ? "following" : "follow"}</button>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Trending */}
            {explore && explore.trending.length > 0 && (
              <section className="border-b border-rule/50">
                <SectionLabel>trending this week</SectionLabel>
                {explore.trending.map((p) => (
                  <PieceCard key={p.id} piece={p} onLike={() => {}} onAuthOpen={() => navigate("/auth")} isAuthenticated={!!user} />
                ))}
              </section>
            )}

            {/* From follows */}
            {explore && explore.fromFollows.length > 0 && (
              <section>
                <SectionLabel>from people you follow</SectionLabel>
                {explore.fromFollows.map((p) => (
                  <PieceCard key={p.id} piece={p} onLike={() => {}} onAuthOpen={() => navigate("/auth")} isAuthenticated={!!user} />
                ))}
              </section>
            )}

            {explore && !explore.trending.length && !explore.fromFollows.length && !explore.suggested.length && (
              <div className="px-4 py-16 text-center">
                <i className="ti ti-compass text-[36px] text-ink-muted block mb-3" />
                <p className="font-serif italic text-ink-muted">follow some writers to see their work here.</p>
              </div>
            )}
          </>
        )
      )}
    </Layout>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-4 pb-1 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
      {children}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-serif italic text-ink-muted">{children}</p>
    </div>
  );
}
