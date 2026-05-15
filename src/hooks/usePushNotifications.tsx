import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Converts a URL-safe base64 string to a Uint8Array (required by PushManager). */
function b64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64  = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array([...atob(b64)].map((c) => c.charCodeAt(0)));
}

type State = "unsupported" | "denied" | "unsubscribed" | "subscribed" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<State>("loading");

  const probe = useCallback(async () => {
    if (typeof window === "undefined"
      || !("serviceWorker" in navigator)
      || !("PushManager" in window)) {
      setState("unsupported"); return;
    }
    if (Notification.permission === "denied") { setState("denied"); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "unsubscribed");
    } catch { setState("unsubscribed"); }
  }, []);

  useEffect(() => { probe(); }, [probe]);

  const subscribe = useCallback(async () => {
    if (!user || !VAPID_PUBLIC_KEY) return;
    setState("loading");
    try {
      // Register SW if not already (Vite doesn't auto-register)
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "unsubscribed"); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      await (supabase.from("push_subscriptions") as any).upsert({
        user_id:  user.id,
        endpoint: json.endpoint,
        p256dh:   json.keys?.p256dh,
        auth_key: json.keys?.auth,
      }, { onConflict: "endpoint" });

      setState("subscribed");
    } catch (err) {
      console.error("push subscribe:", err);
      setState("unsubscribed");
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await (supabase.from("push_subscriptions") as any)
          .delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } catch (err) {
      console.error("push unsubscribe:", err);
      setState("subscribed");
    }
  }, [user]);

  return {
    state,
    isSupported:  state !== "unsupported",
    isDenied:     state === "denied",
    isSubscribed: state === "subscribed",
    isLoading:    state === "loading",
    subscribe,
    unsubscribe,
    toggle: state === "subscribed" ? unsubscribe : subscribe,
  };
}
