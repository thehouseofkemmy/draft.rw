import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Users, FileText, MessageSquare, Bell, Mail, LayoutDashboard,
  Trash2, Eye, EyeOff, ShieldCheck, ShieldOff, ExternalLink, Download, PenLine,
} from "lucide-react";
import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string; handle: string | null; display_name: string | null;
  bio: string | null; avatar_url: string | null; created_at: string;
  is_admin?: boolean;
};

type Draft = {
  id: string; title: string; content: string; excerpt: string | null;
  published: boolean; created_at: string; author_id: string;
  pinned: boolean;
  profiles: { handle: string | null; display_name: string | null } | null;
  like_count?: number; comment_count?: number; repost_count?: number;
};

type Comment = {
  id: string; content: string; created_at: string;
  user_id: string; draft_id: string;
  profiles: { handle: string | null; display_name: string | null } | null;
  drafts: { title: string } | null;
};

type Notification = {
  id: string; type: string; created_at: string; read: boolean;
  to_user_id: string; from_user_id: string | null; draft_id: string | null;
  to_profile: { handle: string | null } | null;
  from_profile: { handle: string | null } | null;
};

type Subscriber = { id: string; email: string; created_at: string };

type Stats = {
  users: number; drafts: number; published: number;
  comments: number; likes: number; reposts: number;
  follows: number; subscribers: number;
};

const composeSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  content: z.string().trim().min(1, "Write something"),
  excerpt: z.string().trim().max(500).optional(),
});

// ─── Stats Overview ───────────────────────────────────────────────────────────

