/**
 * /profile — redirects authenticated users to their /:handle page.
 * If handle not set yet, sends to /onboarding.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) { navigate("/auth"); return; }
    if (profile?.handle) {
      navigate(`/${profile.handle}`, { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
  }, [user, profile, authLoading, profileLoading, navigate]);

  return null;
}
