import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CoverGradient = { id: string; css: string; label: string };

export const COVER_GRADIENTS: CoverGradient[] = [
  { id: "terra",   label: "terra",   css: "linear-gradient(135deg, hsl(15 54% 37% / 0.85), hsl(25 22% 11%))" },
  { id: "forest",  label: "forest",  css: "linear-gradient(135deg, hsl(140 45% 28% / 0.9), hsl(160 30% 8%))" },
  { id: "ocean",   label: "ocean",   css: "linear-gradient(135deg, hsl(200 65% 35% / 0.9), hsl(220 40% 10%))" },
  { id: "dusk",    label: "dusk",    css: "linear-gradient(135deg, hsl(270 35% 45% / 0.8), hsl(20 30% 10%))" },
  { id: "dawn",    label: "dawn",    css: "linear-gradient(135deg, hsl(35 80% 55% / 0.8), hsl(340 40% 12%))" },
  { id: "mist",    label: "mist",    css: "linear-gradient(135deg, hsl(200 20% 55% / 0.5), hsl(210 25% 18%))" },
  { id: "noir",    label: "noir",    css: "linear-gradient(135deg, hsl(0 0% 28%), hsl(0 0% 6%))" },
  { id: "crimson", label: "crimson", css: "linear-gradient(135deg, hsl(350 65% 40% / 0.85), hsl(340 30% 8%))" },
];

/** Resolve a stored cover_url to a renderable style or src */
export function parseCover(coverUrl: string | null | undefined): { type: "gradient"; css: string } | { type: "image"; src: string } | { type: "default" } {
  if (!coverUrl) return { type: "default" };
  if (coverUrl.startsWith("gradient:")) {
    const g = COVER_GRADIENTS.find((g) => g.id === coverUrl.slice(9));
    return g ? { type: "gradient", css: g.css } : { type: "default" };
  }
  return { type: "image", src: coverUrl };
}

type Tab = "gradient" | "photo";

type Props = {
  userId: string;
  currentCover: string | null;
  onSave: (coverUrl: string) => void;
  onClose: () => void;
};

export default function CoverPickerModal({ userId, currentCover, onSave, onClose }: Props) {
  const [tab, setTab]           = useState<Tab>("gradient");
  const [selected, setSelected] = useState<string | null>(
    currentCover?.startsWith("gradient:") ? currentCover.slice(9) : null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("max 8 MB"); return; }
    setError("");
    setUploadFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    if (tab === "gradient" && selected) {
      onSave(`gradient:${selected}`);
      setSaving(false);
      return;
    }

    if (tab === "photo" && uploadFile) {
      const ext  = uploadFile.name.split(".").pop() ?? "jpg";
      const path = `${userId}/cover-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, uploadFile, { upsert: true });
      if (upErr) { setError(upErr.message); setSaving(false); return; }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onSave(data.publicUrl);
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  const canSave =
    (tab === "gradient" && selected !== null) ||
    (tab === "photo"    && uploadFile !== null);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 w-full max-w-[420px]">
        {/* Tab bar */}
        <div className="flex border-b border-rule/50">
          {(["gradient", "photo"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 font-mono text-[10px] uppercase tracking-[0.12em] py-3 border-none bg-transparent cursor-pointer border-b-2 -mb-px transition-colors
                ${tab === t ? "text-ink border-terra" : "text-ink-muted border-transparent hover:text-ink-dim"}`}
            >
              {t === "gradient" ? "gradient" : "upload photo"}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "gradient" ? (
            <div className="grid grid-cols-4 gap-2">
              {COVER_GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  title={g.label}
                  onClick={() => setSelected(g.id)}
                  className={`h-[52px] border-2 cursor-pointer transition-all rounded-sm
                    ${selected === g.id
                      ? "border-terra ring-1 ring-terra scale-[1.05]"
                      : "border-transparent hover:border-rule/60"}`}
                  style={{ background: g.css }}
                />
              ))}
            </div>
          ) : (
            <div>
              <div
                className="h-28 border border-rule/50 flex items-center justify-center cursor-pointer hover:border-ink/40 transition-colors overflow-hidden mb-3 relative"
                onClick={() => fileRef.current?.click()}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="text-center pointer-events-none">
                    <i className="ti ti-upload text-[22px] text-ink-muted block mb-1" />
                    <span className="font-mono text-[10px] text-ink-muted">click to choose</span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="font-mono text-[9px] text-ink-muted">jpg · png · webp · max 8 MB</p>
            </div>
          )}

          {error && (
            <p className="font-mono text-[10px] text-[hsl(0_60%_48%)] mt-3">{error}</p>
          )}

          <div className="flex gap-2 justify-end mt-5">
            <button
              onClick={onClose}
              className="border border-rule/60 bg-transparent text-ink-muted px-4 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer hover:text-ink hover:border-ink transition-colors"
            >
              cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="bg-terra text-[hsl(38_35%_96%)] border-none px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? "saving…" : "apply cover"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
