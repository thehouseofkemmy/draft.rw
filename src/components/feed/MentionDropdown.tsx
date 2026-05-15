import { useEffect, useRef, useState } from "react";
import type { MentionCandidate } from "@/hooks/useMentionAutocomplete";
import Avatar from "@/components/feed/Avatar";

type Props = {
  candidates: MentionCandidate[];
  onPick: (handle: string) => void;
  onDismiss: () => void;
  /** Pixel offset from the top of the containing div — tracks the caret, not the textarea bottom. */
  topOffset?: number;
};

export default function MentionDropdown({ candidates, onPick, onDismiss, topOffset }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset active index when candidates change
  useEffect(() => { setActiveIdx(0); }, [candidates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!candidates.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % candidates.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + candidates.length) % candidates.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onPick(candidates[activeIdx].handle ?? "");
      } else if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [candidates, activeIdx, onPick, onDismiss]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!candidates.length) return null;

  return (
    <div
      ref={listRef}
      className="absolute left-0 z-50 mt-1 w-full max-w-[320px] bg-background border border-rule/60 shadow-lg overflow-hidden"
      style={ topOffset !== undefined ? { top: topOffset } : { top: "100%" } }
      onMouseDown={(e) => e.preventDefault()} // keep textarea focus
    >
      {candidates.map((c, i) => {
        const name = c.display_name || c.handle || "?";
        const handle = c.handle ?? "";
        return (
          <div
            key={c.id}
            data-idx={i}
            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
              i === activeIdx ? "bg-rule/30" : "hover:bg-rule/20"
            }`}
            onMouseEnter={() => setActiveIdx(i)}
            onClick={() => onPick(handle)}
          >
            <Avatar name={name} id={c.id} avatarUrl={c.avatar_url} size={28} />
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium text-ink leading-tight truncate">{name}</span>
              <span className="text-[11px] font-mono text-ink-muted leading-tight truncate">@{handle}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
