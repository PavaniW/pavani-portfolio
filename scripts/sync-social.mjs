// Daily sync: pulls Pavani's latest Instagram + TikTok posts and insights,
// saves thumbnails into assets/feed/ and writes data/social.json for the site.
// Runs in GitHub Actions (see .github/workflows/sync-social.yml). Node 20+.
//
// Secrets (GitHub repo > Settings > Secrets and variables > Actions):
//   IG_TOKEN            Instagram API (Instagram Login) long-lived user token
//   TT_CLIENT_KEY       TikTok app client key
//   TT_CLIENT_SECRET    TikTok app client secret
//   TT_REFRESH_TOKEN    TikTok refresh token for @pavaniii.w
// Any platform without secrets is skipped and its previous data is kept.
//
// Rotated tokens are written to .tokens.out (never committed) so the workflow
// can save them back into the repo secrets.

import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

const DATA_FILE = "data/social.json";
const FEED_DIR = "assets/feed";
const LATEST_COUNT = 12; // candidates offered for review each week
const PICKS_FILE = "data/picks.json";
const IG_API = "https://graph.instagram.com/v21.0";

const rotated = {};
const keep = new Set(); // files in assets/feed still in use this run
const log = (...a) => console.log("[sync]", ...a);

async function getJSON(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error?.code && body.error.code !== "ok") {
    throw new Error(`${res.status} ${JSON.stringify(body.error || body).slice(0, 300)}`);
  }
  return body;
}

