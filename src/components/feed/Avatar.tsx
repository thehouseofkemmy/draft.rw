/** Shared avatar component used across PieceCard, LeftNav, ComposeBox, etc.
 *  Renders a real image if avatarUrl is provided; otherwise coloured initials.
 */

const BG = [
  "hsl(195 35% 30%/0.15)",
  "hsl(15 54% 37%/0.13)",
  "hsl(140 35% 35%/0.13)",
  "hsl(260 35% 45%/0.13)",
  "hsl(30 60% 42%/0.13)",
];
const FG = [
  "hsl(195 35% 28%)",
  "hsl(15 54% 37%)",
  "hsl(140 35% 32%)",
  "hsl(260 35% 42%)",
  "hsl(30 55% 38%)",
];

/** Hash any string to a stable 0-4 index */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 5;
}

type Props = {
  name: string;
  /** UUID or any stable string — used only for colour selection */
  id: string | number;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

export default function Avatar({ name, id, avatarUrl, size = 36, className = "" }: Props) {
  const idx = hashStr(String(id));
  const initials = name
    .split(/[\s@._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover border border-rule/30 flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          // fallback to initials on broken image
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-full border border-rule/30 flex items-center justify-center flex-shrink-0 font-medium ${className}`}
      style={{
        width: size,
        height: size,
        background: BG[idx],
        color: FG[idx],
        fontSize: size * 0.33,
        fontFamily: "var(--font-mono)",
      }}
    >
      {initials}
    </div>
  );
}
