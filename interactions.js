// Progressive-enhancement interactions. All motion respects prefers-reduced-motion,
// and the page degrades to fully-visible if JS is off (CSS hides .reveal only under
// the .js flag we set below). Nothing here is required to read or use the site.
(function () {
  const root = document.documentElement;
  root.classList.add("js"); // tells CSS it's safe to start elements hidden for reveal

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. Nav gains a shadow once you scroll past the top.
  const nav = document.querySelector(".nav");
  const onScroll = () => { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (reduce) return; // everything below is motion — leave the page static & visible

  // 2. Scroll reveal: sections fade/slide in; grids stagger their children.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      if (el.classList.contains("reveal-stagger")) {
        Array.from(el.children).forEach((c, i) => { c.style.transitionDelay = (i * 60) + "ms"; });
      }
      el.classList.add("in");
      io.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => io.observe(el));

  // 3. Count-up for stat numbers when they scroll into view.
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

  // 4. Gentle pointer parallax on the hero photo cluster (moves as a group — safe
  //    with the existing fan layout). Subtle: ~14px of travel.
  const hero = document.querySelector(".hero");
  const fanWrap = document.querySelector(".hero-fan");
  if (hero && fanWrap && window.matchMedia("(pointer:fine)").matches) {
    hero.addEventListener("pointermove", (ev) => {
      const r = hero.getBoundingClientRect();
      const dx = (ev.clientX - r.left) / r.width - 0.5;
      const dy = (ev.clientY - r.top) / r.height - 0.5;
      fanWrap.style.transform = `translate(${(dx * 14).toFixed(1)}px, ${(dy * 14).toFixed(1)}px)`;
    });
    hero.addEventListener("pointerleave", () => { fanWrap.style.transform = ""; });
  }
})();
