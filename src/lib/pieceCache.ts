import type { Piece } from "@/components/feed/PieceCard";

/**
 * Module-level piece cache.
 * Populated by PieceCard on click (and by every feed/search/profile after load).
 * Read by DraftDetail on mount so the content area shows instantly — no skeleton.
 */
const pieceCache = new Map<string, Piece>();

export function cachePiece(p: Piece) {
  pieceCache.set(p.id, p);
}

export function cacheMany(pieces: Piece[]) {
  pieces.forEach(cachePiece);
}

export function getCachedPiece(id: string): Piece | undefined {
  return pieceCache.get(id);
}
