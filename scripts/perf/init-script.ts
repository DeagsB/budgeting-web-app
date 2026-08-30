// Injected into every measured page before any app script runs. Collects
// paint timings, hero visibility, approximate CLS, and main-thread gaps.
// WebKit (as of 18) exposes neither `largest-contentful-paint`,
// `layout-shift` nor `longtask`, so each has a manual fallback.

export const INIT_SCRIPT = `(() => {
  const M = (window.__maplePerf = {
    fcp: NaN, lcp: NaN, heroVisible: NaN, cls: 0, clsApprox: 0,
    longTasks: [], rafGaps: [], hydrationWarnings: 0, errors: [],
    supported: Array.from(PerformanceObserver.supportedEntryTypes || []),
  });
  const t0 = performance.timeOrigin;
  const has = (t) => M.supported.includes(t);

  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') M.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  if (has('largest-contentful-paint')) {
    try {
      new PerformanceObserver((l) => {
        const es = l.getEntries(); if (es.length) M.lcp = es[es.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  }
  if (has('layout-shift')) {
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) M.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  }
  if (has('longtask')) {
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) M.longTasks.push({ start: e.startTime, dur: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  }

  // rAF-gap detector: any frame gap > 50ms is treated as a long task.
  let last = performance.now();
  function frame(t) {
    const gap = t - last;
    if (gap > 50) M.rafGaps.push({ start: last, dur: Math.round(gap) });
    last = t;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Hero visible: first frame where [data-perf=hero] has text.
  function checkHero() {
    if (!Number.isNaN(M.heroVisible)) return;
    const el = document.querySelector('[data-perf="hero"]');
    if (el && el.textContent && el.textContent.trim()) {
      M.heroVisible = performance.now();
      performance.mark('maple:hero-visible');
    }
  }
  const mo = new MutationObserver(() => requestAnimationFrame(checkHero));
  document.addEventListener('DOMContentLoaded', () => {
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    checkHero();
  });

  // Approximate CLS: track the top of the first 40 visible block boxes and
  // sum viewport-fraction shifts between mutation batches, ignoring the
  // 500ms after any user input.
  let lastInput = -Infinity;
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
  }
  let prev = new Map();
  let scheduled = false;
  function sample() {
    scheduled = false;
    const vh = innerHeight || 1;
    const next = new Map();
    const els = document.querySelectorAll('main *, header *, nav *');
    let n = 0;
    for (const el of els) {
      if (n >= 40) break;
      if (!(el instanceof HTMLElement) || !el.id && !el.dataset.perf && el.children.length === 0 && !el.textContent) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.bottom < 0 || r.top > vh) continue;
      const key = el.id || el.dataset.perf || (el.tagName + ':' + n);
      next.set(key, { top: r.top + scrollY, h: r.height });
      n++;
    }
    if (performance.now() - lastInput > 500) {
      for (const [k, v] of next) {
        const p = prev.get(k);
        if (p && Math.abs(p.top - v.top) > 1) M.clsApprox += (Math.abs(p.top - v.top) / vh) * (v.h / vh);
      }
    }
    prev = next;
  }
  const mo2 = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sample);
  });
  document.addEventListener('DOMContentLoaded', () => {
    mo2.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    sample();
  });

  const origError = console.error;
  console.error = function (...a) {
    const s = a.map(String).join(' ');
    if (/hydrat/i.test(s)) M.hydrationWarnings++;
    M.errors.push(s.slice(0, 200));
    return origError.apply(this, a);
  };
})();`

// Playwright's WebKit build on Windows crashes inside
// document.startViewTransition() on routes whose Suspense fallback commits
// before the page (dashboard, accounts). Stub it for WebKit runs so the rest
// of the page can be measured; Chrome runs keep View Transitions on.
export const NO_VIEW_TRANSITIONS_SCRIPT = `delete Document.prototype.startViewTransition;`

// The target is the installed Home Screen app. Safari exposes that through
// navigator.standalone (and display-mode: standalone, which cannot be
// emulated here); the shell gates install-hint work on it.
export const PWA_SCRIPT = `Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });`
