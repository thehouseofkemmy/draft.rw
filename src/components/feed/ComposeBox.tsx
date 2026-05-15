import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Avatar from "@/components/feed/Avatar";
import type { SavedDraft } from "@/components/feed/ComposeModal";

type Props = {
  onAuthOpen: (mode: "join") => void;
  onOpenCompose: () => void;
  savedDraft?: SavedDraft | null;
};

export default function ComposeBox({ onAuthOpen, onOpenCompose, savedDraft }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [flash, setFlash] = useState(false);
  const prevDraft = useRef<SavedDraft | null>(null);

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";

  // Fire the flash animation whenever a new saved draft lands
  useEffect(() => {
    if (savedDraft && savedDraft !== prevDraft.current) {
      setFlash(false);
      // Micro-delay so re-adding the class always triggers the animation
      const t = requestAnimationFrame(() => setFlash(true));
      prevDraft.current = savedDraft;
      return () => cancelAnimationFrame(t);
    }
    if (!savedDraft) {
      prevDraft.current = null;
      setFlash(false);
    }
  }, [savedDraft]);

  const handleOpen = () => {
    if (!user) { onAuthOpen("join"); return; }
    onOpenCompose();
  };

  const previewText = savedDraft?.body?.trim();

  return (
    <div
      className={`px-4 py-3.5 border-b flex items-center gap-3 cursor-pointer group transition-colors ${previewText ? "border-terra/40" : "border-rule/50"} ${flash ? "draft-save-flash" : ""}`}
      onClick={handleOpen}
      onAnimationEnd={() => setFlash(false)}
    >
      <div className="flex-shrink-0">
        <Avatar
          name={displayName || "?"}
          id={user?.id ?? "guest"}
          avatarUrl={profile?.avatar_url}
          size={40}
        />
      </div>

      <span className={`flex-1 font-serif italic text-[15px] truncate leading-snug select-none transition-colors ${
        previewText ? "text-ink-muted group-hover:text-ink" : "text-ink-muted/70 group-hover:text-ink-muted"
      }`}>
        {previewText || (user ? "what have you been thinking about lately…" : "sign in to post…")}
      </span>

      {user && (
        <button
          onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          className="flex-shrink-0 bg-terra text-[hsl(38_35%_96%)] border-none px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
        >
          post
        </button>
      )}
    </div>
  );
}
