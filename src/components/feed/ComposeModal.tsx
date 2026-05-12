import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Avatar from "@/components/feed/Avatar";

const MAX = 3000;

type Props = {
  onPublish: (body: string, title: string) => Promise<void>;
  onClose: () => void;
};

export default function ComposeModal({ onPublish, onClose }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const left = MAX - text.length;
  const canPost = text.trim().length > 0 && left >= 0;
  const nearLimit = left <= 200 && left >= 0;
  const overLimit = left < 0;

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const handle = profile?.handle ?? user?.email?.split("@")[0] ?? "";

  // Focus textarea on open
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePublish = async () => {
    if (!canPost || busy) return;
    setBusy(true);
    await onPublish(text.trim(), title.trim());
    setBusy(false);
    onClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full max-w-[560px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rule/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Avatar
              name={displayName || "?"}
              id={user?.id ?? "guest"}
              avatarUrl={profile?.avatar_url}
              size={32}
            />
            <span className="font-semibold text-[13px] text-ink leading-tight">
              {displayName || handle}
              {handle && (
                <span className="font-mono font-normal text-[11px] text-ink-muted ml-1.5">@{handle}</span>
              )}
            </span>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-3 flex flex-col gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title (optional)"
            maxLength={120}
            className="w-full bg-transparent border-none outline-none font-serif italic text-[14px] text-ink-muted placeholder:text-ink-muted/50 leading-snug"
          />
          <textarea
            ref={textareaRef}
            className="w-full bg-transparent border-none outline-none font-serif text-[16px] leading-[1.8] text-ink resize-none placeholder:text-ink-muted placeholder:italic overflow-hidden"
            rows={8}
            placeholder="what have you been thinking about lately…"
            value={text}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlePublish();
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-rule/40 flex-shrink-0">
          <span className="font-mono text-[10px] text-ink-muted/60 tracking-wide">⌘↵ to post</span>
          <div className="flex items-center gap-3">
            {(nearLimit || overLimit) && (
              <span className={`font-mono text-[11px] tabular-nums ${overLimit ? "text-[hsl(0_60%_48%)]" : "text-[hsl(35_80%_45%)]"}`}>
                {left}
              </span>
            )}
            <button
              disabled={!canPost || busy}
              onClick={handlePublish}
              className="bg-terra text-[hsl(38_35%_96%)] border-none px-5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
            >
              {busy ? "posting…" : "post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
