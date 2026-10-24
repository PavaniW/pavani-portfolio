// Progressive-enhancement interactions. The page is fully readable without JS;
// this adds polish and includes a safety net so content is never left hidden.
(function () {
  const root = document.documentElement;
  root.classList.add("js");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Nav gains a subtle shadow once you scroll past the top.
  const nav = document.querySelector(".nav");
  const onScroll = () => { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Content-reveal on scroll. Sections fade/slide in as they enter view; grids stagger.
  const revealEls = document.querySelectorAll(".reveal, .reveal-stagger");
  const show = (el) => {
    if (el.classList.contains("reveal-stagger")) {
      Array.from(el.children).forEach((c, i) => { c.style.transitionDelay = (i * 60) + "ms"; });
    }
    el.classList.add("in");
  };

  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(show); // no motion wanted/possible → just show everything
  } else {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        show(e.target);
        obs.unobserve(e.target);
      });
    }, { threshold: 0, rootMargin: "0px 0px -12% 0px" });
    revealEls.forEach((el) => io.observe(el));

    // Safety net: anything already on-screen at load reveals right away, and after
    // load we force-reveal anything in view — so a section can never be stuck blank.
    const sweep = () => revealEls.forEach((el) => {
      if (el.classList.contains("in")) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.95) show(el);
    });
    sweep();
    window.addEventListener("load", () => setTimeout(sweep, 50));
  }

  if (reduce) return;

  // Count-up for stat numbers when they scroll into view.
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = parseFloat(el.dataset.to || "0");
      const suffix = el.dataset.suffix || "";
      const prefix = el.dataset.prefix || "";
      const decimals = (el.dataset.to || "").includes(".") ? 1 : 0;
      const dur = 1100, start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + (to * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = prefix + to.toFixed(decimals) + suffix;
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll(".count").forEach((el) => cio.observe(el));
})();
