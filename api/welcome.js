const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_RE = /^[a-zA-Z0-9_]{1,30}$/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://drafts.rw");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { email, handle, displayName } = req.body ?? {};
    if (!email || typeof email !== "string") return res.status(400).json({ error: "email required" });
    if (email.length > 255 || !EMAIL_RE.test(email)) return res.status(400).json({ error: "invalid email" });
    if (handle && (typeof handle !== "string" || handle.length > 30 || !HANDLE_RE.test(handle))) {
      return res.status(400).json({ error: "invalid handle" });
    }
    if (displayName && (typeof displayName !== "string" || displayName.length > 100)) {
      return res.status(400).json({ error: "invalid display name" });
    }

    const safeName   = escapeHtml(displayName ?? handle ?? "writer");
    const safeHandle = escapeHtml(handle ?? "");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "drafts.rw <noreply@drafts.rw>",
        to: email,
        subject: "you're in on drafts.rw",
        html: `
          <div style="font-family:Georgia,serif;max-width:400px;margin:0 auto;padding:40px 20px;color:#2a1f0f">
            <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-family:monospace;color:#999;margin-bottom:28px">drafts.rw</p>
            <p style="font-size:22px;font-weight:500;margin-bottom:12px">welcome, ${safeName}.</p>
            <p style="font-size:15px;color:#6b5c47;line-height:1.7;margin-bottom:24px">
              your handle is <strong>@${safeHandle}</strong>.<br>
              a quiet space for writing is now yours.
            </p>
            <p style="font-size:13px;color:#aaa;margin-bottom:4px">share a piece. follow writers. make it yours.</p>
            <p style="font-size:13px;margin-top:32px">
              <a href="https://drafts.rw" style="color:#8b4b2e;text-decoration:none;font-family:monospace;letter-spacing:0.06em">
                go to drafts.rw →
              </a>
            </p>
          </div>
        `,
      }),
    });

    const body = await emailRes.json();
    if (!emailRes.ok) return res.status(500).json({ error: "failed to send email" });

    res.json({ ok: true });
  } catch (err) {
    console.error("welcome email error:", err);
    res.status(500).json({ error: "server error" });
  }
}
