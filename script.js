// Refreshing the page always starts at the top (browsers otherwise jump back
// to where you were, or to a #section left in the address bar).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const navEntry = performance.getEntriesByType("navigation")[0];
if (navEntry && navEntry.type === "reload") {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  window.scrollTo(0, 0);
}

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

// Enquiry form: sends straight to Web3Forms, which emails Pavani.
const WEB3FORMS_KEY = "be06cfe0-b123-4e3b-932f-b97008893720";

// After sending: swap the fields for a thank-you card and bring it into view
function showSent() {
  const form = document.querySelector(".enquiry");
  const done = form.querySelector(".enquiry-done");
  form.classList.add("is-sent");
  done.hidden = false;
  document.querySelector(".enquiry-status").textContent = "";
  done.scrollIntoView({ behavior: "smooth", block: "center" });
  done.querySelector(".enquiry-again").focus({ preventScroll: true });
}
document.querySelector(".enquiry-again")?.addEventListener("click", () => {
  const form = document.querySelector(".enquiry");
  form.classList.remove("is-sent");
  form.querySelector(".enquiry-done").hidden = true;
  form.querySelector("input[name='name']").focus();
});
const enquiry = document.querySelector(".enquiry");
const enquiryStatus = enquiry?.querySelector(".enquiry-status");

enquiry?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = enquiry.querySelector(".enquiry-submit");

  // Mark empty required fields and invalid emails
  let firstInvalid = null;
  enquiry.querySelectorAll("[required]").forEach((field) => {
    const bad = !field.value.trim() || (field.type === "email" && !field.checkValidity());
    field.setAttribute("aria-invalid", bad ? "true" : "false");
    if (bad && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) {
    enquiryStatus.textContent = "Please fill in the highlighted fields.";
    enquiryStatus.classList.add("is-error");
    firstInvalid.focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = "Sending…";
  enquiryStatus.textContent = "";
  enquiryStatus.classList.remove("is-error");

  const fields = Object.fromEntries(new FormData(enquiry));

  // Spam trap: real visitors never fill the hidden "website" field
  if (fields.website) {
    enquiry.reset();
    showSent();
    submit.disabled = false;
    submit.textContent = "Send enquiry";
    return;
  }

  try {
    // Web3Forms emails each enquiry to Pavani. The access key is meant to be
    // public: it can only deliver messages to her inbox.
    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `New enquiry: ${fields.brand} (${fields.type})`,
        from_name: "Portfolio enquiry",
        replyto: fields.email,
        name: fields.name,
        email: fields.email,
        brand: fields.brand,
        looking_for: fields.type,
        timeline: fields.timeline || "Not sure yet",
        message: fields.message,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) throw new Error(result.message || String(response.status));
    enquiry.reset();
    showSent();
    if (typeof window.gtag === "function") window.gtag("event", "enquiry_sent");
  } catch {
    enquiryStatus.textContent = "Couldn't send right now. Please DM me on Instagram @pavaniii.w instead.";
    enquiryStatus.classList.add("is-error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Send enquiry";
  }
});

enquiry?.addEventListener("input", (event) => {
  if (event.target.getAttribute("aria-invalid") === "true" && event.target.value.trim()) {
    event.target.setAttribute("aria-invalid", "false");
  }
});

// Keep the footer year current
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

// Highlight the top-bar link for the section currently on screen
const navLinks = [...document.querySelectorAll('.nav nav a[href^="#"]')];
const spySections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

function updateActiveNav() {
  // offsetTop ignores the reveal animation's slide, so positions stay accurate
  // A section counts as "current" once its top reaches just under the top bar
  const line = window.scrollY + 140;
  let current = null;
  for (const section of spySections) {
    if (section.offsetTop <= line) current = section;
  }
  // At the very bottom, the last section counts even if it's short
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    current = spySections[spySections.length - 1];
  }
  navLinks.forEach((link) => {
    const active = current && link.getAttribute("href") === "#" + current.id;
    link.classList.toggle("is-active", Boolean(active));
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("scroll", updateActiveNav, { passive: true });
window.addEventListener("resize", updateActiveNav);
window.addEventListener("load", updateActiveNav);
document.fonts?.ready.then(updateActiveNav);
updateActiveNav();

// "Ask for my rate card": fill in the enquiry form instead of opening email
document.querySelectorAll("[data-ratecard]").forEach((el) => {
  el.addEventListener("click", (event) => {
    event.preventDefault();
    const form = document.querySelector(".enquiry");
    if (!form) return;
    if (form.classList.contains("is-sent")) document.querySelector(".enquiry-again")?.click();
    const message = form.querySelector("textarea[name='message']");
    if (!message.value.trim()) message.value = "Hi Pavani, could you send me your rate card? We're interested in: ";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.querySelector("input[name='name']").focus({ preventScroll: true });
  });
});
