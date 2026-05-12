import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/draft/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { format } from "date-fns";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  content: z.string().trim().min(1, "Write something"),
  excerpt: z.string().trim().max(500).optional(),
});

type Row = { id: string; title: string; created_at: string; published: boolean };

const Admin = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/");
  }, [user, isAdmin, loading, navigate]);

  const load = async () => {
    const { data } = await supabase.from("drafts").select("id, title, created_at, published").order("created_at", { ascending: false });
    setRows(data ?? []);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ title, content, excerpt: excerpt || undefined });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.from("drafts").insert({
      title: parsed.data.title, content: parsed.data.content,
      excerpt: parsed.data.excerpt ?? null, author_id: user!.id, published: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Piece posted.");
    setTitle(""); setContent(""); setExcerpt("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this piece?")) return;
    await supabase.from("drafts").delete().eq("id", id);
    load();
  };

  const togglePublish = async (id: string, published: boolean) => {
    await supabase.from("drafts").update({ published: !published }).eq("id", id);
    load();
  };

  if (loading || !isAdmin) return null;

  return (
    <Layout>
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <p className="label-mono mb-6">— writing desk</p>
        <h1 className="font-serif text-5xl text-ink mb-10">new piece.</h1>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <Label className="label-mono">title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              className="bg-paper border-rule mt-2 font-serif text-2xl h-auto py-3" required />
          </div>
          <div>
            <Label className="label-mono">excerpt (optional)</Label>
            <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={500}
              className="bg-paper border-rule mt-2 font-serif italic" />
          </div>
          <div>
            <Label className="label-mono">the piece</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18}
              className="bg-paper border-rule mt-2 font-serif text-lg leading-relaxed" required />
          </div>
          <Button type="submit" disabled={busy} className="font-mono text-xs uppercase tracking-widest">
            {busy ? "…" : "Publish"}
          </Button>
        </form>
        <div className="mt-20">
          <h2 className="font-serif text-3xl text-ink mb-6">archive</h2>
          <ul className="divide-y divide-rule/60 border-y border-rule/60">
            {rows.map((r) => (
              <li key={r.id} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-serif text-lg text-ink">{r.title}</p>
                  <p className="label-mono">{format(new Date(r.created_at), "MMM d, yyyy")} · {r.published ? "published" : "draft"}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => togglePublish(r.id, r.published)} className="label-mono hover:text-primary">
                    {r.published ? "unpublish" : "publish"}
                  </button>
                  <button onClick={() => remove(r.id)} className="label-mono hover:text-destructive">delete</button>
                </div>
              </li>
            ))}
            {rows.length === 0 && <li className="py-6 font-serif italic text-ink-soft">no pieces yet.</li>}
          </ul>
        </div>
      </section>
    </Layout>
  );
};

export default Admin;