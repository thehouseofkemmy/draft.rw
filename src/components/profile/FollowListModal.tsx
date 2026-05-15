import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/feed/Avatar";
import { seedProfileMeta } from "@/lib/profileCache";

type Person = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  profileId: string;
  type: "followers" | "following";
  onClose: () => void;
};

export default function FollowListModal({ profileId, type, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [people,   setPeople]   = useState<Person[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, type]);

  const load = async () => {
    setLoading(true);

    // Fetch the IDs of the relevant users
    const { data: rows } = type === "followers"
      ? await supabase.from("follows").select("follower_id").eq("following_id", profileId)
      : await supabase.from("follows").select("following_id").eq("follower_id", profileId);

    const ids = (rows ?? []).map((r: any) => type === "followers" ? r.follower_id : r.following_id) as string[];

    if (ids.length === 0) { setPeople([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .in("id", ids);

    const list = (profiles ?? []) as Person[];
    setPeople(list);
    list.forEach((p) => {
      if (p.handle) seedProfileMeta(p.handle, { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, handle: p.handle });
    });

    // Load follow state (which of these does the current user follow?)
    if (user) {
      const othersIds = list.map(p => p.id).filter(id => id !== user.id);
      if (othersIds.length > 0) {
        const { data: myFollows } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .in("following_id", othersIds);
        const map: Record<string, boolean> = {};
        (myFollows ?? []).forEach((r: any) => { map[r.following_id] = true; });
        setFollowed(map);
      }
    }

    setLoading(false);
  };

  const toggleFollow = async (personId: string) => {
    if (!user) return;
    const next = !followed[personId];
    setFollowed(f => ({ ...f, [personId]: next }));
    if (next) await supabase.from("follows").insert({ follower_id: user.id, following_id: personId });
    else      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", personId);
  };

  const goToProfile = (handle: string | null) => {
    if (!handle) return;
    onClose();
    navigate(`/${handle}`);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full sm:max-w-[400px] h-[68vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule/50 flex-shrink-0">
          <span className="font-semibold text-[15px] text-ink">
            {type === "followers" ? "followers" : "following"}
          </span>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-1"
          >
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-rule/50 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-paper flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-paper rounded w-32" />
                    <div className="h-2.5 bg-paper/70 rounded w-20" />
                  </div>
                  <div className="h-6 w-16 bg-paper rounded flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : people.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="font-serif italic text-ink-muted text-[14px]">
                {type === "followers" ? "no followers yet." : "not following anyone yet."}
              </p>
            </div>
          ) : (
            people.map((person) => {
              const name   = person.display_name ?? person.handle ?? "drafter";
              const handle = person.handle ?? "";
              const isSelf = user?.id === person.id;
              return (
                <div
                  key={person.id}
                  className="px-4 py-3 border-b border-rule/50 flex items-center gap-3 hover:bg-paper/50 transition-colors cursor-pointer"
                  onClick={() => goToProfile(handle)}
                >
                  <Avatar name={name} id={person.id} avatarUrl={person.avatar_url} size={40} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] text-ink truncate">{name}</div>
                    {handle && (
                      <div className="font-mono text-[11px] text-ink-muted">@{handle}</div>
                    )}
                  </div>
                  {user && !isSelf && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFollow(person.id); }}
                      className={`flex-shrink-0 border font-mono text-[10px] tracking-[0.08em] px-3 py-1 cursor-pointer transition-colors
                        ${followed[person.id]
                          ? "bg-transparent border-rule/50 text-ink-muted hover:border-[hsl(0_55%_48%)] hover:text-[hsl(0_55%_48%)]"
                          : "bg-terra border-terra text-[hsl(38_35%_96%)] hover:opacity-90"}`}
                    >
                      {followed[person.id] ? "following" : "follow"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
