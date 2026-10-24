// Shows what the weekly Instagram + TikTok sync brought in, but only what Pavani
// ticked (data/picks.json). If nothing is synced or picked, the page stays as is.
//
//  1. "My work" reels get a silent looping preview when one exists.
//  2. Picked posts appear in a "Fresh from my feed" row.
//  3. Ticked stats replace the About numbers and add an audience line.

(async function loadFeed() {
  let social, picks;
  try {
    const [s, p] = await Promise.all([
      fetch("data/social.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)),
      fetch("data/picks.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)),
    ]);
    social = s; picks = p;
  } catch { return; }
  if (!social || !picks) return;

  const ig = social.instagram || {};
  const tt = social.tiktok || {};
  const stillOnly =
    matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData;

  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
  // Only ever link out to https Instagram/TikTok pages
  const safeUrl = (u) => (/^https:\/\/(www\.)?(instagram|tiktok)\.com\//.test(String(u)) ? u : "#");
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Silent loops play only while on screen, to save data and battery
  const playWhenVisible = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
  }, { threshold: 0.25 });

  function videoFor(img, src) {
    const v = document.createElement("video");
    v.src = src;
    v.poster = img.currentSrc || img.src;
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    v.preload = "none";
    v.className = img.className;
    v.setAttribute("aria-label", img.alt);
    // If the clip can't load, quietly put the photo back
    v.addEventListener("error", () => { playWhenVisible.unobserve(v); v.replaceWith(img); }, { once: true });
    img.replaceWith(v);
    playWhenVisible.observe(v);
  }

  // 1. Moving previews on the hand-picked "My work" tiles
  if (!stillOnly && ig.previews) {
    document.querySelectorAll(".reels .reel").forEach((a) => {
      // Instagram: /reel/<code> or /p/<code>; TikTok: /video/<id> -> "tt-<id>"
      const ttId = a.dataset.loop || a.href.match(/tiktok\.com\/.*\/video\/(\d+)/)?.[1];
      const code = a.dataset.loop || (ttId ? `tt-${ttId}` : a.href.match(/\/(?:reel|p)\/([\w-]+)/)?.[1]);
      const img = a.querySelector("img");
      if (code && img && ig.previews[code]) videoFor(img, ig.previews[code]);
    });
  }

  // 2. "Fresh from my feed": only the posts Pavani ticked, newest first
  const all = [...(ig.latest || []), ...(tt.latest || [])];
  const chosen = all
    .filter((x) => picks.show?.includes(x.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (chosen.length) {
    const section = document.createElement("section");
    section.className = "fresh";
    section.setAttribute("aria-labelledby", "fresh-title");
    section.innerHTML = `
      <div class="section-head">
        <h2 id="fresh-title">Fresh from my feed</h2>
        <p>My latest on Instagram and TikTok.</p>
      </div>
      <ul class="reels">${chosen.map((x) => `
        <li><a class="reel" href="${esc(safeUrl(x.url))}" data-track="fresh-${esc(x.platform)}">
          <img src="${esc(x.image)}" alt="${esc(x.caption || "Latest post")}" loading="lazy">
          <span class="reel-brand">${x.platform === "tiktok" ? "TikTok" : "Instagram"}</span>
          ${x.stats?.views ? `<span class="reel-what">${fmt(x.stats.views)} views</span>` : ""}
        </a></li>`).join("")}
      </ul>`;
    // Centre the row however many posts were picked
    section.style.setProperty("--n", Math.min(chosen.length, 4));
    section.style.setProperty("--n-phone", Math.min(chosen.length, 2));
    document.getElementById("work")?.after(section);
    if (!stillOnly) {
      section.querySelectorAll(".reel img").forEach((img, k) => {
        if (chosen[k].video) videoFor(img, chosen[k].video);
      });
    }
    section.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  }

  // 3. Stats Pavani chose to show
  const s = picks.stats || {};
  const dl = document.querySelector(".stats");
  if (dl && (s.followers || s.avgViews || s.engagement)) {
    const items = [];
    if (s.followers && ig.followers) items.push([fmt(ig.followers), "Instagram followers"]);
    if (s.followers && tt.followers) items.push([fmt(tt.followers), "TikTok followers"]);
    if (s.avgViews && ig.avgReelViews) items.push([fmt(ig.avgReelViews), "Avg. reel views"]);
    if (s.avgViews && tt.avgViews) items.push([fmt(tt.avgViews), "Avg. TikTok views"]);
    if (s.engagement && ig.engagementRate) items.push([ig.engagementRate + "%", "Engagement rate"]);
    if (items.length) {
      dl.innerHTML = items.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("");
    }
  }
  if (dl && s.audience && ig.audience) {
    const top = (arr, n) => (arr || []).slice(0, n);
    const total = (arr) => (arr || []).reduce((a, b) => a + b.value, 0);
    const pct = (part, arr) => Math.round((part / (total(arr) || 1)) * 100);
    const women = (ig.audience.gender || []).find((g) => g.label === "F");
    const age = top(ig.audience.age, 1)[0];
    const cities = top(ig.audience.city, 3).map((c) => c.label.split(",")[0]);
    const bits = [];
    if (cities.length) bits.push(`Top cities: ${cities.join(", ")}`);
    if (age) bits.push(`Mostly ${age.label}`);
    if (women) bits.push(`${pct(women.value, ig.audience.gender)}% women`);
    if (bits.length) {
      const p = document.createElement("p");
      p.className = "audience";
      p.textContent = bits.join(" · ");
      dl.after(p);
    }
  }
})();
