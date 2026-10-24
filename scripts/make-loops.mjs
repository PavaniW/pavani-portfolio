// Makes sharp, silent 6-second loops from Pavani's original videos.
// Originals live in assets/originals/ (kept off GitHub); the list is scripts/loops.json.
// Output goes to assets/feed/ig-<shortcode>.mp4, which the site already uses.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const list = JSON.parse(await readFile("scripts/loops.json", "utf8"));

for (const [code, { file, start = 0, length = 6, note = "", poster }] of Object.entries(list)) {
  if (code.startsWith("_")) continue;
  const src = `assets/originals/${file}`;
  if (!existsSync(src)) { console.log("missing", src, `(${note})`); continue; }
  // Instagram loops are keyed by shortcode, TikTok ones already start with "tt-"
  const out = code.startsWith("tt-") ? `assets/feed/${code}.mp4` : `assets/feed/ig-${code}.mp4`;
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-t", String(length), "-i", src,
    "-vf", "scale=720:-2:flags=lanczos,fps=30", "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  // Optional still photo for the tile = the loop's first frame, so there's no jump
  if (poster) {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-i", src,
      "-frames:v", "1", "-vf", "scale=720:-2:flags=lanczos", "-q:v", "2", poster]);
  }
  console.log("made", out, poster ? `+ ${poster}` : "", `(${note})`);
}

// Keep data/social.json in sync: list every loop that exists, drop missing ones.
import { readdir, writeFile } from "node:fs/promises";
const socialFile = "data/social.json";
if (existsSync(socialFile)) {
  const social = JSON.parse(await readFile(socialFile, "utf8"));
  const files = new Set((await readdir("assets/feed")).filter((f) => f.endsWith(".mp4")));
  const ig = (social.instagram ??= { latest: [] });
  const previews = {};
  for (const f of files) previews[f.replace(/^ig-|\.mp4$/g, "")] = `assets/feed/${f}`; // tt- keys keep their prefix
  ig.previews = previews;
  for (const item of ig.latest || []) {
    const f = `${item.id}.mp4`;
    if (files.has(f)) item.video = `assets/feed/${f}`; else delete item.video;
  }
  await writeFile(socialFile, JSON.stringify(social, null, 2) + "\n");
  console.log("social.json now lists", files.size, "loops");
}
