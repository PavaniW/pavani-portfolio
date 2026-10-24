// Reads @pavaniii.w's PUBLIC Instagram profile in a hidden Chrome window (no
// developer account, no login) and writes the same data/social.json the site
// already understands:
//   - follower count
//   - latest posts with thumbnails, captions, likes
//   - a 6-second silent loop for each reel (moving tiles on the site)
//
// Run from the repo root:  node scripts/scrape-instagram.mjs
// Needs Google Chrome and ffmpeg installed on this Mac.
//
// Only public information is read, the same as anyone visiting the profile.
// Private insights (reach, audience) are not available this way.

import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HANDLE = "pavaniii.w";
const DATA_FILE = "data/social.json";
const PICKS_FILE = "data/picks.json";
const FEED_DIR = "assets/feed";
const LATEST_COUNT = 12;
const run = promisify(execFile);
const log = (...a) => console.log("[instagram]", ...a);
const keep = new Set();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// "4,749 Followers, 2,369 Following, 140 Posts - ..."
function parseCounts(text) {
  const num = (label) => {
    const m = text.match(new RegExp(`([\\d.,]+)\\s*([KkMm]?)\\s+${label}`));
    if (!m) return undefined;
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (/k/i.test(m[2])) n *= 1e3;
    if (/m/i.test(m[2])) n *= 1e6;
    return Math.round(n);
  };
  return { followers: num("Followers"), posts: num("Posts") };
}

// "102 likes, 10 comments - pavaniii.w on October 4, 2026: "caption..."
function parsePost(text) {
  const n = (label) => {
    const m = text.match(new RegExp(`([\\d.,]+)\\s*([KkMm]?)\\s+${label}`));
    if (!m) return 0;
    let v = parseFloat(m[1].replace(/,/g, ""));
    if (/k/i.test(m[2])) v *= 1e3;
    if (/m/i.test(m[2])) v *= 1e6;
    return Math.round(v);
  };
  const caption = (text.match(/:\s*"([\s\S]*)"?\s*$/)?.[1] || "").split("\n")[0].replace(/"$/, "").trim();
  return { likes: n("likes?"), comments: n("comments?"), caption };
}

async function download(url, file) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// Instagram streams reels in pieces. The tag inside `efg` names each stream
// (e.g. "..._1080p" for video, "..._audio" for sound). Pick the sharpest video track,
// drop the byte-range params to get the whole file, and cut a short loop.
function pickVideoStream(urls) {
  // The post's own video loads first; later ones can be suggested reels.
  // Lock onto the asset id of the first stream, then pick its sharpest version.
  let asset;
  const streams = new Map();
  for (const u of urls) {
    const url = new URL(u);
    let tag = "", id;
    try {
      const efg = JSON.parse(Buffer.from(url.searchParams.get("efg") || "", "base64").toString());
      tag = efg.vencode_tag || ""; id = efg.xpv_asset_id;
    } catch {}
    if (!tag) continue;
    asset ??= id;
    if (id !== asset || /audio/i.test(tag)) continue;
    url.searchParams.delete("bytestart");
    url.searchParams.delete("byteend");
    const height = Number(tag.match(/(\d{3,4})p/)?.[1] || 0);
    streams.set(url.pathname, { url: url.toString(), height });
  }
  const list = [...streams.values()].sort((a, b) => b.height - a.height);
  return list[0]?.url;
}

// Open a reel and collect its video requests (retry once if it loads slowly)
async function reelStreams(page, url) {
  for (const delay of [5000, 9000]) {
    const mp4s = [];
    const onResponse = (r) => { if (/\.mp4/.test(r.url())) mp4s.push(r.url()); };
    page.on("response", onResponse);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await wait(delay);
    page.off("response", onResponse);
    if (pickVideoStream(mp4s)) return mp4s;
  }
  return [];
}

async function makeLoop(srcUrl, name) {
  const file = `${FEED_DIR}/${name}.mp4`;
  keep.add(file);
  if (existsSync(file)) return file;
  const src = join(tmpdir(), `${name}-src.mp4`);
  await download(srcUrl, src);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-t", "6", "-i", src,
    "-vf", "scale=720:-2:flags=lanczos,fps=30", "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
  await unlink(src).catch(() => {});
  return file;
}

async function workShortcodes() {
  const html = await readFile("index.html", "utf8");
  // Only reels have video; /p/ links are photos
  return [...html.matchAll(/instagram\.com\/pavaniii\.w\/reel\/([\w-]+)/g)].map((m) => m[1]);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  locale: "en-US",
});
const page = await context.newPage();

