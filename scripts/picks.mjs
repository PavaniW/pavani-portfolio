// Turns the weekly sync into a tick-box review, and turns ticks back into picks.
//
//   node scripts/picks.mjs body    -> prints the pull request description (checklist)
//   node scripts/picks.mjs apply   -> reads PR_BODY (env) and writes data/picks.json
//
// Each checklist line carries a hidden marker like <!-- pick:ig-123 --> so ticking
// a box on GitHub is all Pavani has to do.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const social = existsSync("data/social.json") ? JSON.parse(await readFile("data/social.json", "utf8")) : {};
const picks = existsSync("data/picks.json")
  ? JSON.parse(await readFile("data/picks.json", "utf8"))
  : { show: [], stats: {} };

const STATS = {
  followers: "Follower counts (Instagram + TikTok)",
  avgViews: "Average views",
  engagement: "Engagement rate",
  audience: "Audience: top cities, age, women/men",
};

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n ?? 0));
const box = (on) => (on ? "[x]" : "[ ]");

function body() {
  const lines = [
    "## Weekly Instagram + TikTok update",
    "",
    "Tick what you want on the website. The preview link from Vercel below updates in about a minute.",
    "When it looks right, press **Merge** to publish. Close this to skip the week.",
    "",
  ];
  for (const [key, label] of [["instagram", "Instagram"], ["tiktok", "TikTok"]]) {
    const p = social[key];
    if (!p) { lines.push(`### ${label}`, "_Not connected yet._", ""); continue; }
    lines.push(`### ${label} posts`);
    for (const item of p.latest || []) {
      const views = item.stats?.views ? ` · ${fmt(item.stats.views)} views` : "";
      const likes = item.stats?.likes ? ` · ${fmt(item.stats.likes)} likes` : "";
      const date = (item.date || "").slice(0, 10);
      const cap = (item.caption || "(no caption)").replace(/[<>\[\]]/g, "");
      lines.push(`- ${box(picks.show.includes(item.id))} ${cap} — ${date}${views}${likes} ([open](${item.url})) <!-- pick:${item.id} -->`);
    }
    lines.push("");
  }
  const ig = social.instagram || {}, tt = social.tiktok || {};
  lines.push("### Stats to show");
  const preview = {
    followers: `Instagram ${fmt(ig.followers)} · TikTok ${fmt(tt.followers)}`,
    avgViews: `Reels ${fmt(ig.avgReelViews)} · TikTok ${fmt(tt.avgViews)}`,
    engagement: `${ig.engagementRate ?? 0}%`,
    audience: (ig.audience?.city || []).slice(0, 3).map((c) => c.label.split(",")[0]).join(", ") || "not available yet",
  };
  for (const [k, label] of Object.entries(STATS)) {
    lines.push(`- ${box(picks.stats?.[k])} ${label}: ${preview[k]} <!-- stat:${k} -->`);
  }
  lines.push("", `_Last synced ${(social.updated || "").slice(0, 16).replace("T", " ")} UTC_`);
  return lines.join("\n");
}

async function apply() {
  const text = process.env.PR_BODY || "";
  const ticked = (kind) =>
    [...text.matchAll(new RegExp(`^- \\[([ xX])\\].*<!-- ${kind}:([\\w-]+) -->`, "gm"))]
      .map((m) => ({ id: m[2], on: m[1].toLowerCase() === "x" }));

  const posts = ticked("pick");
  const known = new Set(posts.map((p) => p.id));
  // Keep earlier picks that aren't in this week's list; apply ticks for the ones that are.
  const show = [
    ...picks.show.filter((id) => !known.has(id)),
    ...posts.filter((p) => p.on).map((p) => p.id),
  ];
  const stats = { ...picks.stats };
  for (const s of ticked("stat")) if (s.id in STATS) stats[s.id] = s.on;

  await writeFile("data/picks.json", JSON.stringify({ show, stats }, null, 2) + "\n");
  console.log("picks:", show.length, "posts;", Object.entries(stats).filter(([, v]) => v).map(([k]) => k).join(", ") || "no stats");
}

const mode = process.argv[2];
if (mode === "body") console.log(body());
else if (mode === "apply") await apply();
else { console.error("usage: picks.mjs body|apply"); process.exit(1); }
