/**
 * Small terra-filled rosette with a checkmark — used to mark official accounts.
 * For now, "official" is determined by the handle `@drafts`. Later this can become
 * a DB column (profiles.verified) and we just swap the predicate.
 */

const OFFICIAL_HANDLES = new Set(["drafts"]);

export function isVerified(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return OFFICIAL_HANDLES.has(handle.toLowerCase());
}

type Props = {
  size?: number;
  className?: string;
};

export function VerifiedBadge({ size = 14, className = "" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block flex-shrink-0 ${className}`}
      aria-label="verified"
      role="img"
    >
      {/* Terra-filled rosette */}
      <path
        d="M12 1.5l2.45 2.49L17.9 3l1.04 3.42L22.34 7.5l-1.49 3.18 1.49 3.18-3.4 1.08L17.9 18.4l-3.45-.99L12 19.91l-2.45-2.5L6.1 18.4l-1.04-3.46-3.4-1.08 1.49-3.18L1.66 7.5l3.4-1.08L6.1 3l3.45.99L12 1.5z"
        fill="hsl(15 54% 37%)"
      />
      {/* White checkmark */}
      <path
        d="M9 12.2l2 2 4.5-4.5"
        fill="none"
        stroke="hsl(38 35% 96%)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
