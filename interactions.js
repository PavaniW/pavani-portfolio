// Small, robust progressive enhancements. No content is ever hidden by these —
// everything on the page is visible without JS; this only adds polish.
(function () {
  document.documentElement.classList.add("js");

  // Nav gains a subtle shadow once you scroll past the top.
  const nav = document.querySelector(".nav");
  const onScroll = () => { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Count-up for stat numbers when they scroll into view (value stays correct if JS is off).
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = parseFloat(el.dataset.to || "0");
      const suffix = el.dataset.suffix || "";
      const decimals = (el.dataset.to || "").includes(".") ? 1 : 0;
      const dur = 1100, start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = to.toFixed(decimals) + suffix;
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll(".count").forEach((el) => cio.observe(el));
})();
