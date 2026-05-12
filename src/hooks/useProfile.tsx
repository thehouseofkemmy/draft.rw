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

// Module-level cache — survives page navigation (LeftNav remounts) so there's
// no flash of "finish setup →" / email username between routes.
let _cachedUserId: string | null = null;
let _cachedProfile: UserProfile | null = null;

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Seed initial state from cache so components start with real data on remount
  const [profile, setProfile] = useState<UserProfile | null>(
    _cachedUserId === userId ? _cachedProfile : null,
  );
  const [loading, setLoading] = useState(
    // Already have data for this user → no loading flash
    !(_cachedUserId === userId && _cachedProfile !== null),
  );

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      _cachedUserId = null;
      _cachedProfile = null;
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
    setProfile(p);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // Cache hit for the current user → no need to refetch
    if (userId && _cachedUserId === userId && _cachedProfile !== null) return;
    setLoading(!!userId); // show loading only when there's a user to fetch
    fetchProfile();
  }, [fetchProfile, userId]);

  // Call this after any mutation that changes the profile (handle save, avatar, etc.)
  const refresh = useCallback(async () => {
    _cachedUserId = null;
    _cachedProfile = null;
    await fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, refresh };
}
