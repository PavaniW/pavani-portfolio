// Google Analytics 4 (GA4) — privacy-friendly loader.
//
// What this does, end to end:
//   1. Loads Google's gtag.js and starts a GA4 session for this visitor.
//   2. Every link with a data-track name (see script.js) is sent to GA4 as a
//      custom "click" event — so you can see which brand links get the most taps.
//   3. GA4 stores it all in YOUR property in Google's cloud; you read it at
//      analytics.google.com. Nothing is saved on the site or in this repo.
//
// Privacy choices baked in:
//   - Respects the browser's "Do Not Track" setting.
//   - Lets you exclude your OWN visits: open the site once per device with
//     ?mine  (e.g. https://yoursite.com/?mine) and this browser stops counting.
//   - IP anonymisation is on by default in GA4.
//
// SETUP: replace the placeholder below with your Measurement ID from
//   analytics.google.com -> Admin -> Data streams -> (your web stream) -> Measurement ID
// It looks like  G-ABCD1234XY.  Until you do, analytics stays off (no errors).

const MEASUREMENT_ID = "G-XXXXXXXXXX"; // <-- paste your real G-XXXXXXXXXX here

(function initAnalytics() {
  // 1. Own-visit opt-out: visiting with ?mine flips this browser off for good.
  try {
    if (new URLSearchParams(location.search).has("mine")) {
      localStorage.setItem("ga_optout", "1");
    }
  } catch (_) {}

  // 2. Reasons to stay off: ID not set, you opted out, or Do Not Track is on.
  const optedOut = (() => {
    try { return localStorage.getItem("ga_optout") === "1"; } catch (_) { return false; }
  })();
  const doNotTrack = navigator.doNotTrack === "1" || window.doNotTrack === "1";

  if (MEASUREMENT_ID === "G-XXXXXXXXXX" || optedOut || doNotTrack) {
    // Leave a hint in the console so you know why nothing is being sent.
    console.info("[analytics] off:",
      MEASUREMENT_ID === "G-XXXXXXXXXX" ? "no Measurement ID set"
      : optedOut ? "this browser opted out (?mine)"
      : "Do Not Track is on");
    return;
  }

  // 3. Standard GA4 bootstrap — define gtag, then load gtag.js asynchronously.
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
  document.head.appendChild(s);
})();
