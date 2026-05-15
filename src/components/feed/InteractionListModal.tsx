import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Avatar from "@/components/feed/Avatar";
import { seedProfileMeta } from "@/lib/profileCache";

type Person = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  draftId: string;
  type: "likes" | "reposts";
  onClose: () => void;
};

export default function InteractionListModal({ draftId, type, onClose }: Props) {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, type]);

  const load = async () => {
    setLoading(true);
    const table = type === "likes" ? "likes" : "reposts";
    const userCol = "user_id";

    const { data: rows } = await supabase
      .from(table).select(userCol).eq("draft_id", draftId);

    const ids = (rows ?? []).map((r: any) => r[userCol]) as string[];
    if (!ids.length) { setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles").select("id, handle, display_name, avatar_url").in("id", ids);

    const list = (profiles ?? []) as Person[];
    setPeople(list);
    list.forEach((p) => {
      if (p.handle) seedProfileMeta(p.handle, { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, handle: p.handle });
    });
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full sm:max-w-[380px] h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule/50 flex-shrink-0">
          <span className="font-semibold text-[15px] text-ink">
            {type === "likes" ? "liked by" : "reposted by"}
          </span>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink p-1">
            <i className="ti ti-x text-[18px]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-rule/50 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-paper flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 bg-paper rounded w-28" />
                  <div className="h-2.5 bg-paper/70 rounded w-18" />
                </div>
              </div>
            ))
          ) : people.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="font-serif italic text-ink-muted text-[14px]">nobody yet.</p>
            </div>
          ) : (
            people.map((p) => {
              const name = p.display_name ?? p.handle ?? "drafter";
              return (
                <div
                  key={p.id}
                  className="px-4 py-3 border-b border-rule/50 flex items-center gap-3 hover:bg-paper/50 transition-colors cursor-pointer"
                  onClick={() => { if (p.handle) { onClose(); navigate(`/${p.handle}`); } }}
                >
                  <Avatar name={name} id={p.id} avatarUrl={p.avatar_url} size={36} />
                  <div className="min-w-0">
                    <div className="font-semibold text-[13px] text-ink truncate">{name}</div>
                    {p.handle && <div className="font-mono text-[11px] text-ink-muted">@{p.handle}</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
