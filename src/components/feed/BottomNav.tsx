import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/hooks/useNotifications";
import Avatar from "@/components/feed/Avatar";
import ProfileSettingsModal from "@/components/feed/ProfileSettingsModal";

export default function BottomNav({ onAuthOpen }: { onAuthOpen: (mode: "join" | "login") => void }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "?";

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-rule/50 flex items-center justify-around px-2 h-14">
        <BtnIcon icon="ti-home"  active={location.pathname === "/"}             onClick={() => navigate("/")} />
        <BtnIcon icon="ti-search" active={location.pathname === "/search"}       onClick={() => navigate("/search")} />
        <BtnIcon
          icon="ti-bell"
          badge={unread > 0 ? Math.min(unread, 99) : undefined}
          active={location.pathname === "/notifications"}
          onClick={() => user ? navigate("/notifications") : onAuthOpen("join")}
        />

        {/* Profile / settings button */}
        <button
          onClick={() => user ? setProfileOpen(true) : onAuthOpen("join")}
          className={`relative flex items-center justify-center w-10 h-10 transition-colors border-none bg-transparent cursor-pointer
            ${profileOpen ? "text-ink" : "text-ink-muted hover:text-ink"}`}
        >
          {user ? (
            <span className={`rounded-full overflow-hidden ring-[1.5px] transition-colors ${profileOpen ? "ring-terra" : "ring-rule/50"}`}>
              <Avatar name={displayName} id={user.id} avatarUrl={profile?.avatar_url} size={26} />
            </span>
          ) : (
            <i className="ti ti-user-circle text-[22px]" aria-hidden="true" />
          )}
        </button>
      </nav>

      {profileOpen && <ProfileSettingsModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}

function BtnIcon({
  icon, onClick, active, badge,
}: {
  icon: string; onClick: () => void; active?: boolean; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center justify-center w-10 h-10 transition-colors border-none bg-transparent cursor-pointer
        ${active ? "text-ink" : "text-ink-muted hover:text-ink"}`}
    >
      <i className={`ti ${icon} text-[22px]`} aria-hidden="true" />
      {badge != null && (
        <span className="absolute top-1 right-1 bg-terra text-[hsl(38_35%_96%)] rounded-full text-[8px] font-mono leading-none px-1 py-px min-w-[13px] text-center">
          {badge}
        </span>
      )}
    </button>
  );
}
