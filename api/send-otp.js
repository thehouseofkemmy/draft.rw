import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://drafts.rw");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { shouldCreateUser: true },
    });

    if (error) return res.status(400).json({ error: error.message });

    const otp = data.properties.email_otp;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "drafts.rw <noreply@drafts.rw>",
        to: email,
        subject: "your drafts.rw code",
        html: `
          <div style="font-family:Georgia,serif;max-width:400px;margin:0 auto;padding:40px 20px;color:#2a1f0f">
            <p style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-family:monospace;color:#999;margin-bottom:28px">drafts.rw</p>
            <p style="font-size:15px;margin-bottom:20px">your one-time code:</p>
            <p style="font-size:38px;letter-spacing:0.35em;font-family:monospace;font-weight:500;margin-bottom:32px">${otp}</p>
            <p style="font-size:12px;color:#aaa">expires in 1 hour. if you didn't request this, ignore it.</p>
          </div>
        `,
      }),
    });

    const resendBody = await emailRes.json();
    if (!emailRes.ok) return res.status(500).json({ error: resendBody.message ?? "failed to send email" });

    res.json({ ok: true });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ error: "server error" });
  }
}