try {
  await mkdir(FEED_DIR, { recursive: true });
  await mkdir("data", { recursive: true });

  // 1. Profile: counts + latest posts
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 20000 });
  await wait(1500);
  const profile = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || "",
    posts: [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].map((a) => {
      const img = a.querySelector("img");
      return { href: a.href.split("?")[0], thumb: img?.currentSrc || img?.src, alt: img?.alt || "" };
    }),
  }));
  const counts = parseCounts(profile.description);
  log("followers:", counts.followers, "posts on profile:", profile.posts.length);

  // 2. Each post: caption, likes, and for reels the video track
  const wanted = new Set(await workShortcodes());
  const seen = new Set();
  const latest = [];
  const previews = {};
  for (const p of profile.posts) {
    const code = p.href.match(/\/(?:reel|p)\/([\w-]+)/)?.[1];
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const isReel = /\/reel\//.test(p.href) || /^Video/.test(p.alt);
    const date = p.alt.match(/on (\w+ \d{1,2}, \d{4})/)?.[1];

    let mp4s = [];
    if (isReel) mp4s = await reelStreams(page, p.href);
    else { await page.goto(p.href, { waitUntil: "domcontentloaded" }); await wait(1500); }
    const desc = await page.evaluate(() => document.querySelector('meta[name="description"]')?.content || "");
    const info = parsePost(desc);

    const image = `${FEED_DIR}/ig-${code}.jpg`;
    keep.add(image);
    if (!existsSync(image) && p.thumb) await download(p.thumb, image).catch((e) => log("thumb failed", code, e.message));

    let video;
    if (isReel) {
      const stream = pickVideoStream(mp4s);
      if (stream) {
        try { video = await makeLoop(stream, `ig-${code}`); }
        catch (e) { log("loop failed", code, e.message); }
      } else log("no video stream found for", code);
    }
    if (video && wanted.has(code)) previews[code] = video;

    latest.push({
      id: `ig-${code}`, platform: "instagram", url: p.href, image,
      date: date ? new Date(date + " UTC").toISOString() : undefined,
      caption: info.caption.slice(0, 90), isReel,
      stats: { likes: info.likes, comments: info.comments },
      video,
    });
    log(code, isReel ? "reel" : "post", `${info.likes} likes`, video ? "+ loop" : "");
    if (latest.length >= LATEST_COUNT) break;
  }

  // 3. "Work" reels that are older than the profile's first page
  for (const code of wanted) {
    if (previews[code]) continue;
    const existing = (await readdir(FEED_DIR)).find((f) => f === `ig-${code}.mp4`);
    if (existing) { previews[code] = `${FEED_DIR}/${existing}`; keep.add(previews[code]); continue; }
    const mp4s = await reelStreams(page, `https://www.instagram.com/${HANDLE}/reel/${code}/`);
    const stream = pickVideoStream(mp4s);
    if (!stream) { log("work reel has no video (photo post?)", code); continue; }
    try { previews[code] = await makeLoop(stream, `ig-${code}`); log("work reel loop", code); }
    catch (e) { log("work loop failed", code, e.message); }
  }

  // 4. Merge into data/social.json, keeping anything else already there (e.g. TikTok)
  const previous = existsSync(DATA_FILE) ? JSON.parse(await readFile(DATA_FILE, "utf8")) : {};
  const picks = existsSync(PICKS_FILE) ? JSON.parse(await readFile(PICKS_FILE, "utf8")) : { show: [] };
  for (const item of previous.instagram?.latest || []) {
    if (picks.show?.includes(item.id) && !latest.some((x) => x.id === item.id)) {
      latest.push(item); keep.add(item.image); if (item.video) keep.add(item.video);
    }
  }
  for (const item of previous.tiktok?.latest || []) { keep.add(item.image); if (item.video) keep.add(item.video); }

  const out = {
    ...previous,
    updated: new Date().toISOString(),
    instagram: { username: HANDLE, followers: counts.followers, posts: counts.posts, previews, latest, source: "public profile" },
  };
  await writeFile(DATA_FILE, JSON.stringify(out, null, 2) + "\n");

  for (const f of await readdir(FEED_DIR)) {
    const path = `${FEED_DIR}/${f}`;
    if (!keep.has(path)) await unlink(path);
  }
  log("wrote", DATA_FILE, `(${latest.length} posts, ${Object.keys(previews).length} Work loops)`);
} finally {
  await browser.close();
}
