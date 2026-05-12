import http from "http";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:8080" }));
app.use((req, _res, next) => { console.log("→", req.method, req.path); next(); });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Send OTP ──────────────────────────────────────────────
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    console.log("generating otp for:", email);

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      console.error("supabase error:", error);
      return res.status(400).json({ error: error.message });
    }

    const otp = data.properties.email_otp;
    console.log("otp length:", otp?.length, "otp:", otp);

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
    console.log("resend response:", JSON.stringify(resendBody));

    if (!emailRes.ok) {
      return res.status(500).json({ error: resendBody.message ?? "failed to send email" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("unexpected error:", err);
    res.status(500).json({ error: "server error" });
  }
});

// ── Welcome email (sent after onboarding) ────────────────
app.post("/api/welcome", async (req, res) => {
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
    if (!emailRes.ok) {
      console.warn("welcome email failed:", body);
      return res.status(500).json({ error: body.message ?? "failed" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("welcome email error:", err);
    res.status(500).json({ error: "server error" });
  }
});

process.on("uncaughtException",    (err) => console.error("uncaught:", err));
process.on("unhandledRejection",   (err) => console.error("unhandled rejection:", err));

const PORT = process.env.API_PORT || 3001;
const server = http.createServer(app);
server.listen(PORT, () => console.log(`api ready on :${PORT}`));