function OverviewTab({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const cards = [
    { label: "Users", value: stats?.users, icon: Users, color: "text-blue-400" },
    { label: "Total Pieces", value: stats?.drafts, icon: FileText, color: "text-amber-400" },
    { label: "Published", value: stats?.published, icon: Eye, color: "text-green-400" },
    { label: "Comments", value: stats?.comments, icon: MessageSquare, color: "text-purple-400" },
    { label: "Likes", value: stats?.likes, icon: Bell, color: "text-rose-400" },
    { label: "Reposts", value: stats?.reposts, icon: FileText, color: "text-cyan-400" },
    { label: "Follows", value: stats?.follows, icon: Users, color: "text-indigo-400" },
    { label: "Subscribers", value: stats?.subscribers, icon: Mail, color: "text-orange-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="bg-surface border-rule/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-ink-soft flex items-center gap-2">
              <Icon size={14} className={color} />{label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-serif text-ink">
              {loading ? "—" : (value ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, handle, display_name, bio, avatar_url, created_at")
      .order("created_at", { ascending: false });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = new Set((roles ?? []).map((r: any) => r.user_id));
    setUsers((profiles ?? []).map((p: any) => ({ ...p, is_admin: adminIds.has(p.id) })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (profile: Profile) => {
    if (profile.id === currentUserId) return toast.error("Can't change your own role.");
    if (profile.is_admin) {
      await supabase.from("user_roles").delete().eq("user_id", profile.id).eq("role", "admin");
      toast.success(`Removed admin from @${profile.handle}`);
    } else {
      await supabase.from("user_roles").insert({ user_id: profile.id, role: "admin" });
      toast.success(`@${profile.handle} is now admin`);
    }
    load();
  };

  const deleteUser = async (profile: Profile) => {
    if (profile.id === currentUserId) return toast.error("Can't delete yourself.");
    if (!confirm(`Delete @${profile.handle}? This will cascade to all their content.`)) return;
    await supabase.from("profiles").delete().eq("id", profile.id);
    toast.success("User deleted.");
    load();
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || (u.handle ?? "").includes(q) || (u.display_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="search by handle or name…"
        value={search} onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm bg-paper border-rule font-mono text-sm"
      />
      <div className="border border-rule/40 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-rule/40 hover:bg-transparent">
              <TableHead className="font-mono text-xs text-ink-soft uppercase">User</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Handle</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Joined</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Role</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center font-mono text-sm text-ink-soft py-8">loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center font-serif italic text-ink-soft py-8">no users found</TableCell></TableRow>
            ) : filtered.map((u) => (
              <TableRow key={u.id} className="border-rule/30 hover:bg-surface/40">
                <TableCell>
                  <div>
                    <p className="font-serif text-ink">{u.display_name || "—"}</p>
                    <p className="font-mono text-xs text-ink-soft truncate max-w-[120px]">{u.id.slice(0, 8)}…</p>
                  </div>
                </TableCell>
                <TableCell>
                  {u.handle ? (
                    <Link to={`/${u.handle}`} target="_blank" className="font-mono text-sm text-primary hover:underline flex items-center gap-1">
                      @{u.handle}<ExternalLink size={10} />
                    </Link>
                  ) : <span className="text-ink-soft">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-soft">
                  {format(new Date(u.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_admin ? "default" : "secondary"} className="font-mono text-xs">
                    {u.is_admin ? "admin" : "user"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => toggleAdmin(u)}
                      className="h-7 px-2 text-xs font-mono" title={u.is_admin ? "Remove admin" : "Make admin"}>
                      {u.is_admin ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-mono text-xs text-ink-soft">{filtered.length} of {users.length} users</p>
    </div>
  );
}

// ─── Content Tab ──────────────────────────────────────────────────────────────

function ContentTab({ currentUserId }: { currentUserId: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Draft | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("drafts")
      .select(`
        id, title, content, excerpt, published, created_at, author_id, pinned,
        profiles:author_id ( handle, display_name )
      `)
      .order("created_at", { ascending: false });

    const ids = (data ?? []).map((d: any) => d.id);
    let statsMap: Record<string, { like_count: number; comment_count: number; repost_count: number }> = {};
    if (ids.length) {
      const { data: stats } = await supabase
        .from("draft_stats")
        .select("id, like_count, comment_count, repost_count")
        .in("id", ids);
      (stats ?? []).forEach((s: any) => { statsMap[s.id] = s; });
    }

    setDrafts((data ?? []).map((d: any) => ({ ...d, ...statsMap[d.id] })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (d: Draft) => {
    await supabase.from("drafts").update({ published: !d.published }).eq("id", d.id);
    toast.success(d.published ? "Unpublished" : "Published");
    load();
  };

  const deleteDraft = async (d: Draft) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    await supabase.from("drafts").delete().eq("id", d.id);
    toast.success("Piece deleted.");
    load();
  };

  const openEdit = (d: Draft) => {
    setEditTarget(d);
    setEditTitle(d.title);
    setEditExcerpt(d.excerpt ?? "");
    setEditContent(d.content);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const parsed = composeSchema.safeParse({ title: editTitle, content: editContent, excerpt: editExcerpt || undefined });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const { error } = await supabase.from("drafts").update({
      title: parsed.data.title, content: parsed.data.content, excerpt: parsed.data.excerpt ?? null,
    }).eq("id", editTarget.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    setEditTarget(null);
    load();
  };

  const filtered = drafts.filter((d) => {
    if (filter === "published" && !d.published) return false;
    if (filter === "draft" && d.published) return false;
    const q = search.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || (d.profiles?.handle ?? "").includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="search by title or author…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs bg-paper border-rule font-mono text-sm"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-36 bg-paper border-rule font-mono text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="published">published</SelectItem>
            <SelectItem value="draft">drafts</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-rule/40 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-rule/40 hover:bg-transparent">
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Title</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Author</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Date</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Status</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Stats</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center font-mono text-sm text-ink-soft py-8">loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center font-serif italic text-ink-soft py-8">no pieces found</TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id} className="border-rule/30 hover:bg-surface/40">
                <TableCell className="max-w-[200px]">
                  <p className="font-serif text-ink truncate">{d.title}</p>
                  {d.pinned && <span className="font-mono text-[10px] text-amber-500">pinned</span>}
                </TableCell>
                <TableCell>
                  {d.profiles?.handle ? (
                    <Link to={`/${d.profiles.handle}`} target="_blank" className="font-mono text-xs text-primary hover:underline">
                      @{d.profiles.handle}
                    </Link>
                  ) : <span className="text-ink-soft font-mono text-xs">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-soft whitespace-nowrap">
                  {format(new Date(d.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <Badge variant={d.published ? "default" : "secondary"} className="font-mono text-xs">
                    {d.published ? "live" : "draft"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-soft">
                  ♥ {d.like_count ?? 0} · 💬 {d.comment_count ?? 0} · ↺ {d.repost_count ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(d)} className="h-7 px-2">
                      <PenLine size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => togglePublish(d)} className="h-7 px-2">
                      {d.published ? <EyeOff size={13} /> : <Eye size={13} />}
                    </Button>
                    <Link to={`/drafts/${d.id}`} target="_blank">
                      <Button size="sm" variant="ghost" className="h-7 px-2">
                        <ExternalLink size={13} />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => deleteDraft(d)}
                      className="h-7 px-2 text-destructive hover:text-destructive">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-mono text-xs text-ink-soft">{filtered.length} of {drafts.length} pieces</p>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-2xl bg-paper border-rule">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">edit piece</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="label-mono">title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="bg-paper border-rule mt-1 font-serif" maxLength={200} />
            </div>
            <div>
              <Label className="label-mono">excerpt</Label>
              <Input value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)}
                className="bg-paper border-rule mt-1 font-serif italic" maxLength={500} />
            </div>
            <div>
              <Label className="label-mono">content</Label>
              <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                rows={12} className="bg-paper border-rule mt-1 font-serif text-sm leading-relaxed" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} className="font-mono text-xs">cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="font-mono text-xs uppercase tracking-widest">
              {saving ? "saving…" : "save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Comments Tab ─────────────────────────────────────────────────────────────

function CommentsTab() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select(`
        id, content, created_at, user_id, draft_id,
        profiles:user_id ( handle, display_name ),
        drafts:draft_id ( title )
      `)
      .order("created_at", { ascending: false });
    setComments(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteComment = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    await supabase.from("comments").delete().eq("id", id);
    toast.success("Comment deleted.");
    load();
  };

  const filtered = comments.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.content.toLowerCase().includes(q) || (c.profiles?.handle ?? "").includes(q);
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="search by content or author…"
        value={search} onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm bg-paper border-rule font-mono text-sm"
      />
      <div className="border border-rule/40 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-rule/40 hover:bg-transparent">
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Comment</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Author</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">On Piece</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Date</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center font-mono text-sm text-ink-soft py-8">loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center font-serif italic text-ink-soft py-8">no comments found</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className="border-rule/30 hover:bg-surface/40">
                <TableCell className="max-w-[240px]">
                  <p className="text-sm text-ink truncate">{c.content}</p>
                </TableCell>
                <TableCell>
                  {c.profiles?.handle ? (
                    <Link to={`/${c.profiles.handle}`} target="_blank"
                      className="font-mono text-xs text-primary hover:underline">
                      @{c.profiles.handle}
                    </Link>
                  ) : <span className="text-ink-soft font-mono text-xs">—</span>}
                </TableCell>
                <TableCell className="max-w-[160px]">
                  <Link to={`/drafts/${c.draft_id}`} target="_blank"
                    className="font-mono text-xs text-ink-soft hover:text-ink truncate block">
                    {c.drafts?.title ?? c.draft_id.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-soft whitespace-nowrap">
                  {format(new Date(c.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => deleteComment(c.id)}
                    className="h-7 px-2 text-destructive hover:text-destructive">
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-mono text-xs text-ink-soft">{filtered.length} of {comments.length} comments</p>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select(`
        id, type, created_at, read, to_user_id, from_user_id, draft_id,
        to_profile:to_user_id ( handle ),
        from_profile:from_user_id ( handle )
      `)
      .order("created_at", { ascending: false })
      .limit(200);
    setNotifs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteNotif = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  };

  const TYPE_COLORS: Record<string, string> = {
    like: "text-rose-400", comment: "text-purple-400",
    follow: "text-blue-400", repost: "text-cyan-400", mention: "text-amber-400",
  };

  const filtered = notifs.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (readFilter === "read" && !n.read) return false;
    if (readFilter === "unread" && n.read) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 bg-paper border-rule font-mono text-sm">
            <SelectValue placeholder="type" />
          </SelectTrigger>
          <SelectContent>
            {["all", "like", "comment", "follow", "repost", "mention"].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-32 bg-paper border-rule font-mono text-sm">
            <SelectValue placeholder="read" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="read">read</SelectItem>
            <SelectItem value="unread">unread</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border border-rule/40 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-rule/40 hover:bg-transparent">
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Type</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">From</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">To</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Date</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Read</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center font-mono text-sm text-ink-soft py-8">loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center font-serif italic text-ink-soft py-8">no notifications found</TableCell></TableRow>
            ) : filtered.map((n) => (
              <TableRow key={n.id} className="border-rule/30 hover:bg-surface/40">
                <TableCell>
                  <span className={`font-mono text-xs font-medium ${TYPE_COLORS[n.type] ?? "text-ink"}`}>
                    {n.type}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {n.from_profile?.handle ? `@${n.from_profile.handle}` : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {n.to_profile?.handle ? `@${n.to_profile.handle}` : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-soft whitespace-nowrap">
                  {format(new Date(n.created_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge variant={n.read ? "secondary" : "default"} className="font-mono text-xs">
                    {n.read ? "read" : "new"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => deleteNotif(n.id)}
                    className="h-7 px-2 text-destructive hover:text-destructive">
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-mono text-xs text-ink-soft">{filtered.length} of {notifs.length} notifications shown (last 200)</p>
    </div>
  );
}

// ─── Subscribers Tab ──────────────────────────────────────────────────────────

function SubscribersTab() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });
    setSubs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteSub = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from subscribers?`)) return;
    await supabase.from("subscribers").delete().eq("id", id);
    toast.success("Subscriber removed.");
    load();
  };

  const exportCsv = () => {
    const csv = ["email,joined", ...subs.map((s) =>
      `${s.email},${format(new Date(s.created_at), "yyyy-MM-dd")}`
    )].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "drafts-rw-subscribers.csv";
    a.click();
  };

  const filtered = subs.filter((s) => !search || s.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Input
          placeholder="search by email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-paper border-rule font-mono text-sm"
        />
        <Button variant="outline" onClick={exportCsv} className="font-mono text-xs border-rule gap-2">
          <Download size={13} /> export csv
        </Button>
      </div>
      <div className="border border-rule/40 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-rule/40 hover:bg-transparent">
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Email</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase">Joined</TableHead>
              <TableHead className="font-mono text-xs text-ink-soft uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} className="text-center font-mono text-sm text-ink-soft py-8">loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center font-serif italic text-ink-soft py-8">no subscribers found</TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id} className="border-rule/30 hover:bg-surface/40">
                <TableCell className="font-mono text-sm text-ink">{s.email}</TableCell>
                <TableCell className="font-mono text-xs text-ink-soft">
                  {format(new Date(s.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => deleteSub(s.id, s.email)}
                    className="h-7 px-2 text-destructive hover:text-destructive">
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="font-mono text-xs text-ink-soft">{filtered.length} of {subs.length} subscribers</p>
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

const Admin = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/");
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setStatsLoading(true);
      const [
        { count: users },
        { count: drafts },
        { count: published },
        { count: comments },
        { count: likes },
        { count: reposts },
        { count: follows },
        { count: subscribers },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("drafts").select("*", { count: "exact", head: true }),
        supabase.from("drafts").select("*", { count: "exact", head: true }).eq("published", true),
        supabase.from("comments").select("*", { count: "exact", head: true }),
        supabase.from("likes").select("*", { count: "exact", head: true }),
        supabase.from("reposts").select("*", { count: "exact", head: true }),
        supabase.from("follows").select("*", { count: "exact", head: true }),
        supabase.from("subscribers").select("*", { count: "exact", head: true }),
      ]);
      setStats({ users: users ?? 0, drafts: drafts ?? 0, published: published ?? 0, comments: comments ?? 0, likes: likes ?? 0, reposts: reposts ?? 0, follows: follows ?? 0, subscribers: subscribers ?? 0 });
      setStatsLoading(false);
    })();
  }, [isAdmin]);

  if (loading || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="label-mono mb-2">— admin</p>
          <h1 className="font-serif text-4xl text-ink">drafts.rw dashboard</h1>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-surface border border-rule/40 h-auto flex-wrap gap-1 p-1">
            {[
              { value: "overview", label: "overview", icon: LayoutDashboard },
              { value: "users", label: "users", icon: Users },
              { value: "content", label: "content", icon: FileText },
              { value: "comments", label: "comments", icon: MessageSquare },
              { value: "notifications", label: "notifications", icon: Bell },
              { value: "subscribers", label: "subscribers", icon: Mail },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}
                className="font-mono text-xs uppercase tracking-wider data-[state=active]:bg-paper data-[state=active]:text-ink flex items-center gap-1.5">
                <Icon size={12} />{label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab stats={stats} loading={statsLoading} />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab currentUserId={user!.id} />
          </TabsContent>

          <TabsContent value="content">
            <ContentTab currentUserId={user!.id} />
          </TabsContent>

          <TabsContent value="comments">
            <CommentsTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          <TabsContent value="subscribers">
            <SubscribersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
