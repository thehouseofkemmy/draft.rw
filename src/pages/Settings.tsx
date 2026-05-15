import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Avatar from "@/components/feed/Avatar";
import Layout from "@/components/draft/Layout";

export default function Settings() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { isDark, toggle } = useTheme();
  const push = usePushNotifications();
  const navigate = useNavigate();

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "drafter";
  const handle = profile?.handle ?? null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Layout>
      <div className="px-4 py-4 border-b border-rule/50">
        <h1 className="font-semibold text-[17px] text-ink">settings</h1>
      </div>

      {/* Account */}
      {user && (
        <section className="border-b border-rule/50">
          <p className="px-4 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">account</p>

          {/* Profile card */}
          <div
            className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-paper/60 transition-colors"
            onClick={() => handle ? navigate(`/${handle}`) : navigate("/onboarding")}
          >
            <Avatar name={displayName} id={user.id} avatarUrl={profile?.avatar_url} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[14px] text-ink truncate">{displayName}</div>
              <div className="font-mono text-[11px] text-ink-muted">
                {handle ? `@${handle}` : "finish setup →"}
              </div>
            </div>
            <i className="ti ti-chevron-right text-[16px] text-ink-muted" />
          </div>

          <Row
            icon="ti-user-edit"
            label="edit profile"
            onClick={() => handle ? navigate(`/${handle}`) : navigate("/onboarding")}
          />
        </section>
      )}

      {/* Appearance */}
      <section className="border-b border-rule/50">
        <p className="px-4 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">appearance</p>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <i className={`ti ${isDark ? "ti-moon" : "ti-sun"} text-[18px] text-ink-muted`} />
            <span className="text-[14px] text-ink">dark mode</span>
          </div>
          {/* Toggle switch */}
          <button
            onClick={toggle}
            className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0
              ${isDark ? "bg-terra" : "bg-rule/60"}`}
            aria-label="toggle dark mode"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform
                ${isDark ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </section>

      {/* Notifications */}
      <section className="border-b border-rule/50">
        <p className="px-4 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">notifications</p>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <i className="ti ti-bell text-[18px] text-ink-muted" />
            <div>
              <span className="text-[14px] text-ink block">push notifications</span>
              {push.isDenied && <span className="font-mono text-[11px] text-[hsl(0_55%_48%)]">blocked — check browser settings</span>}
              {!push.isSupported && !push.isDenied && <span className="font-mono text-[11px] text-ink-muted">not supported on this browser</span>}
            </div>
          </div>
          {push.isSupported && !push.isDenied && (
            <button
              onClick={push.toggle}
              disabled={push.isLoading}
              className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0 disabled:opacity-50
                ${push.isSubscribed ? "bg-terra" : "bg-rule/60"}`}
              aria-label="toggle push notifications"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform ${push.isSubscribed ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          )}
        </div>
      </section>

      {/* Sign out */}
      {user && (
        <section>
          <p className="px-4 pt-4 pb-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">account</p>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-paper/60 transition-colors bg-transparent border-none cursor-pointer text-left"
          >
            <i className="ti ti-logout text-[18px] text-[hsl(0_55%_48%)]" />
            <span className="text-[14px] text-[hsl(0_55%_48%)]">sign out</span>
          </button>
        </section>
      )}

      {!user && (
        <div className="px-4 py-10 text-center">
          <p className="font-serif italic text-ink-muted text-[14px] mb-4">you're not signed in.</p>
          <button
            onClick={() => navigate("/auth")}
            className="bg-terra text-[hsl(38_35%_96%)] border-none px-6 py-2 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90"
          >
            sign in
          </button>
        </div>
      )}
    </Layout>
  );
}

function Row({ icon, label, onClick, danger }: {
  icon: string; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-paper/60 transition-colors bg-transparent border-none cursor-pointer text-left"
    >
      <i className={`ti ${icon} text-[18px] ${danger ? "text-[hsl(0_55%_48%)]" : "text-ink-muted"}`} />
      <span className={`text-[14px] ${danger ? "text-[hsl(0_55%_48%)]" : "text-ink"}`}>{label}</span>
      <i className="ti ti-chevron-right text-[14px] text-ink-muted ml-auto" />
    </button>
  );
}
