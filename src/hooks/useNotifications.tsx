import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useNotifications() {
  const { user } = useAuth();
  // Use the primitive id, not the user object — object reference can change even when
  // the same user is still logged in, which would cause the channel to re-subscribe.
  const userId = user?.id ?? null;
  const [unread, setUnread] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) { setUnread(0); return; }
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .eq("read", false);
    setUnread(count ?? 0);
  }, [userId]);

  // Effect 1: fetch count whenever user changes
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Effect 2: realtime subscription — only keyed on userId (stable string)
  // so the channel is NOT re-created on every re-render.
  // We append a random suffix so HMR never finds a stale channel with the same name.
  useEffect(() => {
    if (!userId) return;

    const channelName = `notifs-${userId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `to_user_id=eq.${userId}`,
        },
        () => setUnread((n) => n + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("to_user_id", userId)
      .eq("read", false);
    setUnread(0);
  }, [userId]);

  return { unread, markAllRead, refresh: fetchCount };
}
