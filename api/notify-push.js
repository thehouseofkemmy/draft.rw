/**
 * POST /api/notify-push
 * Called by a Supabase Database Webhook on notifications INSERT.
 *
 * Setup in Supabase dashboard:
 *   Database → Webhooks → Create webhook
 *   Table: notifications  |  Events: INSERT
 *   URL: https://drafts.rw/api/notify-push
 *   HTTP Headers: { "x-webhook-secret": "<your WEBHOOK_SECRET>" }
 */
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

webpush.setVapidDetails(
  "mailto:hello@drafts.rw",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const TYPE_BODY = {
  like:    (name) => `${name} liked your piece`,
  comment: (name) => `${name} replied to your piece`,
  follow:  (name) => `${name} followed you`,
  repost:  (name) => `${name} reposted your piece`,
  mention: (name) => `${name} mentioned you in a piece`,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://drafts.rw");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  // Verify Supabase webhook secret
  if (req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const record = req.body?.record;
  if (!record?.to_user_id) return res.status(400).json({ error: "no record" });

  // Don't push-notify yourself
  if (record.from_user_id === record.to_user_id) return res.status(200).json({ skipped: true });

  // Fetch sender display name
  const { data: sender } = await supabase
    .from("profiles")
    .select("display_name, handle")
    .eq("id", record.from_user_id)
    .maybeSingle();

  const name   = sender?.display_name ?? "someone";
  const handle = sender?.handle ?? "";
  const bodyFn = TYPE_BODY[record.type] ?? ((n) => `${n} interacted with you`);
  const url    = record.draft_id
    ? `/drafts/${record.draft_id}`
    : handle ? `/${handle}` : "/notifications";

  const payload = JSON.stringify({
    title: "drafts.rw",
    body:  bodyFn(name),
    url,
    tag:   record.type,
  });

  // Get all push subscriptions for this recipient
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", record.to_user_id);

  if (!subs?.length) return res.status(200).json({ sent: 0 });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
      )
    )
  );

  // Remove expired / invalid subscriptions (410 Gone, 404 Not Found)
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      const code = r.reason?.statusCode;
      if (code === 410 || code === 404) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subs[i].endpoint);
      }
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  res.status(200).json({ sent });
}
