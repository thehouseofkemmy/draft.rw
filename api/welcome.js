export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://drafts.rw");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { email, handle, displayName } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

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
            <p style="font-size:22px;font-weight:500;margin-bottom:12px">welcome, ${displayName ?? handle}.</p>
            <p style="font-size:15px;color:#6b5c47;line-height:1.7;margin-bottom:24px">
              your handle is <strong>@${handle}</strong>.<br>
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
    if (!emailRes.ok) return res.status(500).json({ error: body.message ?? "failed" });

    res.json({ ok: true });
  } catch (err) {
    console.error("welcome email error:", err);
    res.status(500).json({ error: "server error" });
  }
}
