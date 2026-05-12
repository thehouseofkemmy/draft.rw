/**
 * Skeleton placeholder that mirrors PieceCard's layout precisely.
 * Same padding, same avatar size, same line heights — so when real content
 * swaps in, there's zero layout shift.
 *
 * Body line widths are varied per-row so a list of skeletons doesn't look
 * like a printed pattern.
 */

const BODY_WIDTHS = [
  ["95%", "88%", "62%"],
  ["92%", "70%"],
  ["96%", "84%", "78%", "44%"],
  ["88%", "55%"],
];

type Props = {
  /** Optional index so multiple stacked skeletons get different body shapes */
  variant?: number;
};

export default function SkeletonPiece({ variant = 0 }: Props) {
  const widths = BODY_WIDTHS[variant % BODY_WIDTHS.length];

  return (
    <article className="px-4 py-4 border-b border-rule/50 animate-pulse">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 pt-0.5">
          <div className="w-10 h-10 rounded-full bg-paper" />
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Header: name + handle + time */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-[14px] bg-paper rounded w-[110px]" />
            <div className="h-[11px] bg-paper/70 rounded w-[78px]" />
            <div className="h-[11px] bg-paper/60 rounded w-[28px]" />
          </div>

          {/* Body lines */}
          <div className="space-y-2 mb-4">
            {widths.map((w, i) => (
              <div
                key={i}
                className="h-[13px] bg-paper rounded"
                style={{ width: w }}
              />
            ))}
          </div>

          {/* Action bar — 5 buttons matching PieceCard */}
          <div className="flex items-center gap-6 -ml-1">
            <SkeletonAction withCount />
            <SkeletonAction withCount />
            <SkeletonAction withCount />
            <SkeletonAction />
            <SkeletonAction />
          </div>
        </div>
      </div>
    </article>
  );
}

function SkeletonAction({ withCount = false }: { withCount?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="w-4 h-4 rounded-sm bg-paper" />
      {withCount && <div className="w-3 h-2.5 rounded bg-paper/70" />}
    </div>
  );
}
