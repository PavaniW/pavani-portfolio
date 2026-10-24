// Vercel serverless function: receives the enquiry form and emails it to Pavani
// through Resend (https://resend.com). Needs two environment variables in Vercel:
//   RESEND_API_KEY  – from resend.com > API Keys
//   ENQUIRY_TO      – where enquiries go (the email you signed up to Resend with)
// Optional: ENQUIRY_FROM – a sender on your own verified domain, once you have one.

const LIMITS = { name: 100, brand: 100, email: 200, type: 60, timeline: 60, message: 3000 };
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function clean(value, max) {
  return String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function reply(req, res, status, body) {
  // Plain HTML form posts (no JavaScript) get sent back to the page instead of JSON.
  const isFormPost = (req.headers["content-type"] || "").includes("application/x-www-form-urlencoded");
  if (isFormPost) {
    res.statusCode = 303;
    res.setHeader("Location", status === 200 ? "/?enquiry=sent#contact" : "/?enquiry=error#contact");
    return res.end();
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(req, res, 405, { error: "Method not allowed" });
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};

  // Spam trap: real visitors never see or fill the "website" field.
  // Pretend it worked so bots don't retry.
  if (clean(body.website, 200)) return reply(req, res, 200, { ok: true });

  const data = {};
  for (const [key, max] of Object.entries(LIMITS)) data[key] = clean(body[key], max);

  if (!data.name || !data.brand || !data.type || !data.message || !EMAIL_RE.test(data.email)) {
    return reply(req, res, 400, { error: "Missing or invalid fields" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ENQUIRY_TO;
  if (!apiKey || !to) {
    console.error("Enquiry form is not configured: set RESEND_API_KEY and ENQUIRY_TO");
    return reply(req, res, 500, { error: "Not configured" });
  }

  const rows = [
    ["Name", data.name],
    ["Brand", data.brand],
    ["Email", data.email],
    ["Looking for", data.type],
    ["Timeline", data.timeline || "Not sure yet"],
  ];
  const html = `
    <h2 style="font-family:sans-serif;color:#4a0e2b">New enquiry from ${escapeHtml(data.brand)}</h2>
    <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#7a3a58">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`).join("")}
    </table>
    <p style="font-family:sans-serif;font-size:15px;white-space:pre-wrap;margin-top:16px">${escapeHtml(data.message)}</p>
    <p style="font-family:sans-serif;font-size:13px;color:#7a3a58">Hit reply to answer ${escapeHtml(data.name)} directly.</p>`;
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${data.message}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ENQUIRY_FROM || "Portfolio enquiries <onboarding@resend.dev>",
        to: [to],
        reply_to: data.email,
        subject: `New enquiry: ${data.brand} (${data.type})`,
        html,
        text,
      }),
    });
    if (!response.ok) {
      console.error("Resend error", response.status, await response.text());
      return reply(req, res, 502, { error: "Email failed" });
    }
    return reply(req, res, 200, { ok: true });
  } catch (err) {
    console.error("Enquiry send failed", err);
    return reply(req, res, 502, { error: "Email failed" });
  }
};
