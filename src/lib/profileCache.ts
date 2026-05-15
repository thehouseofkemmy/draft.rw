import type { Piece } from "@/components/feed/PieceCard";

export type ProfileCacheEntry = {
  profile: {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    bio: string | null;
    created_at: string;
  } | null;
  pieces: Piece[];
  repostPiecesTab: Piece[];
  followers: number;
  following: number;
  isFollowing: boolean;
  tab: "pieces" | "reposts";
  scroll: number;
  loadedAt: number;
};

// Shared across the whole app — UserProfile reads it, Index writes to it after publish
export const profileCache: Map<string, ProfileCacheEntry> = new Map();

/** Prepend a new piece to the cached pieces list for a handle, if that entry exists */
export function prependToProfileCache(handle: string, piece: Piece) {
  const entry = profileCache.get(handle);
  if (!entry) return;
  entry.pieces = [piece, ...entry.pieces];
  // Reset loadedAt so the profile page background-refreshes on next visit
  entry.loadedAt = 0;
}

/** Invalidate a handle's cache so next visit always does a fresh fetch */
export function invalidateProfileCache(handle: string) {
  const entry = profileCache.get(handle);
  if (entry) entry.loadedAt = 0;
}

/**
 * Seed a partial profile entry from data we already have (e.g. a PieceCard author).
 * Only writes if there's no fully-loaded entry for this handle already.
 * The profile page will still fetch fresh data on mount (loadedAt stays 0),
 * but it can render the header avatar + name instantly from this stub.
 */
export function seedProfileMeta(
  handle: string,
  meta: { id: string; display_name: string | null; avatar_url: string | null; handle: string | null },
) {
  // Don't overwrite a fully-loaded entry
  const existing = profileCache.get(handle);
  if (existing && existing.loadedAt > 0) return;

  profileCache.set(handle, {
    profile: {
      id: meta.id,
      handle: meta.handle,
      display_name: meta.display_name,
      avatar_url: meta.avatar_url,
      cover_url: null,
      bio: null,
      created_at: "",
    },
    pieces: existing?.pieces ?? [],
    repostPiecesTab: existing?.repostPiecesTab ?? [],
    followers: existing?.followers ?? 0,
    following: existing?.following ?? 0,
    isFollowing: existing?.isFollowing ?? false,
    tab: existing?.tab ?? "pieces",
    scroll: existing?.scroll ?? 0,
    loadedAt: 0, // forces a real fetch on next profile visit
  });
}
