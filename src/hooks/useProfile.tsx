import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type UserProfile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

// Module-level cache — survives in-app navigation (component remounts)
let _cachedUserId: string | null = null;
let _cachedProfile: UserProfile | null = null;

const SESSION_KEY = "drw:profile";

/** Read profile from sessionStorage (survives hard reload, cleared on tab close) */
function readSession(userId: string): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id === userId ? (parsed as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeSession(profile: UserProfile | null) {
  try {
    if (profile) sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Priority: in-memory cache → sessionStorage → null
  // This means on hard reload we still get instant data from sessionStorage,
  // with no flash of email username / "finish setup →"
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (!userId) return null;
    if (_cachedUserId === userId && _cachedProfile) return _cachedProfile;
    const session = readSession(userId);
    if (session) {
      _cachedUserId = userId;
      _cachedProfile = session;
    }
    return session;
  });

  const [loading, setLoading] = useState(
    !(_cachedUserId === userId && _cachedProfile !== null),
  );

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      _cachedUserId = null;
      _cachedProfile = null;
      writeSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio")
      .eq("id", userId)
      .maybeSingle();
    const p = data as UserProfile | null;
    _cachedUserId = userId;
    _cachedProfile = p;
    writeSession(p);
    setProfile(p);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // Already have warm data for this user — skip the fetch
    if (userId && _cachedUserId === userId && _cachedProfile !== null) return;
    setLoading(!!userId);
    fetchProfile();
  }, [fetchProfile, userId]);

  const refresh = useCallback(async () => {
    _cachedUserId = null;
    _cachedProfile = null;
    writeSession(null);
    await fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, refresh };
}
