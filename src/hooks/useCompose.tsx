import { createContext, useCallback, useContext, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { prependToProfileCache } from "@/lib/profileCache";
import { notifyMentions } from "@/hooks/useMentionAutocomplete";
import type { SavedDraft } from "@/components/feed/ComposeModal";
import type { Piece } from "@/components/feed/PieceCard";

type ComposeCtx = {
  isOpen: boolean;
  savedDraft: SavedDraft | null;
  lastPublished: Piece | null;
  open: () => void;
  close: (draft?: SavedDraft) => void;
  publish: (body: string, title: string) => Promise<void>;
};

const noop = async () => {};
const defaultCtx: ComposeCtx = {
  isOpen: false, savedDraft: null, lastPublished: null,
  open: () => {}, close: () => {}, publish: noop,
};
const Ctx = createContext<ComposeCtx>(defaultCtx);

export function ComposeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [isOpen, setIsOpen]           = useState(false);
  const [savedDraft, setSavedDraft]   = useState<SavedDraft | null>(null);
  const [lastPublished, setLastPublished] = useState<Piece | null>(null);

  const open  = useCallback(() => setIsOpen(true), []);
  const close = useCallback((draft?: SavedDraft) => {
    setIsOpen(false);
    setSavedDraft(draft ?? null);
  }, []);

  const publish = useCallback(async (body: string, title: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("drafts")
      .insert({ content: body, title: title || "", published: true, author_id: user.id })
      .select("id, created_at")
      .single();
    if (!data) return;

    const d = data as { id: string; created_at: string };
    const name   = profile?.display_name ?? user.email?.split("@")[0] ?? "drafter";
    const handle = profile?.handle       ?? user.email?.split("@")[0] ?? "";

    const newPiece: Piece = {
      id: d.id, title: title || null, body,
      created_at: d.created_at,
      authorId: user.id, authorName: name, authorHandle: handle,
      authorAvatarUrl: profile?.avatar_url ?? null,
      likes: 0, comments: 0, reposts: 0,
      liked: false, reposted: false, bookmarked: false,
    };

    if (handle) prependToProfileCache(handle, newPiece);
    notifyMentions(d.id, user.id, body).catch(() => {});
    setLastPublished(newPiece);
    setSavedDraft(null);

    const url = `${window.location.origin}/drafts/${d.id}`;
    toast.success("draft posted", {
      description: "your piece is now live.",
      action: {
        label: "share",
        onClick: () => {
          const payload = { title: "drafts.rw", text: title || "a new piece on drafts.rw", url };
          if (typeof navigator.share === "function") {
            navigator.share(payload).catch(() =>
              navigator.clipboard.writeText(url).then(() => toast("link copied")).catch(() => {})
            );
          } else {
            navigator.clipboard.writeText(url).then(() => toast("link copied")).catch(() => {});
          }
        },
      },
      duration: 6000,
    });
  }, [user, profile]);

  return (
    <Ctx.Provider value={{ isOpen, savedDraft, lastPublished, open, close, publish }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompose() {
  return useContext(Ctx);
}
