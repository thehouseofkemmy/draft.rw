import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MentionCandidate = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Options = {
  onInsert: (handle: string) => void;
};

/**
 * Detects `@query` at the caret position in a textarea, fetches matching
 * profiles, and provides helpers to insert the chosen handle.
 */
export function useMentionAutocomplete({ onInsert }: Options) {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  /** Call on every keystroke in the textarea */
  const onTextChange = useCallback((value: string, cursorPos: number) => {
    // Look back from cursor for an unspaced @word
    const textBefore = value.slice(0, cursorPos);
    const match = textBefore.match(/@([a-z0-9_]*)$/i);

    if (!match) {
      setCandidates([]);
      setMentionQuery(null);
      return;
    }

    const q = match[1].toLowerCase();
    setMentionQuery(q);

    clearTimeout(debounce.current);
    if (q.length === 0) {
      // Show a few suggestions even before typing
      debounce.current = setTimeout(async () => {
        const { data } = await supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url")
          .not("handle", "is", null)
          .limit(6);
        setCandidates((data ?? []) as MentionCandidate[]);
      }, 0);
      return;
    }

    debounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .ilike("handle", `${q}%`)
        .limit(6);
      setCandidates((data ?? []) as MentionCandidate[]);
    }, 180);
  }, []);

  const pickCandidate = useCallback((
    handle: string,
    value: string,
    cursorPos: number,
  ): string => {
    // Replace the @partial with @handle + space
    const textBefore = value.slice(0, cursorPos);
    const textAfter  = value.slice(cursorPos);
    const replaced   = textBefore.replace(/@([a-z0-9_]*)$/i, `@${handle} `);
    setCandidates([]);
    setMentionQuery(null);
    onInsert(handle);
    return replaced + textAfter;
  }, [onInsert]);

  const dismiss = useCallback(() => {
    setCandidates([]);
    setMentionQuery(null);
  }, []);

  return { candidates, mentionQuery, onTextChange, pickCandidate, dismiss };
}

/** Extract all @handles from a body of text */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-z0-9_]+)/gi) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/** Send mention notifications for a newly created draft */
export async function notifyMentions(
  draftId: string,
  authorId: string,
  text: string,
) {
  const handles = extractMentions(text);
  if (!handles.length) return;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("handle", handles)
    .neq("id", authorId);        // don't notify yourself

  if (!profiles?.length) return;

  await supabase.from("notifications").insert(
    profiles.map((p: any) => ({
      to_user_id:   p.id,
      from_user_id: authorId,
      type:         "mention",
      draft_id:     draftId,
    })),
  );
}
