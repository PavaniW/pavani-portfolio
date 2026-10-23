# Pavani's portfolio

A plain HTML/CSS site, with no build step. Open `index.html` or run:

    python3 -m http.server 8765

## Before publishing

- Confirm the brand tags on the first four posts in "My work" (they are guesses).
- Add TikTok followers and best views (search `TODO` in index.html).
- Swap the Instagram thumbnails in `assets/work/` for full-resolution photos (same file names).

## Publish (free)

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com, pick "Add New Project", and import the repo. No settings needed.
3. Optional: buy a domain (e.g. pavani.lk or pavaniw.com) and add it under Project > Domains.

## Analytics (Google Analytics 4)

GA4 is wired up in `analytics.js`. To turn it on:

1. Go to https://analytics.google.com → **Admin**.
2. **Create a Property** (Account → Property → *+ Create*): name it "Pavani Portfolio",
   timezone Sri Lanka, currency LKR.
3. In that property: **Data streams → Add stream → Web**, enter your site URL, create it.
4. Copy the **Measurement ID** (looks like `G-ABCD1234XY`).
5. Paste it into `analytics.js` as `MEASUREMENT_ID`. Done.

Until a real ID is set, analytics stays off (no errors).

**How it works:** GA4 stores everything in *your* property in Google's cloud — nothing is saved
in this repo. You read it at analytics.google.com. Every important link has a `data-track` name
(e.g. `hero-email`, `brand-cliara`); `script.js` sends each as a custom `click` event, so you can
see which brand links get the most taps.

**Privacy (built in):** respects the browser's Do Not Track; IP anonymisation on; and you can
exclude your own visits — open the site once per device with `?mine` (e.g. `https://yoursite.com/?mine`)
and that browser stops counting.