// Files are keyed by post id, so each one is only downloaded once.
async function saveImage(url, name) {
  const file = `${FEED_DIR}/${name}.jpg`;
  keep.add(file);
  if (existsSync(file)) return file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// A short, silent, small loop of a reel for the moving tiles on the site.
async function savePreview(url, name) {
  const file = `${FEED_DIR}/${name}.mp4`;
  keep.add(file);
  if (existsSync(file)) return file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video ${res.status}`);
  const src = join(tmpdir(), `${name}-src.mp4`);
  await writeFile(src, Buffer.from(await res.arrayBuffer()));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-t", "6", "-i", src,
    "-vf", "scale=480:-2,fps=24", "-an", "-c:v", "libx264", "-preset", "veryfast",
    "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
  await unlink(src).catch(() => {});
  return file;
}

// Reels hand-picked in the "My work" section of index.html, by shortcode.
async function workShortcodes() {
  const html = await readFile("index.html", "utf8");
  return [...html.matchAll(/instagram\.com\/pavaniii\.w\/(?:reel|p)\/([\w-]+)/g)].map((m) => m[1]);
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/* ---------------- Instagram ---------------- */

async function instagram() {
  let token = process.env.IG_TOKEN;
  if (!token) return null;

  // Long-lived tokens last 60 days; refreshing daily keeps them alive forever.
  try {
    const r = await getJSON(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    if (r.access_token && r.access_token !== token) { token = r.access_token; rotated.IG_TOKEN = token; }
  } catch (e) { log("IG token refresh skipped:", e.message); }

  const q = (path, params = {}) =>
    getJSON(`${IG_API}/${path}?${new URLSearchParams({ ...params, access_token: token })}`);

  const me = await q("me", { fields: "user_id,username,followers_count,media_count" });
  const media = await q("me/media", {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: "50",
  });

  // Per-post insights (reach, views, saves, shares). Some metrics don't exist for
  // every post type, so each lookup is allowed to fail on its own.
  const posts = [];
  for (const m of media.data || []) {
    const stats = { likes: m.like_count ?? 0, comments: m.comments_count ?? 0 };
    try {
      const ins = await q(`${m.id}/insights`, { metric: "reach,views,saved,shares" });
      for (const row of ins.data || []) stats[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? 0;
    } catch (e) { log("IG post insights unavailable for", m.id, e.message.slice(0, 80)); }
    posts.push({ ...m, stats });
  }

  // Account-level: reach over the last 28 days + follower demographics.
  const insights = {};
  try {
    const until = Math.floor(Date.now() / 1000);
    const since = until - 28 * 86400;
    const r = await q("me/insights", { metric: "reach,accounts_engaged", period: "day", metric_type: "total_value", since: String(since), until: String(until) });
    for (const row of r.data || []) insights[row.name + "_28d"] = row.total_value?.value ?? 0;
  } catch (e) { log("IG account insights skipped:", e.message.slice(0, 120)); }

  const audience = {};
  for (const breakdown of ["city", "country", "age", "gender"]) {
    try {
      const r = await q("me/insights", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown });
      const rows = r.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
      audience[breakdown] = rows
        .map((x) => ({ label: x.dimension_values?.[0], value: x.value }))
        .sort((a, b) => b.value - a.value);
    } catch (e) { log(`IG demographics (${breakdown}) skipped:`, e.message.slice(0, 120)); }
  }

  // Moving previews for the reels shown in "My work" (matched by shortcode)
  const wanted = new Set(await workShortcodes());
  const previews = {};
  for (const m of posts) {
    const code = m.permalink?.match(/\/(?:reel|p)\/([\w-]+)/)?.[1];
    if (!code || !wanted.has(code) || m.media_type !== "VIDEO" || !m.media_url) continue;
    try { previews[code] = await savePreview(m.media_url, `ig-${m.id}`); }
    catch (e) { log("IG preview failed", code, e.message.slice(0, 120)); }
  }

  // Latest posts with saved thumbnails (+ a moving preview for videos)
  const latest = [];
  for (const m of posts.slice(0, LATEST_COUNT)) {
    const src = m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
    if (!src) continue;
    try {
      const image = await saveImage(src, `ig-${m.id}`);
      latest.push({
        id: `ig-${m.id}`,
        platform: "instagram", url: m.permalink, image, date: m.timestamp,
        caption: (m.caption || "").split("\n")[0].slice(0, 90),
        isReel: m.media_product_type === "REELS", stats: m.stats,
        video: m.media_type === "VIDEO" && m.media_url
          ? await savePreview(m.media_url, `ig-${m.id}`).catch((e) => (log("IG preview failed", m.id, e.message.slice(0, 80)), undefined))
          : undefined,
      });
    } catch (e) { log("IG thumbnail failed", m.id, e.message); }
  }

  // Averages over the recent posts (what brands ask for)
  const recent = posts.slice(0, 12);
  const reels = recent.filter((m) => m.media_product_type === "REELS" && m.stats.views);
  const followers = me.followers_count || 0;
  const engagementRate = followers
    ? avg(recent.map((m) => (m.stats.likes + m.stats.comments + (m.stats.saved || 0) + (m.stats.shares || 0)) / followers)) * 100
    : 0;

  return {
    username: me.username,
    followers,
    posts: me.media_count,
    avgReelViews: Math.round(avg(reels.map((m) => m.stats.views))),
    engagementRate: round(engagementRate, 1),
    ...insights,
    audience,
    previews,
    latest,
  };
}

/* ---------------- TikTok ---------------- */

async function tiktok() {
  const { TT_CLIENT_KEY, TT_CLIENT_SECRET, TT_REFRESH_TOKEN } = process.env;
  if (!TT_CLIENT_KEY || !TT_CLIENT_SECRET || !TT_REFRESH_TOKEN) return null;

  // Access tokens last 24h, so every run starts by refreshing.
  const tok = await getJSON("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: TT_CLIENT_KEY, client_secret: TT_CLIENT_SECRET,
      grant_type: "refresh_token", refresh_token: TT_REFRESH_TOKEN,
    }),
  });
  if (tok.refresh_token && tok.refresh_token !== TT_REFRESH_TOKEN) rotated.TT_REFRESH_TOKEN = tok.refresh_token;
  const auth = { Authorization: `Bearer ${tok.access_token}` };

  const user = await getJSON(
    "https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,follower_count,likes_count,video_count",
    { headers: auth });
  const videos = await getJSON(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,view_count,like_count,comment_count,share_count",
    { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 12 }) });

  const list = videos.data?.videos || [];
  const latest = [];
  for (const v of list.slice(0, LATEST_COUNT)) {
    try {
      const image = await saveImage(v.cover_image_url, `tt-${v.id}`);
      latest.push({
        id: `tt-${v.id}`,
        platform: "tiktok", url: v.share_url, image, date: new Date(v.create_time * 1000).toISOString(),
        caption: (v.title || v.video_description || "").slice(0, 90),
        stats: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count },
      });
    } catch (e) { log("TT cover failed", v.id, e.message); }
  }

  const u = user.data?.user || {};
  return {
    username: u.username,
    followers: u.follower_count,
    likes: u.likes_count,
    videos: u.video_count,
    avgViews: Math.round(avg(list.map((v) => v.view_count || 0))),
    latest,
  };
}

/* ---------------- Main ---------------- */

const previous = existsSync(DATA_FILE) ? JSON.parse(await readFile(DATA_FILE, "utf8")) : {};
await mkdir(FEED_DIR, { recursive: true });
await mkdir("data", { recursive: true });

const out = { updated: new Date().toISOString() };
for (const [key, fn] of [["instagram", instagram], ["tiktok", tiktok]]) {
  try {
    const result = await fn();
    if (result) { out[key] = result; log(key, "ok:", result.followers, "followers,", result.latest.length, "latest"); }
    else { log(key, "not connected, skipped"); }
  } catch (e) {
    log(key, "FAILED:", e.message);
  }
}

// A platform that failed this run keeps yesterday's data and files.
for (const key of ["instagram", "tiktok"]) {
  if (!out[key] && previous[key]) {
    out[key] = previous[key];
    for (const item of previous[key].latest || []) { keep.add(item.image); if (item.video) keep.add(item.video); }
    for (const f of Object.values(previous[key].previews || {})) keep.add(f);
  }
}

// Posts Pavani already picked stay available even once they drop out of the
// newest 12, so the site never loses something she chose to show.
const picks = existsSync(PICKS_FILE) ? JSON.parse(await readFile(PICKS_FILE, "utf8")) : { show: [] };
for (const key of ["instagram", "tiktok"]) {
  if (!out[key] || !previous[key]) continue;
  const have = new Set(out[key].latest.map((x) => x.id));
  for (const item of previous[key].latest || []) {
    if (picks.show?.includes(item.id) && !have.has(item.id)) {
      out[key].latest.push(item);
      keep.add(item.image); if (item.video) keep.add(item.video);
    }
  }
}

// Remove images and clips that are no longer shown anywhere
for (const f of await readdir(FEED_DIR)) {
  const path = `${FEED_DIR}/${f}`;
  if (!keep.has(path)) await unlink(path);
}

if (!out.instagram && !out.tiktok) {
  log("nothing connected yet, leaving data untouched");
  process.exit(0);
}

await writeFile(DATA_FILE, JSON.stringify(out, null, 2) + "\n");
if (Object.keys(rotated).length) await writeFile(".tokens.out", JSON.stringify(rotated));
log("wrote", DATA_FILE);
