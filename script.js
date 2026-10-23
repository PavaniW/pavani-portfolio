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

// Click tracking: sends a custom event for any link with data-track,
// if an analytics tool that supports custom events is installed.
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-track]");
  if (!link) return;
  const name = link.dataset.track;
  if (typeof window.gtag === "function") window.gtag("event", "click", { label: name });
  if (typeof window.plausible === "function") window.plausible(name);
});

// Open outside links in a new tab
document.querySelectorAll('a[href^="http"]').forEach((a) => {
  a.target = "_blank";
  a.rel = "noopener noreferrer";
});
