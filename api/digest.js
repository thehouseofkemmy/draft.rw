/**
 * GET /api/digest  (Vercel Cron — runs daily at 08:00 UTC)
 *
 * For each user with un-emailed notifications from the past 24 h:
 *   1. Group by type
 *   2. Send a single digest email via Resend
 *   3. Mark those rows as emailed
 *
 * Requires DB column: notifications.emailed BOOLEAN DEFAULT false
 * Run once in Supabase SQL editor:
 *   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed BOOLEAN NOT NULL DEFAULT false;
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const resend = new Resend(process.env.RESEND_API_KEY);

const TYPE_LABEL = {
  like:    "liked your piece",
  comment: "replied to your piece",
  follow:  "followed you",
  repost:  "reposted your piece",
  mention: "mentioned you",
};

const TYPE_EMOJI = {
  like: "♥", comment: "💬", follow: "➕", repost: "↺", mention: "@",
};

export default async function handler(req, res) {
  // Vercel cron passes GET with Authorization header
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all un-emailed notifications from past 24h
  const { data: notifs, error } = await supabase
    .from("notifications")
    .select("id, to_user_id, from_user_id, type, draft_id, created_at")
    .eq("emailed", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!notifs?.length) return res.status(200).json({ sent: 0 });

  // Group by recipient
  const byUser: Record<string, typeof notifs> = {};
  for (const n of notifs) {
    if (!byUser[n.to_user_id]) byUser[n.to_user_id] = [];
    byUser[n.to_user_id].push(n);
  }

  const recipientIds = Object.keys(byUser);

  // Batch-fetch recipient profiles + emails (emails require service role)
  const [profilesRes, authRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name, handle").in("id", recipientIds),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const profileMap: Record<string, { display_name: string | null; handle: string | null }> = {};
  (profilesRes.data ?? []).forEach((p: any) => { profileMap[p.id] = p; });

  const emailMap: Record<string, string> = {};
  (authRes.data?.users ?? []).forEach((u: any) => {
    if (u.email) emailMap[u.id] = u.email;
  });

  // Batch-fetch sender names
  const senderIds = [...new Set(notifs.map((n) => n.from_user_id).filter(Boolean))];
  const { data: senders } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", senderIds);
  const senderMap: Record<string, string> = {};
  (senders ?? []).forEach((s: any) => { senderMap[s.id] = s.display_name ?? "someone"; });

  let sent = 0;
  const sentIds: string[] = [];

  for (const [userId, userNotifs] of Object.entries(byUser)) {
    const email = emailMap[userId];
    if (!email) continue;

    const profile  = profileMap[userId];
    const name     = profile?.display_name ?? email.split("@")[0];
    const handle   = profile?.handle;
    const profileUrl = handle ? `https://drafts.rw/${handle}` : "https://drafts.rw";

    // Group notifications by type for display
    const grouped: Record<string, { names: string[]; draftId: string | null }> = {};
    for (const n of userNotifs) {
      if (!grouped[n.type]) grouped[n.type] = { names: [], draftId: n.draft_id };
      const senderName = n.from_user_id ? senderMap[n.from_user_id] ?? "someone" : "someone";
      grouped[n.type].names.push(senderName);
    }

    const rows = Object.entries(grouped).map(([type, { names, draftId }]) => {
      const label   = TYPE_LABEL[type] ?? "interacted with you";
      const emoji   = TYPE_EMOJI[type] ?? "•";
      const who     = names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names[0]} and ${names.length - 1} others`;
      const link    = draftId
        ? `https://drafts.rw/drafts/${draftId}`
        : "https://drafts.rw/notifications";

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #2a2218;font-size:14px;color:#c4b49a;">
            <span style="font-size:16px;margin-right:10px;">${emoji}</span>
            <strong style="color:#e8dcc8;">${who}</strong> ${label}
            &nbsp;<a href="${link}" style="color:#b56a3d;font-size:12px;text-decoration:none;">view →</a>
          </td>
        </tr>`;
    }).join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0d0a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0d0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#161310;border:1px solid #2a2218;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 32px 20px;border-bottom:1px solid #2a2218;">
            <p style="margin:0;font-size:22px;color:#e8dcc8;letter-spacing:-0.02em;">
              drafts<span style="color:#b56a3d;">.rw</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px;">
            <p style="margin:0 0 4px;font-size:13px;font-family:monospace;color:#7a6a55;letter-spacing:0.1em;text-transform:uppercase;">
              daily digest
            </p>
            <p style="margin:0;font-size:18px;color:#e8dcc8;">
              hey ${name}, here's what happened today
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #2a2218;">
            <a href="${profileUrl}" style="display:inline-block;background:#b56a3d;color:#f5ede0;text-decoration:none;font-family:monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;padding:10px 24px;">
              open drafts.rw
            </a>
            <p style="margin:16px 0 0;font-size:11px;font-family:monospace;color:#4a3e30;">
              you're receiving this because you have an account on drafts.rw.
              <a href="https://drafts.rw/settings" style="color:#7a6a55;">manage preferences</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error: sendErr } = await resend.emails.send({
      from:    process.env.RESEND_FROM ?? "drafts.rw <notifications@drafts.rw>",
      to:      email,
      subject: `${userNotifs.length} new notification${userNotifs.length > 1 ? "s" : ""} on drafts.rw`,
      html,
    });

    if (!sendErr) {
      sent++;
      sentIds.push(...userNotifs.map((n) => n.id));
    }
  }

  // Mark all sent notifications as emailed
  if (sentIds.length) {
    await supabase
      .from("notifications")
      .update({ emailed: true })
      .in("id", sentIds);
  }

  res.status(200).json({ sent, notifs: notifs.length });
}
