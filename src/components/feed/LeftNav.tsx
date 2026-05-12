import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/hooks/useNotifications";
import Avatar from "@/components/feed/Avatar";

export default function LeftNav({ onAuthOpen }: { onAuthOpen: (mode: "join" | "login") => void }) {
  const { user, isAdmin, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const { profile } = useProfile();
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "drafter";
  const handle = profile?.handle ?? null;

  const goProfile = () => {
    if (!user) { onAuthOpen("join"); return; }
    if (handle) navigate(`/${handle}`);
    else navigate("/onboarding");
  };

  return (
    <nav className="flex flex-col gap-0.5 sticky top-0 h-screen py-3 pr-3">
      {/* Logo */}
      <Link
        to="/"
        className="font-serif text-[17px] font-semibold text-ink py-2 mb-1 block lg:px-4 px-3"
        style={{ letterSpacing: "-0.02em" }}
      >
        <span className="hidden lg:inline">drafts<em className="text-terra not-italic">.rw</em></span>
        <span className="lg:hidden text-terra font-mono text-base">rw</span>
      </Link>

      <NavItem icon="ti-home"     label="home"          active={location.pathname === "/"}             onClick={() => navigate("/")} />
      <NavItem icon="ti-search"   label="search"        active={location.pathname === "/search"}        onClick={() => navigate("/search")} />
      <NavItem
        icon="ti-bell"
        label="notifications"
        active={location.pathname === "/notifications"}
        badge={unread > 0 ? Math.min(unread, 99) : undefined}
        onClick={() => user ? navigate("/notifications") : onAuthOpen("join")}
      />
      <NavItem icon="ti-user"     label="profile"       active={location.pathname.startsWith("/@") || location.pathname === "/profile"} onClick={goProfile} />
      <NavItem icon="ti-bookmark" label="bookmarks"     active={location.pathname === "/bookmarks"}     onClick={() => user ? navigate("/bookmarks") : onAuthOpen("join")} />
      {isAdmin && (
        <NavItem icon="ti-layout-dashboard" label="studio" active={location.pathname === "/admin"} onClick={() => navigate("/admin")} />
      )}

      {/* Compose button */}
      <button
        className="mt-3 bg-terra text-[hsl(38_35%_96%)] border-none rounded-[3px] py-[10px] font-mono text-[11px] tracking-[0.12em] uppercase cursor-pointer transition-colors hover:opacity-90 lg:mx-4 mx-3"
        onClick={() => user ? navigate("/") : onAuthOpen("join")}
      >
        <span className="hidden lg:inline">+ compose</span>
        <span className="lg:hidden"><i className="ti ti-edit text-base" /></span>
      </button>

      {/* Bottom: theme toggle + user card */}
      <div className="mt-auto flex flex-col gap-0">
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 py-2 rounded-[3px] border-none bg-transparent text-ink-muted text-[13px] cursor-pointer hover:bg-paper hover:text-ink-dim w-full transition-colors lg:px-4 px-3"
        >
          <i className={`ti ${isDark ? "ti-sun" : "ti-moon"} text-[18px] flex-shrink-0`} />
          <span className="hidden lg:inline">{isDark ? "light mode" : "dark mode"}</span>
        </button>

        <div
          className="flex items-center gap-2.5 py-2.5 rounded-[3px] cursor-pointer hover:bg-paper transition-colors lg:px-4 px-3 group"
          onClick={goProfile}
        >
          <Avatar name={displayName} id={user?.id ?? "guest"} avatarUrl={profile?.avatar_url} size={32} />
          <div className="hidden lg:flex lg:flex-col min-w-0 flex-1">
            <div className="text-[13px] font-medium text-ink truncate">{displayName}</div>
            <div className="font-mono text-[11px] text-ink-muted truncate">
              {!user ? "sign in to post" : handle ? `@${handle}` : "finish setup →"}
            </div>
          </div>
          {user && (
            <button
              className="hidden lg:block ml-auto opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink text-[11px] font-mono transition-all"
              onClick={(e) => { e.stopPropagation(); signOut(); navigate("/"); }}
              title="sign out"
            >
              <i className="ti ti-logout text-[15px]" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  icon, label, active, badge, onClick,
}: {
  icon: string; label: string; active?: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 py-[10px] rounded-[3px] text-[15px] font-medium border-none bg-transparent w-full text-left cursor-pointer transition-colors lg:px-4 px-3
        ${active ? "text-ink" : "text-ink-dim hover:bg-paper hover:text-ink"}`}
    >
      <span className="relative flex-shrink-0">
        <i className={`ti ${icon} text-[20px]`} aria-hidden="true" />
        {badge != null && (
          <span className="absolute -top-1 -right-1.5 bg-terra text-[hsl(38_35%_96%)] rounded-full text-[9px] font-mono leading-none px-1 py-px min-w-[14px] text-center">
            {badge}
          </span>
        )}
      </span>
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
