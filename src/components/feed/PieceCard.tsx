import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Avatar from "@/components/feed/Avatar";
import { HeartIcon, BookmarkIcon } from "@/components/feed/Icons";
import { VerifiedBadge, isVerified } from "@/components/feed/VerifiedBadge";

/** Embedded quoted piece — shown inside the quoting piece */
export type QuotedPiece = {
  id: string;
  body: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string | null;
};

export type Piece = {
  id: string;
  title?: string | null;
  body: string;
  created_at: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string | null;
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  /** Set when this card is a repost — shows "↩ @handle reposted" header */
  repostedByHandle?: string | null;
  /** Embedded quoted piece */
  quoteOf?: QuotedPiece | null;
};

// UUID check — non-UUID ids (sample pieces) won't navigate
const isRealId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const TRUNCATE = 240;

type Props = {
  piece: Piece;
  onLike: (id: string) => void;
  onAuthOpen: (mode: "join") => void;
  isAuthenticated: boolean;
  onRepost?: (id: string, reposted: boolean) => void;
  /** Called after the user successfully posts a quote of this piece, with the new draft's id+createdAt.
   *  Parent should optimistically insert the quote piece into its feed. */
  onQuotePosted?: (quoteDraft: { id: string; created_at: string; body: string; quoteOf: QuotedPiece }) => void;
};

