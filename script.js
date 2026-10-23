// Copy email button
const copyButton = document.querySelector("[data-copy]");
const copyStatus = document.querySelector(".copy-status");

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyButton.dataset.copy);
    copyButton.textContent = "Copied";
    copyStatus.textContent = "Email copied to your clipboard.";
  } catch {
    copyStatus.textContent = "Couldn't copy. Select the email above and copy it.";
  }
  setTimeout(() => {
    copyButton.textContent = "Copy email";
    copyStatus.textContent = "";
  }, 2500);
});

// Click tracking: for any link with data-track, send a DISTINCT, readable GA4 event
// per link (e.g. data-track="brand-cliara" -> event "link_brand_cliara"). Using a
// unique event name (not a shared "click" with a hidden param) means each link shows
// up separately in GA4's "Event count by Event name" — and avoids colliding with
// GA4 Enhanced Measurement's own auto "click" event. We also pass link_name as a
// parameter so the raw value is available in DebugView / BigQuery exports.
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-track]");
  if (!link) return;
  const name = link.dataset.track;                 // e.g. "brand-cliara"
  const eventName = "link_" + name.replace(/-/g, "_"); // -> "link_brand_cliara"
  if (typeof window.gtag === "function") window.gtag("event", eventName, { link_name: name });
  if (typeof window.plausible === "function") window.plausible(name);
});

// FAQ intent tracking: when a brand expands a question, send faq_open with the
// question text. Which questions they open is a strong signal — someone who opens
// "How much do you charge?" is a warmer lead than someone reading "What do you make?".
document.querySelectorAll(".faq-list details").forEach((d) => {
  d.addEventListener("toggle", () => {
    if (!d.open) return;                       // only count opens, not closes
    const q = (d.querySelector("summary")?.textContent || "").trim();
    if (typeof window.gtag === "function") window.gtag("event", "faq_open", { question: q });
    if (typeof window.plausible === "function") window.plausible("faq_open");
  });
});

// Open outside links in a new tab
document.querySelectorAll('a[href^="http"]').forEach((a) => {
  a.target = "_blank";
  a.rel = "noopener noreferrer";
});
