/* Scroll-in reveal animations. Opt-in via [data-reveal] (single element) or
   [data-reveal-group] (staggers direct children). Respects prefers-reduced-motion
   through the global CSS rule in tafseel.css (transition-duration collapses to ~0). */
(function () {
  function run() {
    var targets = document.querySelectorAll('[data-reveal]:not(.is-in), [data-reveal-group]:not(.is-in)');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  window.addEventListener('load', run);
  document.addEventListener('tafseel:auth', run);
})();