export default function PieceCard({ piece, onLike, onAuthOpen, isAuthenticated, onRepost, onQuotePosted }: Props) {
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const navigate = useNavigate();

  const [dropOpen, setDropOpen]         = useState(false);
  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const [reposted, setReposted]         = useState(piece.reposted);
  const [repostCount, setRepostCount]   = useState(piece.reposts);
  const [bookmarked, setBookmarked]     = useState(piece.bookmarked);
  const [copied, setCopied]             = useState(false);
  const [justLiked, setJustLiked]       = useState(false);

  // Edit mode
  const [editOpen, setEditOpen]     = useState(false);
  const [editTitle, setEditTitle]   = useState(piece.title ?? "");
  const [editBody, setEditBody]     = useState(piece.body);
  const [editBusy, setEditBusy]     = useState(false);
  // Local overrides so edits reflect immediately without a reload
  const [localTitle, setLocalTitle] = useState<string | null | undefined>(undefined);
  const [localBody, setLocalBody]   = useState<string | undefined>(undefined);

  // Quote modal
  const [quoteOpen, setQuoteOpen]   = useState(false);
  const [quoteText, setQuoteText]   = useState("");
  const [quoteBusy, setQuoteBusy]   = useState(false);
  const [quoteDone, setQuoteDone]   = useState(false);

  const real = isRealId(piece.id);
  // Use local overrides if a save has happened this session
  const displayTitle = localTitle !== undefined ? localTitle : piece.title;
  const displayBody  = localBody  !== undefined ? localBody  : piece.body;
  const isLong   = displayBody.length > TRUNCATE;
  const shown    = isLong ? displayBody.slice(0, TRUNCATE) + "…" : displayBody;
  const hasTitle = !!(displayTitle?.trim());
  const isOwnPiece = !!(user && user.id === piece.authorId);

  const timeAgo = formatDistanceToNow(new Date(piece.created_at), { addSuffix: false })
    .replace("about ", "").replace(" minutes", "m").replace(" minute", "m")
    .replace(" hours", "h").replace(" hour", "h")
    .replace(" days", "d").replace(" day", "d")
    .replace("less than am", "<1m");

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) { onAuthOpen("join"); return; }
    if (!piece.liked) {
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 450);
    }
    onLike(piece.id);
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRepostMenuOpen(false);
    if (!isAuthenticated) { onAuthOpen("join"); return; }
    const next = !reposted;
    setReposted(next);
    setRepostCount((c) => c + (next ? 1 : -1));
    onRepost?.(piece.id, next);
    if (next) {
      await supabase.from("reposts").insert({ draft_id: piece.id, user_id: user!.id });
    } else {
      await supabase.from("reposts").delete().eq("draft_id", piece.id).eq("user_id", user!.id);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) { onAuthOpen("join"); return; }
    const next = !bookmarked;
    setBookmarked(next);
    setDropOpen(false);
    if (next) {
      await supabase.from("bookmarks").insert({ draft_id: piece.id, user_id: user!.id });
    } else {
      await supabase.from("bookmarks").delete().eq("draft_id", piece.id).eq("user_id", user!.id);
    }
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/drafts/${piece.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    setDropOpen(false);
  };

  const handleQuoteSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) { onAuthOpen("join"); return; }
    if (!quoteText.trim() || quoteBusy) return;
    setQuoteBusy(true);
    const body = quoteText.trim();
    const { data } = await supabase.from("drafts").insert({
      content: body,
      title: "",
      published: true,
      author_id: user!.id,
      quote_of_id: piece.id,
    } as any).select("id, created_at").single();
    setQuoteBusy(false);
    setQuoteDone(true);

    // Tell the parent feed about the new quote so it can show it without a refresh
    if (data && onQuotePosted) {
      const d = data as { id: string; created_at: string };
      onQuotePosted({
        id: d.id,
        created_at: d.created_at,
        body,
        quoteOf: {
          id: piece.id,
          body: piece.body,
          authorName: piece.authorName,
          authorHandle: piece.authorHandle,
          authorAvatarUrl: piece.authorAvatarUrl,
        },
      });
    }

    setTimeout(() => {
      setQuoteOpen(false);
      setQuoteText("");
      setQuoteDone(false);
    }, 800);
  };

  const handleEditSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editBody.trim() || editBusy) return;
    setEditBusy(true);
    await supabase.from("drafts").update({
      content: editBody.trim(),
      title: editTitle.trim() || "",
    }).eq("id", piece.id);
    setLocalTitle(editTitle.trim() || null);
    setLocalBody(editBody.trim());
    setEditBusy(false);
    setEditOpen(false);
  };

  const goToPost   = () => { if (real && !editOpen) navigate(`/drafts/${piece.id}`); };
  const goToAuthor = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (piece.authorHandle) navigate(`/${piece.authorHandle}`);
  };
  const closeRepostMenu = () => setRepostMenuOpen(false);

  return (
    <>
      <article
        className="px-4 py-4 border-b border-rule/50 transition-colors hover:bg-paper/60 dark:hover:bg-[hsl(25_14%_11%)] relative group"
        onClick={goToPost}
        style={{ cursor: real ? "pointer" : "default" }}
      >
        {/* Repost header */}
        {piece.repostedByHandle && (
          <div className="flex items-center gap-1.5 mb-2.5 text-ink-muted font-mono text-[11px]">
            <i className="ti ti-repeat text-[12px]" />
            <span>@{piece.repostedByHandle} reposted</span>
          </div>
        )}

        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0 pt-0.5" onClick={goToAuthor}>
            <Avatar name={piece.authorName} id={piece.authorId} avatarUrl={piece.authorAvatarUrl} size={40} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span
                  className="text-[14px] font-semibold text-ink truncate hover:underline cursor-pointer"
                  onClick={goToAuthor}
                >
                  {piece.authorName}
                </span>
                {isVerified(piece.authorHandle) && <VerifiedBadge size={13} />}
                {piece.authorHandle && (
                  <span
                    className="font-mono text-[11px] text-ink-muted truncate cursor-pointer hover:underline"
                    onClick={goToAuthor}
                  >
                    @{piece.authorHandle}
                  </span>
                )}
                <span className="text-ink-muted font-mono text-[11px] flex-shrink-0">· {timeAgo}</span>
              </div>

              {/* ··· menu */}
              <div className="relative flex-shrink-0">
                <button
                  className="opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink p-1 transition-all"
                  onClick={(e) => { e.stopPropagation(); setDropOpen((o) => !o); }}
                  aria-label="more"
                >
                  <i className="ti ti-dots text-base" />
                </button>
                {dropOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 bg-background border border-rule/60 min-w-[160px] z-20 shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {real && <DropItem icon="ti-link" label={copied ? "copied!" : "copy link"} onClick={handleCopyLink} />}
                    <DropItem
                      customIcon={<BookmarkIcon filled={bookmarked} size={14} />}
                      label={bookmarked ? "remove bookmark" : "bookmark"}
                      onClick={handleBookmark}
                    />
                    {isOwnPiece && real && (
                      <DropItem
                        icon="ti-pencil"
                        label="edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(displayTitle ?? "");
                          setEditBody(displayBody);
                          setEditOpen(true);
                          setDropOpen(false);
                        }}
                      />
                    )}
                    {!isOwnPiece && <DropItem icon="ti-flag" label="report" danger onClick={(e) => { e.stopPropagation(); setDropOpen(false); }} />}
                  </div>
                )}
              </div>
            </div>

            {/* Edit mode */}
            {editOpen ? (
              <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="title (optional)"
                  maxLength={120}
                  className="w-full bg-transparent border-none border-b border-rule/50 outline-none font-serif italic text-[13px] text-ink-muted placeholder:text-ink-muted/50 mb-2 pb-1 leading-snug focus:border-terra transition-colors"
                />
                <textarea
                  autoFocus
                  value={editBody}
                  onChange={(e) => {
                    setEditBody(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  rows={4}
                  className="w-full bg-transparent border-none outline-none font-serif text-[14px] leading-[1.8] text-ink resize-none overflow-hidden border-b border-rule/50 pb-1 focus:border-terra transition-colors"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleEditSave}
                    disabled={!editBody.trim() || editBusy}
                    className="bg-terra text-[hsl(38_35%_96%)] border-none px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-40"
                  >
                    {editBusy ? "saving…" : "save"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditOpen(false); }}
                    className="bg-transparent border border-rule/50 text-ink-muted px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:border-ink hover:text-ink"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Title (if present) */}
                {hasTitle && (
                  <p className="font-serif italic text-[14px] text-ink-dim leading-snug mb-1.5">
                    {displayTitle}
                  </p>
                )}

                {/* Body */}
                <p className={`font-serif text-ink leading-[1.8] whitespace-pre-wrap mb-3 ${displayBody.length < 80 ? "text-[15px]" : "text-[14px]"}`}>
                  {shown}
                  {isLong && real && (
                    <button
                      className="inline ml-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-terra bg-transparent border-none cursor-pointer p-0 hover:underline"
                      onClick={(e) => { e.stopPropagation(); navigate(`/drafts/${piece.id}`); }}
                    >
                      read more
                    </button>
                  )}
                </p>
              </>
            )}

            {/* Quoted piece embed */}
            {piece.quoteOf && (
              <div
                className="mb-3 border border-rule/60 px-3 py-2.5 cursor-pointer hover:bg-paper/60 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isRealId(piece.quoteOf!.id)) navigate(`/drafts/${piece.quoteOf!.id}`);
                }}
              >
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <Avatar
                    name={piece.quoteOf.authorName}
                    id={piece.quoteOf.id}
                    avatarUrl={piece.quoteOf.authorAvatarUrl}
                    size={14}
                  />
                  <span className="text-[12px] font-semibold text-ink truncate leading-none">
                    {piece.quoteOf.authorName}
                  </span>
                  {isVerified(piece.quoteOf.authorHandle) && <VerifiedBadge size={11} />}
                  {piece.quoteOf.authorHandle && (
                    <span className="font-mono text-[10px] text-ink-muted truncate">
                      @{piece.quoteOf.authorHandle}
                    </span>
                  )}
                </div>
                <p className="font-serif text-[13px] leading-[1.65] text-ink-dim whitespace-pre-wrap line-clamp-3">
                  {piece.quoteOf.body}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 -ml-2">
              {/* Reply */}
              <Act
                icon="ti-message-circle"
                count={piece.comments}
                hoverColor="hsl(196 36% 28%)"
                hoverBg="hsl(196 36% 28% / 0.08)"
                onClick={(e) => { e.stopPropagation(); if (real) navigate(`/drafts/${piece.id}#reply`); }}
              />

              {/* Repost + Quote dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-2.5 py-1.5 font-mono text-[12px] transition-colors"
                  style={{
                    color: reposted ? "hsl(140 45% 38%)" : "hsl(var(--ink-muted))",
                    borderRadius: "9999px",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAuthenticated) { onAuthOpen("join"); return; }
                    setRepostMenuOpen((o) => !o);
                  }}
                >
                  <i className="ti ti-repeat text-[16px]" />
                  {repostCount > 0 && <span>{repostCount}</span>}
                </button>
                {repostMenuOpen && (
                  <>
                    {/* backdrop */}
                    <div className="fixed inset-0 z-10" onClick={closeRepostMenu} />
                    <div className="absolute left-0 bottom-full mb-1 bg-background border border-rule/60 shadow-md z-20 min-w-[148px]">
                      <div
                        className="px-3.5 py-2.5 flex items-center gap-2.5 text-[13px] text-ink-dim cursor-pointer hover:bg-paper hover:text-ink"
                        onClick={handleRepost}
                      >
                        <i className="ti ti-repeat text-[14px]" />
                        {reposted ? "undo repost" : "repost"}
                      </div>
                      {real && (
                        <div
                          className="px-3.5 py-2.5 flex items-center gap-2.5 text-[13px] text-ink-dim cursor-pointer hover:bg-paper hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRepostMenuOpen(false);
                            if (!isAuthenticated) { onAuthOpen("join"); return; }
                            setQuoteOpen(true);
                          }}
                        >
                          <i className="ti ti-quote text-[14px]" />
                          quote
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Like */}
              <button
                className={`flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-2.5 py-1.5 font-mono text-[12px] transition-colors ${justLiked ? "heart-pop" : ""}`}
                style={{ color: piece.liked ? "hsl(0 60% 52%)" : "hsl(var(--ink-muted))", borderRadius: "9999px" }}
                onClick={handleLike}
              >
                <HeartIcon filled={piece.liked} size={16} />
                {piece.likes > 0 && <span>{piece.likes}</span>}
              </button>

              {/* Bookmark */}
              <button
                className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-2.5 py-1.5 font-mono text-[12px] transition-colors"
                style={{ color: bookmarked ? "hsl(15 54% 37%)" : "hsl(var(--ink-muted))", borderRadius: "9999px" }}
                onClick={(e) => handleBookmark(e)}
              >
                <BookmarkIcon filled={bookmarked} size={16} />
              </button>

              {real && (
                <Act
                  icon="ti-upload"
                  hoverColor="hsl(var(--ink-dim))"
                  hoverBg="hsl(var(--paper))"
                  onClick={handleCopyLink}
                />
              )}
            </div>
          </div>
        </div>
      </article>

      {/* Quote modal — rendered outside article so it's not clipped */}
      {quoteOpen && (
        <div
          className="fixed inset-0 bg-[hsl(25_22%_11%_/_0.55)] z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setQuoteOpen(false); setQuoteText(""); } }}
        >
          <div className="bg-background border border-rule/60 w-full sm:w-[540px] sm:max-w-[96vw] shadow-xl sm:rounded-sm overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-rule/50">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">quote</span>
              <button
                className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors"
                onClick={() => { setQuoteOpen(false); setQuoteText(""); }}
              >
                <i className="ti ti-x text-[16px]" />
              </button>
            </div>

            {/* Compose area */}
            <div className="px-4 pt-4 pb-2 flex gap-3">
              <Avatar
                name={myProfile?.display_name ?? user?.email ?? ""}
                id={user?.id ?? ""}
                avatarUrl={myProfile?.avatar_url}
                size={36}
              />
              <textarea
                autoFocus
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                placeholder="add your thoughts…"
                className="flex-1 bg-transparent border-none outline-none font-serif text-[15px] leading-[1.8] text-ink resize-none placeholder:text-ink-muted placeholder:italic"
                rows={3}
              />
            </div>

            {/* Embedded original piece */}
            <div className="mx-4 mb-4 border border-rule/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Avatar name={piece.authorName} id={piece.authorId} avatarUrl={piece.authorAvatarUrl} size={14} />
                <span className="text-[12px] font-semibold text-ink">{piece.authorName}</span>
                {isVerified(piece.authorHandle) && <VerifiedBadge size={11} />}
                <span className="font-mono text-[10px] text-ink-muted">@{piece.authorHandle}</span>
              </div>
              <p className="font-serif text-[13px] leading-[1.65] text-ink-dim whitespace-pre-wrap line-clamp-4">
                {piece.body}
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end px-4 pb-4">
              <button
                onClick={handleQuoteSubmit}
                disabled={!quoteText.trim() || quoteBusy || quoteDone}
                className="bg-terra text-[hsl(38_35%_96%)] border-none px-5 py-2 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {quoteDone ? "posted ✓" : quoteBusy ? "…" : "post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Act({
  icon, count, active, activeColor, hoverColor, hoverBg, onClick,
}: {
  icon: string; count?: number; active?: boolean;
  activeColor?: string; hoverColor: string; hoverBg: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer px-2.5 py-1.5 font-mono text-[12px] text-ink-muted transition-colors"
      style={{
        color: active ? activeColor : hov ? hoverColor : undefined,
        background: hov ? hoverBg : "transparent",
        borderRadius: "9999px",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >
      <i className={`ti ${icon} text-[16px]`} />
      {count != null && count > 0 && <span>{count}</span>}
    </button>
  );
}

function DropItem({
  icon, customIcon, label, danger, onClick,
}: {
  icon?: string; customIcon?: React.ReactNode; label: string; danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`px-3.5 py-2.5 text-[13px] cursor-pointer flex items-center gap-2 transition-colors
        ${danger
          ? "text-[hsl(0_55%_48%)] hover:bg-[hsl(0_55%_48%_/_0.08)]"
          : "text-ink-dim hover:bg-paper hover:text-ink"}`}
      onClick={onClick}
    >
      {customIcon ?? (icon ? <i className={`ti ${icon} text-[14px]`} /> : null)}
      {label}
    </div>
  );
}
