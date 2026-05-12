import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Avatar from "@/components/feed/Avatar";
import ComposeModal from "@/components/feed/ComposeModal";

type Props = {
  onPublish: (body: string, title: string) => Promise<void>;
  onAuthOpen: (mode: "join") => void;
};

export default function ComposeBox({ onPublish, onAuthOpen }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";

  const handleOpen = () => {
    if (!user) { onAuthOpen("join"); return; }
    setOpen(true);
  };

  return (
    <>
      {/* Trigger row */}
      <div
        className="px-4 py-3.5 border-b border-rule/50 flex items-center gap-3 cursor-pointer group"
        onClick={handleOpen}
      >
        <div className="flex-shrink-0">
          <Avatar
            name={displayName || "?"}
            id={user?.id ?? "guest"}
            avatarUrl={profile?.avatar_url}
            size={40}
          />
        </div>
        <span className="flex-1 font-serif italic text-[15px] text-ink-muted/70 group-hover:text-ink-muted transition-colors select-none">
          {user ? "what have you been thinking about lately…" : "sign in to post…"}
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

      {/* Modal */}
      {open && (
        <ComposeModal
          onPublish={onPublish}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
