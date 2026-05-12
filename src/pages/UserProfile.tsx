import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Layout from "@/components/draft/Layout";
import Avatar from "@/components/feed/Avatar";
import PieceCard, { Piece, QuotedPiece } from "@/components/feed/PieceCard";
import SkeletonPiece from "@/components/feed/SkeletonPiece";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";
import AvatarCropModal from "@/components/profile/AvatarCropModal";
import CoverPickerModal, { parseCover } from "@/components/profile/CoverPickerModal";
import FollowListModal from "@/components/profile/FollowListModal";
import ProfileSidebar from "@/components/profile/ProfileSidebar";

// Per-handle cache — visiting /alice then /bob then back to /alice loads from memory
type ProfileCacheEntry = {
  profile: Profile | null;
  pieces: Piece[];
  repostPiecesTab: Piece[];
  followers: number;
  following: number;
  isFollowing: boolean;
  tab: "pieces" | "reposts";
  scroll: number;
  loadedAt: number;
};
const profileCache: Map<string, ProfileCacheEntry> = new Map();

type Profile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  created_at: string;
};

type RawDraft = {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  author_id: string | null;
  quote_of_id?: string | null;
};

type ProfileTab = "pieces" | "reposts";

export default function UserProfile() {
  const { handle } = useParams<{ handle: string }>();
  const { user } = useAuth();
  const { profile: myProfile, refresh: refreshMyProfile } = useProfile();
  const navigate = useNavigate();

  const cached = handle ? profileCache.get(handle) : undefined;
  const [profile, setProfile]               = useState<Profile | null>(cached?.profile ?? null);
  const [pieces, setPieces]                 = useState<Piece[]>(cached?.pieces ?? []);
  const [repostPiecesTab, setRepostPiecesTab] = useState<Piece[]>(cached?.repostPiecesTab ?? []);
  const [tab, setTab]                       = useState<ProfileTab>(cached?.tab ?? "pieces");
  const [followers, setFollowers]           = useState(cached?.followers ?? 0);
  const [following, setFollowing]           = useState(cached?.following ?? 0);
  const [isFollowing, setIsFollowing]       = useState(cached?.isFollowing ?? false);
  const [followBusy, setFollowBusy]         = useState(false);
  const [loading, setLoading]               = useState(!cached);
  const [notFound, setNotFound]             = useState(false);

  // Restore scroll on mount, persist as user scrolls
  useLayoutEffect(() => {
    if (cached) window.scrollTo({ top: cached.scroll, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);
  useEffect(() => {
    const onScroll = () => {
      if (!handle) return;
      const entry = profileCache.get(handle);
      if (entry) entry.scroll = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [handle]);

  // Sync state → cache whenever something changes
  useEffect(() => {
    if (!handle) return;
    const existing = profileCache.get(handle);
    profileCache.set(handle, {
      profile,
      pieces,
      repostPiecesTab,
      followers,
      following,
      isFollowing,
      tab,
      scroll: existing?.scroll ?? 0,
      loadedAt: existing?.loadedAt ?? 0,
    });
  }, [handle, profile, pieces, repostPiecesTab, followers, following, isFollowing, tab]);

  // Edit mode
  const [editing, setEditing]               = useState(false);
  const [editName, setEditName]             = useState("");
  const [editBio, setEditBio]               = useState("");
  const [editHandle, setEditHandle]         = useState("");
  const [editSaving, setEditSaving]         = useState(false);
  const [editError, setEditError]           = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Photo upload modals
  const [cropFile,        setCropFile]        = useState<File | null>(null);
  const [showCoverPicker, setShowCoverPicker]  = useState(false);
  // Follow list modal
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);

  const isOwnProfile = !!user && profile?.id === user.id;

  useEffect(() => {
    if (!handle) return;
    const stale = !cached || Date.now() - cached.loadedAt > 60_000;
    if (stale) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, user]);

  const loadProfile = async () => {
    if (!handle) return;
    if (!profileCache.get(handle)?.pieces.length) setLoading(true);

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, cover_url, bio, created_at")
      .eq("handle", handle)
      .maybeSingle();

    if (!prof) { setNotFound(true); setLoading(false); return; }
    setNotFound(false);
    setProfile(prof as Profile);

    const [draftsRes, repostsRes, followersRes, followingRes] = await Promise.all([
      supabase
        .from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .eq("author_id", prof.id)
        .eq("published", true)
        .is("reply_to_id" as any, null)
        .order("created_at", { ascending: false }),
      // Reposts: just get the draft IDs + repost times (no nested join)
      supabase
        .from("reposts")
        .select("created_at, draft_id")
        .eq("user_id", prof.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
    ]);

    setFollowers(followersRes.count ?? 0);
    setFollowing(followingRes.count ?? 0);

    // Map own drafts
    const rawDrafts = (draftsRes.data ?? []) as RawDraft[];
    const draftPieces: Piece[] = rawDrafts.map((d) => ({
      id: d.id, title: d.title ?? null, body: d.content, created_at: d.created_at,
      authorId: prof.id, authorName: prof.display_name ?? handle,
      authorHandle: handle, authorAvatarUrl: prof.avatar_url,
      likes: 0, comments: 0, reposts: 0,
      liked: false, reposted: false, bookmarked: false,
    }));

    // Map reposts — fetch draft details + original author profiles separately
    const repostRows = (repostsRes.data ?? []) as Array<{ created_at: string; draft_id: string }>;
    const repostDraftIds = repostRows.map((r) => r.draft_id).filter(Boolean);
    let repostPieces: Piece[] = [];

    // Track draftId → quote_of_id for both own and reposted drafts (built incrementally below)
    const pieceToQuoteOf: Record<string, string> = {};
    rawDrafts.forEach((d) => { if (d.quote_of_id) pieceToQuoteOf[d.id] = d.quote_of_id; });

    if (repostDraftIds.length > 0) {
      const { data: repostDraftsData } = await supabase
        .from("drafts")
        .select("id, title, content, created_at, author_id, quote_of_id")
        .in("id", repostDraftIds);

      if (repostDraftsData && repostDraftsData.length > 0) {
        const repostAuthorIds = [
          ...new Set((repostDraftsData as RawDraft[]).map((d) => d.author_id).filter(Boolean)),
        ] as string[];
        const { data: repostProfiles } = repostAuthorIds.length > 0
          ? await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", repostAuthorIds)
          : { data: [] };

        const repostProfileMap: Record<string, any> = {};
        (repostProfiles ?? []).forEach((p: any) => { repostProfileMap[p.id] = p; });

        // Map repost time by draft_id
        const repostTimeMap: Record<string, string> = {};
        repostRows.forEach((r) => { repostTimeMap[r.draft_id] = r.created_at; });

        repostPieces = (repostDraftsData as RawDraft[]).map((d) => {
          if (d.quote_of_id) pieceToQuoteOf[d.id] = d.quote_of_id;
          const origProfile = d.author_id ? repostProfileMap[d.author_id] ?? null : null;
          const origName   = origProfile?.display_name ?? d.author_id?.slice(0, 8) ?? "drafter";
          const origHandle = origProfile?.handle ?? origName.toLowerCase().replace(/\s+/g, ".");
          return {
            id: d.id,
            title: d.title ?? null,
            body: d.content,
            created_at: repostTimeMap[d.id] ?? d.created_at,
            authorId: d.author_id ?? d.id,
            authorName: origName,
            authorHandle: origHandle,
            authorAvatarUrl: origProfile?.avatar_url ?? null,
            likes: 0, comments: 0, reposts: 0,
            liked: false, reposted: true, bookmarked: false,
            repostedByHandle: prof.handle ?? handle,
          } as Piece;
        });
      }
    }

    const allQuoteOfIds = [...new Set(Object.values(pieceToQuoteOf))];
    const allDraftIds = [...new Set([...rawDrafts.map((d) => d.id), ...repostPieces.map((p) => p.id)])];

    // Enrich ALL pieces (own + reposts) with counts + quoted embeds
    if (allDraftIds.length > 0) {
      // @ts-ignore reply_to_id type inference depth
      const [lc, cc, rc, myLikes, quotedRes] = await Promise.all([
        supabase.from("likes").select("draft_id").in("draft_id", allDraftIds),
        supabase.from("drafts").select("reply_to_id").in("reply_to_id", allDraftIds),
        supabase.from("reposts").select("draft_id").in("draft_id", allDraftIds),
        user
          ? supabase.from("likes").select("draft_id").eq("user_id", user.id).in("draft_id", allDraftIds)
          : Promise.resolve({ data: [] }),
        allQuoteOfIds.length > 0
          ? supabase.from("drafts").select("id, content, author_id").in("id", allQuoteOfIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Build quoted piece map (fetch any author profiles we don't already have)
      const quotedDrafts = (quotedRes.data ?? []) as Array<{ id: string; content: string; author_id: string | null }>;
      const quotedAuthorIds = [...new Set(quotedDrafts.map((d) => d.author_id).filter(Boolean))] as string[];
      const qProfileMap: Record<string, any> = {};
      if (quotedAuthorIds.length > 0) {
        const { data: qProfs } = await supabase
          .from("profiles").select("id, display_name, handle, avatar_url").in("id", quotedAuthorIds);
        (qProfs ?? []).forEach((p: any) => { qProfileMap[p.id] = p; });
      }
      const quotedPieceMap: Record<string, QuotedPiece> = {};
      quotedDrafts.forEach((qd) => {
        const qp = qd.author_id ? qProfileMap[qd.author_id] ?? null : null;
        const qName   = qp?.display_name ?? qd.author_id?.slice(0, 8) ?? "drafter";
        const qHandle = qp?.handle ?? qName.toLowerCase().replace(/\s+/g, ".");
        quotedPieceMap[qd.id] = {
          id: qd.id, body: qd.content,
          authorName: qName, authorHandle: qHandle,
          authorAvatarUrl: qp?.avatar_url ?? null,
        };
      });

      const likeMap: Record<string,number> = {};
      const cmtMap:  Record<string,number> = {};
      const rpMap:   Record<string,number> = {};
      const myLikedSet = new Set((myLikes.data ?? []).map((r: {draft_id:string}) => r.draft_id));
      (lc.data ?? []).forEach((r: {draft_id:string}) => { likeMap[r.draft_id] = (likeMap[r.draft_id]??0)+1; });
      (cc.data ?? []).forEach((r: {reply_to_id:string}) => { if (r.reply_to_id) cmtMap[r.reply_to_id] = (cmtMap[r.reply_to_id]??0)+1; });
      (rc.data ?? []).forEach((r: {draft_id:string}) => { rpMap[r.draft_id]   = (rpMap[r.draft_id]??0)+1; });

      [...draftPieces, ...repostPieces].forEach((p) => {
        p.likes    = likeMap[p.id] ?? 0;
        p.comments = cmtMap[p.id] ?? 0;
        p.reposts  = rpMap[p.id] ?? 0;
        p.liked    = myLikedSet.has(p.id);
        const qid = pieceToQuoteOf[p.id];
        if (qid && quotedPieceMap[qid]) p.quoteOf = quotedPieceMap[qid];
      });
    }

    // "Pieces" tab = own drafts only, sorted newest first
    setPieces(draftPieces.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    // "Reposts" tab = reposted pieces, sorted by repost time
    setRepostPiecesTab(repostPieces.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

    // Is current user following this profile?
    if (user && user.id !== prof.id) {
      const { data: fol } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", prof.id)
        .maybeSingle();
      setIsFollowing(!!fol);
    }

    setLoading(false);
    // Stamp loadedAt on the cache entry so future visits within 60s skip the refetch
    if (handle) {
      const entry = profileCache.get(handle);
      if (entry) entry.loadedAt = Date.now();
    }
  };

  const toggleFollow = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!profile) return;
    setFollowBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    setFollowers((f) => f + (next ? 1 : -1));
    if (next) {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    } else {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    }
    setFollowBusy(false);
  };

  const uploadAvatar = async (blob: Blob) => {
    if (!user) return;
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    setEditSaving(true);
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) { setEditError(error.message); setEditSaving(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setProfile((p) => p ? { ...p, avatar_url: data.publicUrl } : p);
    refreshMyProfile();
    setEditSaving(false);
    setCropFile(null);
  };

  const saveCover = async (coverUrl: string) => {
    if (!user) return;
    await supabase.from("profiles").update({ cover_url: coverUrl }).eq("id", user.id);
    setProfile((p) => p ? { ...p, cover_url: coverUrl } : p);
    setShowCoverPicker(false);
  };

  const saveEdit = async () => {
    if (!user) return;
    setEditError("");
    const HANDLE_RE = /^[a-z0-9_]{2,24}$/;
    if (editHandle && !HANDLE_RE.test(editHandle)) {
      setEditError("handle: 2–24 chars, letters/numbers/underscore");
      return;
    }
    setEditSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: editName.trim() || undefined,
      bio: editBio.trim() || null,
      handle: editHandle || undefined,
    }).eq("id", user.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    setEditing(false);
    refreshMyProfile();
    // If handle changed, navigate to new handle
    if (editHandle && editHandle !== handle) {
      navigate(`/${editHandle}`);
    } else {
      loadProfile();
    }
  };

  const startEdit = () => {
    setEditName(profile?.display_name ?? "");
    setEditBio(profile?.bio ?? "");
    setEditHandle(profile?.handle ?? "");
    setEditError("");
    setEditing(true);
  };

  if (loading) {
    return (
      <Layout>
        {/* Header row skeleton */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-rule/50 animate-pulse">
          <div className="w-5 h-5 rounded bg-paper" />
          <div className="space-y-1.5">
            <div className="h-3.5 bg-paper rounded w-28" />
            <div className="h-2.5 bg-paper/70 rounded w-16" />
          </div>
        </div>
        {/* Banner */}
        <div className="h-28 bg-paper/60 animate-pulse" />
        {/* Avatar + actions row */}
        <div className="px-4 animate-pulse">
          <div className="flex items-end justify-between -mt-8 mb-3">
            <div className="w-[72px] h-[72px] rounded-full bg-paper border-4 border-background" />
            <div className="h-7 w-20 bg-paper rounded mt-2" />
          </div>
          {/* Name / handle */}
          <div className="space-y-2 mb-4">
            <div className="h-5 bg-paper rounded w-40" />
            <div className="h-3 bg-paper/70 rounded w-24" />
            <div className="h-3 bg-paper/70 rounded w-[80%] mt-3" />
            <div className="h-3 bg-paper/70 rounded w-[60%]" />
          </div>
          <div className="flex gap-4 mb-3">
            <div className="h-3 bg-paper rounded w-20" />
            <div className="h-3 bg-paper rounded w-20" />
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-rule/50 animate-pulse">
          <div className="flex-1 py-3 flex justify-center">
            <div className="h-3 bg-paper rounded w-12" />
          </div>
          <div className="flex-1 py-3 flex justify-center">
            <div className="h-3 bg-paper rounded w-12" />
          </div>
        </div>
        {/* Pieces */}
        <SkeletonPiece variant={0} />
        <SkeletonPiece variant={1} />
        <SkeletonPiece variant={2} />
      </Layout>
    );
  }

  if (notFound || !profile) {
    return (
      <Layout>
        <div className="px-4 py-16 text-center">
          <p className="font-serif text-[20px] text-ink mb-2">@{handle}</p>
          <p className="font-serif italic text-ink-muted">this account doesn't exist.</p>
        </div>
      </Layout>
    );
  }

  const displayName = profile.display_name ?? profile.handle ?? "drafter";

  return (
    <>
    <Layout sidebar={<ProfileSidebar excludeId={profile?.id} />}>
      {/* Back */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-rule/50">
        <button
          className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1 -ml-1"
          onClick={() => navigate(-1)}
        >
          <i className="ti ti-arrow-left text-[20px]" />
        </button>
        <div>
          <div className="font-semibold text-[17px] text-ink leading-tight flex items-center gap-1.5">
            {displayName}
            {isVerified(profile.handle) && <VerifiedBadge size={14} />}
          </div>
          <div className="font-mono text-[11px] text-ink-muted">{pieces.length} piece{pieces.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Cover banner */}
      <div
        className={`h-28 relative overflow-hidden ${isOwnProfile ? "cursor-pointer group" : ""}`}
        onClick={() => isOwnProfile && setShowCoverPicker(true)}
      >
        <CoverLayer coverUrl={profile.cover_url} />
        {isOwnProfile && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <div className="bg-black/50 rounded-full p-2">
              <i className="ti ti-camera text-[18px] text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Avatar + actions row */}
      <div className="px-4 relative">
        <div className="flex items-end justify-between -mt-8 mb-3">
          <div
            className="relative"
            onClick={() => isOwnProfile && fileRef.current?.click()}
          >
            <Avatar
              name={displayName}
              id={profile.id}
              avatarUrl={profile.avatar_url}
              size={72}
              className={`border-4 border-background ${isOwnProfile ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
            />
            {isOwnProfile && (
              <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                <i className="ti ti-camera text-[16px] text-white drop-shadow" />
              </span>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCropFile(f);
              e.target.value = ""; // allow same file re-selection
            }}
          />

          <div className="flex items-center gap-2 mt-2">
            {isOwnProfile ? (
              <button
                onClick={startEdit}
                className="border border-rule/60 bg-transparent text-ink font-mono text-[11px] tracking-[0.08em] px-4 py-1.5 cursor-pointer hover:border-ink transition-colors"
              >
                edit profile
              </button>
            ) : (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className={`font-mono text-[11px] tracking-[0.08em] px-4 py-1.5 cursor-pointer transition-colors border disabled:opacity-50
                  ${isFollowing
                    ? "bg-transparent border-rule/60 text-ink hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                    : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
              >
                {isFollowing ? "following" : "follow"}
              </button>
            )}
          </div>
        </div>

        {/* Name / handle / bio */}
        {!editing ? (
          <>
            <div className="font-semibold text-[19px] text-ink leading-tight flex items-center gap-1.5">
              {displayName}
              {isVerified(profile.handle) && <VerifiedBadge size={17} />}
            </div>
            <div className="font-mono text-[12px] text-ink-muted mb-2">@{profile.handle}</div>
            {profile.bio && (
              <p className="font-serif text-[14px] text-ink-dim leading-[1.65] mb-3">{profile.bio}</p>
            )}
            <div className="flex items-center gap-4 mb-1">
              <button
                onClick={() => setFollowModal("followers")}
                className="bg-transparent border-none cursor-pointer p-0 text-[13px] text-ink-dim font-mono hover:underline underline-offset-2 transition-colors"
              >
                <strong className="text-ink">{followers}</strong> follower{followers !== 1 ? "s" : ""}
              </button>
              <button
                onClick={() => setFollowModal("following")}
                className="bg-transparent border-none cursor-pointer p-0 text-[13px] text-ink-dim font-mono hover:underline underline-offset-2 transition-colors"
              >
                <strong className="text-ink">{following}</strong> following
              </button>
            </div>
            <p className="font-mono text-[11px] text-ink-muted mb-4">
              <i className="ti ti-calendar-event mr-1" />
              joined {format(new Date(profile.created_at), "MMMM yyyy")}
            </p>
          </>
        ) : (
          /* Edit form */
          <div className="mb-4 space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted block mb-1">display name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                className="w-full bg-transparent border-b border-rule/80 focus:border-ink py-2 text-[14px] font-sans text-ink outline-none transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted block mb-1">handle</label>
              <div className="flex items-center border-b border-rule/80 focus-within:border-ink transition-colors">
                <span className="font-mono text-[14px] text-ink-muted">@</span>
                <input
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                  className="flex-1 bg-transparent outline-none font-mono text-[14px] text-ink py-2"
                />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted block mb-1">bio</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={200}
                rows={3}
                className="w-full bg-transparent border-b border-rule/80 focus:border-ink py-2 text-[14px] font-serif text-ink outline-none resize-none transition-colors"
              />
            </div>
            {editError && <p className="font-mono text-[10px] text-[hsl(0_60%_48%)]">{editError}</p>}
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="bg-terra text-[hsl(38_35%_96%)] border-none px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-40"
              >
                {editSaving ? "saving…" : "save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="bg-transparent border border-rule/60 text-ink-muted px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:text-ink hover:border-ink"
              >
                cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-rule/50">
        {(["pieces", "reposts"] as ProfileTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 font-mono text-[11px] tracking-[0.14em] uppercase py-3 border-none bg-transparent cursor-pointer border-b-2 transition-colors
              ${tab === t ? "text-ink border-terra" : "text-ink-muted border-transparent hover:text-ink-dim"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "pieces" ? (
        pieces.length === 0 ? (
          <p className="font-serif italic text-ink-muted px-4 py-10 text-center text-[14px]">
            no pieces yet.
          </p>
        ) : (
          <div>
            {pieces.map((p) => (
              <PieceCard
                key={p.id}
                piece={p}
                onLike={async (id) => {
                  if (!user) { navigate("/auth"); return; }
                  const piece = pieces.find((x) => x.id === id)!;
                  const next = !piece.liked;
                  setPieces((ps) => ps.map((x) => x.id === id ? { ...x, liked: next, likes: x.likes + (next ? 1 : -1) } : x));
                  if (next) await supabase.from("likes").insert({ draft_id: id, user_id: user.id });
                  else await supabase.from("likes").delete().eq("draft_id", id).eq("user_id", user.id);
                }}
                onAuthOpen={() => navigate("/auth")}
                isAuthenticated={!!user}
              />
            ))}
          </div>
        )
      ) : (
        repostPiecesTab.length === 0 ? (
          <p className="font-serif italic text-ink-muted px-4 py-10 text-center text-[14px]">
            no reposts yet.
          </p>
        ) : (
          <div>
            {repostPiecesTab.map((p) => (
              <PieceCard
                key={p.id}
                piece={p}
                onLike={() => {}}
                onAuthOpen={() => navigate("/auth")}
                isAuthenticated={!!user}
              />
            ))}
          </div>
        )
      )}
    </Layout>

    {/* Avatar crop modal */}
    {cropFile && (
      <AvatarCropModal
        file={cropFile}
        onSave={uploadAvatar}
        onClose={() => setCropFile(null)}
      />
    )}

    {/* Cover picker modal */}
    {showCoverPicker && profile && (
      <CoverPickerModal
        userId={profile.id}
        currentCover={profile.cover_url}
        onSave={saveCover}
        onClose={() => setShowCoverPicker(false)}
      />
    )}

    {/* Followers / following modal */}
    {followModal && profile && (
      <FollowListModal
        profileId={profile.id}
        type={followModal}
        onClose={() => setFollowModal(null)}
      />
    )}
    </>
  );
}

// ── Cover banner layer ──────────────────────────────────────────────────────
function CoverLayer({ coverUrl }: { coverUrl?: string | null }) {
  const parsed = parseCover(coverUrl);
  if (parsed.type === "gradient") {
    return <div className="absolute inset-0" style={{ background: parsed.css }} />;
  }
  if (parsed.type === "image") {
    return <img src={parsed.src} alt="" className="absolute inset-0 w-full h-full object-cover" />;
  }
  // Default terra gradient
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[hsl(15_54%_37%_/_0.18)] to-[hsl(25_22%_11%_/_0.08)]" />
  );
}
