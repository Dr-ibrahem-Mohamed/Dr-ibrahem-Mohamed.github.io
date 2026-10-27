/* ==========================================================================
   Ibrahem M. El-Badry — site controller
   Smooth scroll (Lenis) → scroll keyframes → 3D scene, plus loader, HUD,
   text reveals and the cement-bag cursor.
   ========================================================================== */
(function () {
  'use strict';

  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const TAU = Math.PI * 2;
  const TAN = Math.tan((35 * Math.PI) / 360); // half vertical FOV of the scene camera
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const pad = (n) => String(n).padStart(2, '0');
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowPower = innerWidth < 820 || matchMedia('(pointer: coarse)').matches;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ---------- pile labels (order matches LABEL_PILES in scene.js) ----------
     stage a : the bag's constituents, shown until the clinker splits
     stage b : the clinker's raw materials, shown after it splits
     both    : gypsum + additives stay on screen throughout                   */
  const MATERIALS = [
    { stage: 'a', name: 'Clinker', formula: 'C₃S · C₂S · C₃A · C₄AF', share: 'up to ~95 %', role: 'Raw meal burnt at ~1450 °C' },
    { stage: 'both', name: 'Gypsum', formula: 'CaSO₄·2H₂O', share: '3–5 %', role: 'Controls setting time' },
    { stage: 'both', name: 'Additives', formula: 'Slag · pozzolana · filler', share: 'by cement type', role: 'Tune strength, workability, CO₂' },
    { stage: 'b', name: 'Limestone', formula: 'CaCO₃', share: '75–80 %', role: 'Main source of lime (CaO)' },
    { stage: 'b', name: 'Clay', formula: 'SiO₂ · Al₂O₃', share: '10–15 %', role: 'Brings silica & alumina' },
    { stage: 'b', name: 'Sand', formula: 'SiO₂', share: '2–5 %', role: 'Silica corrective' },
    { stage: 'b', name: 'Iron ore', formula: 'Fe₂O₃', share: '1–3 %', role: 'Iron corrective · flux' },
  ];

  /* ---------- scroll keyframes ----------
     look  : point the camera frames
     off   : camera offset from that point
     shift : where the point sits horizontally (0 centre … 1 right edge),
             so text and 3D share the screen on wide layouts
     vshift: portrait only — how far above centre the point sits (negative = below)
     m     : overrides for portrait screens                                  */
  const DEF = {
    look: [3, 2.5, -0.5], off: [0.4, 1.3, 16.5], shift: 0, vshift: 0.22,
    bag: [7.6, 1.85, 0], rot: [0, 0, 0], scale: 1,
    morph: 0, split: 0, stream: 0, labels: 0, rings: 0, dim: 0, idle: 0,
  };
  const KEYS = [
    { el: '#hero', f: 0, s: { look: [3.6, 0.6, -0.5], off: [0.4, 2.2, 21], stream: 1 }, m: { look: [5.6, 2.2, -0.3], off: [0.4, 1.6, 15] } },
    { el: '#about', f: 0, s: { look: [8.5, 1.7, 0], off: [0.3, 1.3, 8.6], shift: 0.45, bag: [8.5, 1.6, 0], rot: [0, -0.35, 0], stream: 0 } },
    { el: '#about', f: 1, s: { look: [12.8, 1.7, 0], off: [0.4, 1.3, 8.6], bag: [12.8, 1.6, 0], rot: [0, -0.6, 0] } },
    // bag → clinker + gypsum + additives → clinker back to limestone, clay, sand, iron ore
    { el: '#rawmix', f: 0, s: { look: [23, 2.0, 0], off: [0, 0.8, 8.8], shift: 0.38, vshift: -0.2, bag: [23, 2.05, 0], rot: [0, -0.25, 0], idle: 1 } },
    { el: '#rawmix', f: 0.12, s: { off: [0.3, 0.5, 7.2], shift: 0.36, rot: [0, TAU, 0], idle: 0 } },
    { el: '#rawmix', f: 0.16, s: {} },
    { el: '#rawmix', f: 0.38, s: { look: [23, 1.0, 0.3], off: [-0.6, 6.2, 14.6], shift: 0.3, vshift: -0.5, morph: 1, rings: 1 }, m: { off: [-0.6, 7.5, 19] } },
    { el: '#rawmix', f: 0.43, s: { labels: 1 } },
    { el: '#rawmix', f: 0.52, s: {} },
    { el: '#rawmix', f: 0.74, s: { off: [-1.8, 6.0, 15.6], shift: 0.36, split: 1 }, m: { off: [-1.6, 7.0, 18.8] } },
    { el: '#rawmix', f: 1, s: { off: [-2.6, 5.4, 15.0] }, m: { off: [-2.0, 6.5, 18.5] } },
    { el: '#experience', f: 0, s: { look: [23, 0.9, 0], off: [-4.0, 2.2, 9.6], shift: 0, vshift: 0.22, labels: 0, rings: 0.35, dim: 0.62 } },
    { el: '#companies', f: 0, s: { look: [23, 1.0, 0], off: [4.8, 1.5, 8.6], dim: 0.66 } },
    { el: '#education', f: 0, s: { look: [23, 0, 0.4], off: [0.1, 10.5, 7.6], dim: 0.6 } },
    { el: '#education', f: 1, s: { split: 0 } },
    { el: '#contact', f: 0, s: { look: [25.5, 2.0, 0.4], off: [-0.4, 0.4, 6.6], shift: 0.42, vshift: 0.5, bag: [25.5, 2.05, 0.4], rot: [0, TAU - 0.45, 0], morph: 0, split: 0, rings: 0, dim: 0, idle: 1 } },
  ];

  const sections = $$('main > section');
  const rawEl = $('#rawmix');
  let keys = [];
  let sectionTops = [];
  let rawTop = 0, rawH = 1;

  function measure() {
    const vh = innerHeight;
    const maxScroll = Math.max(1, root.scrollHeight - vh);
    const portrait = innerWidth / innerHeight < 1;
    const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
    let prev = DEF;
    keys = KEYS.map((k) => {
      const el = $(k.el);
      const range = Math.max(0, el.offsetHeight - vh);
      const s = Object.assign({}, prev, k.s, portrait && k.m ? k.m : null);
      prev = s;
      return { at: Math.min(maxScroll, docTop(el) + k.f * range), s };
    });
    sectionTops = sections.map(docTop);
    rawTop = docTop(rawEl);
    rawH = rawEl.offsetHeight;
  }

  const easeIO = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

  function mixState(a, b, t, out) {
    for (const k in DEF) {
      const av = a[k], bv = b[k];
      if (Array.isArray(av)) {
        if (!out[k]) out[k] = [0, 0, 0];
        for (let i = 0; i < 3; i++) out[k][i] = av[i] + (bv[i] - av[i]) * t;
      } else {
        out[k] = av + (bv - av) * t;
      }
    }
  }

  function sample(y, out) {
    const last = keys.length - 1;
    if (y <= keys[0].at) return mixState(keys[0].s, keys[0].s, 0, out);
    if (y >= keys[last].at) return mixState(keys[last].s, keys[last].s, 0, out);
    for (let i = 0; i < last; i++) {
      const a = keys[i], b = keys[i + 1];
      if (y < b.at) return mixState(a.s, b.s, easeIO((y - a.at) / Math.max(1, b.at - a.at)), out);
    }
  }

  // Turn look/off/shift into a concrete camera position + target for this viewport.
  function frameCamera(s) {
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const mul = aspect < 0.7 ? 1.75 : portrait ? 1.4 : aspect < 1.7 ? Math.pow(1.7 / aspect, 0.75) : 1;
    const shift = portrait ? 0 : s.shift * (aspect < 1.3 ? 0.7 : 1);
    const ox = s.off[0] * mul, oy = s.off[1] * mul, oz = s.off[2] * mul;
    const dist = Math.hypot(ox, oy, oz);
    const rl = Math.hypot(oz, ox) || 1;
    const rx = oz / rl, rz = -ox / rl; // camera right vector (horizontal)
    const d = shift * dist * TAN * aspect;
    const vy = portrait ? s.vshift * dist * TAN : 0;
    s.tgt[0] = s.look[0] - rx * d;
    s.tgt[1] = s.look[1] - vy;
    s.tgt[2] = s.look[2] - rz * d;
    s.cam[0] = s.tgt[0] + ox;
    s.cam[1] = s.tgt[1] + oy;
    s.cam[2] = s.tgt[2] + oz;
  }

  function damp(cur, goal, k) {
    for (const key in goal) {
      const v = goal[key];
      if (Array.isArray(v)) for (let i = 0; i < v.length; i++) cur[key][i] += (v[i] - cur[key][i]) * k;
      else cur[key] += (v - cur[key]) * k;
    }
  }

  const cloneState = (s) => JSON.parse(JSON.stringify(s));

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (!reduceMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
    lenis.stop();
  }

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target, { duration: 2.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
    } else if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  $$('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#top' || id === '#hero' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      scrollToTarget(target);
    }));

  /* ---------- loader ---------- */
  const loaderEl = $('#loader');
  const loaderNum = $('#loaderNum');
  const loaderBar = $('#loaderBar');
  const logItems = $$('#loaderLog li');
  const MILESTONES = [30, 65, 88, 100];
  let loadTarget = 0, loadShown = 0, loadCeil = MILESTONES[0] - 4, loadDone = false, ready = false;

  function milestone(i) {
    if (logItems[i]) logItems[i].classList.add('is-ok');
    loadTarget = Math.max(loadTarget, MILESTONES[i]);
    loadCeil = Math.max(loadCeil, (MILESTONES[i + 1] || 104) - 4);
    if (i === MILESTONES.length - 1) ready = true;
  }

  function tickLoader(dt) {
    if (loadDone) return;
    loadTarget = Math.min(loadCeil, loadTarget + dt * 6); // keep creeping so it never looks stuck
    loadShown += (loadTarget - loadShown) * Math.min(1, dt * 5);
    const v = Math.min(100, Math.round(loadShown));
    loaderNum.textContent = v;
    loaderBar.style.transform = 'scaleX(' + (v / 100) + ')';
    if (ready && loadShown > 99.4) finishLoading();
  }

  function finishLoading() {
    loadDone = true;
    loaderNum.textContent = '100';
    root.classList.remove('is-loading');
    root.classList.add('is-ready');
    measure();
    if (lenis) lenis.start();
    setTimeout(() => { loaderEl.style.display = 'none'; }, 1400);
  }

  setTimeout(() => { MILESTONES.forEach((_, i) => milestone(i)); }, 9000); // never trap the visitor

  /* ---------- 3D scene boot ---------- */
  const canvas = $('#scene');
  const veil = $('#veil');
  const brandShell = $('.brand__shell');
  let scene = null;

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  const fontsReady = document.fonts
    ? Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('600 40px "Inter Tight"'),
      document.fonts.load('700 40px "Inter Tight"'),
      document.fonts.load('500 20px "JetBrains Mono"'),
    ]).then(() => document.fonts.ready).catch(() => {})
    : Promise.resolve();

  withTimeout(fontsReady, 4000)
    .then(() => {
      milestone(0);
      measure();
      return import(THREE_URL);
    })
    .then((THREE) => {
      milestone(1);
      scene = window.CementScene.create(THREE, canvas, { mobile: lowPower });
      scene.resize(innerWidth, innerHeight);
      milestone(2);
    })
    .catch((err) => {
      console.warn('3D scene unavailable, showing the static version.', err);
      root.classList.add('no-webgl');
      MILESTONES.forEach((_, i) => milestone(i));
    });

  /* ---------- pile labels ---------- */
  const labelWrap = $('#pileLabels');
  const labelEls = MATERIALS.map((mt, i) => {
    const el = document.createElement('div');
    el.className = 'plabel';
    el.innerHTML =
      '<span class="plabel__box"><span class="plabel__n">' + (mt.stage === 'b' ? 'In the clinker' : 'In the bag') + '</span><b>' + mt.name + '</b>' +
      '<span class="plabel__f">' + mt.formula + ' · ' + mt.share + '</span>' +
      '<span class="plabel__r">' + mt.role + '</span></span>' +
      '<span class="plabel__line"></span><i class="plabel__dot"></i>';
    labelWrap.appendChild(el);
    return el;
  });
  const labelPos = MATERIALS.map(() => ({ x: 0, y: 0, behind: false }));
  let labelsShown = false;

  // stage-a labels fade out as the clinker splits; stage-b labels fade in
  function stageVisibility(stage, split) {
    if (stage === 'a') return 1 - clamp(split * 2.2, 0, 1);
    if (stage === 'b') return clamp(split * 2.2 - 1.2, 0, 1);
    return 1;
  }

  function updateLabels(amount, split) {
    const show = amount > 0.01;
    if (!show && !labelsShown) return;
    labelsShown = show;
    labelWrap.style.visibility = show ? 'visible' : 'hidden';
    if (!show) return;
    scene.projectPiles(labelPos);
    labelEls.forEach((el, i) => {
      const p = labelPos[i];
      const o = p.behind ? 0 : clamp(amount * 1.8 - (i % 4) * 0.16, 0, 1) * stageVisibility(MATERIALS[i].stage, split);
      el.style.opacity = o.toFixed(3);
      el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + (p.y + (1 - o) * 14).toFixed(1) + 'px,0)';
    });
  }

  /* ---------- HUD ---------- */
  const hudIdx = $('#hudIdx');
  const hudStage = $('#hudStage');
  const hudRpm = $('#hudRpm');
  const hudClock = $('#hudClock');
  const railFill = $('#railFill');
  const rail = $('#rail');
  const navLinks = $$('.nav a');
  const stageNames = sections.map((s) => s.dataset.stage || '');

  const ticks = sections.map((sec, i) => {
    const b = document.createElement('button');
    b.className = 'rail__tick';
    b.type = 'button';
    b.style.top = (i / (sections.length - 1)) * 100 + '%';
    b.setAttribute('aria-label', 'Go to ' + stageNames[i]);
    b.dataset.cursor = stageNames[i];
    b.addEventListener('click', () => scrollToTarget(i === 0 ? 0 : sec));
    rail.appendChild(b);
    return b;
  });

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%';
  function scramble(el, text) {
    cancelAnimationFrame(el._raf);
    let frame = 0;
    const total = 16;
    const run = () => {
      let out = '';
      const reveal = (frame / total) * text.length;
      for (let i = 0; i < text.length; i++) {
        out += i < reveal || text[i] === ' ' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (frame++ < total) el._raf = requestAnimationFrame(run);
      else el.textContent = text;
    };
    run();
  }

  let stageIdx = -1, rawStep = -1, rpmTimer = 0;
  function updateHud(y, dt, boost) {
    const vh = innerHeight;
    const max = Math.max(1, root.scrollHeight - vh);
    railFill.style.transform = 'scaleY(' + clamp(y / max, 0, 1).toFixed(4) + ')';

    let idx = 0;
    for (let i = 0; i < sectionTops.length; i++) if (y + vh * 0.5 >= sectionTops[i]) idx = i;
    if (idx !== stageIdx) {
      stageIdx = idx;
      hudIdx.textContent = pad(idx + 1) + '/' + pad(sections.length);
      scramble(hudStage, stageNames[idx].toUpperCase());
      ticks.forEach((t, i) => t.classList.toggle('is-active', i === idx));
      const id = '#' + sections[idx].id;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
    }

    const p = (y - rawTop) / Math.max(1, rawH - vh);
    const step = p < 0.14 ? 0 : p < 0.5 ? 1 : p < 0.76 ? 2 : 3;
    if (step !== rawStep) {
      rawStep = step;
      rawEl.dataset.step = step;
    }

    rpmTimer -= dt;
    if (rpmTimer <= 0) {
      rpmTimer = 0.12;
      hudRpm.textContent = 'Mill ' + (15.6 + boost * 4).toFixed(1) + ' rpm';
    }
  }

  try {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tickClock = () => { hudClock.textContent = 'Alex ' + fmt.format(new Date()); };
    tickClock();
    setInterval(tickClock, 1000);
  } catch (e) {
    hudClock.textContent = 'Alexandria, EG';
  }

  /* ---------- split headings into words ---------- */
  function splitWords(el, counter) {
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span');
          const wi = document.createElement('span');
          w.className = 'w';
          wi.className = 'wi';
          wi.style.setProperty('--i', counter.i++);
          wi.textContent = part;
          w.appendChild(wi);
          frag.appendChild(w);
        });
        el.replaceChild(frag, node);
      } else if (node.nodeType === 1 && node.tagName !== 'BR') {
        splitWords(node, counter);
      }
    });
  }
  $$('[data-split]').forEach((el) => splitWords(el, { i: 0 }));

  /* ---------- reveals + counters ---------- */
  function countUp(el) {
    const to = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    if (reduceMotion) { el.textContent = to + suffix; return; }
    const t0 = performance.now();
    const run = (now) => {
      const t = clamp((now - t0) / 1300, 0, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))) + suffix;
      if (t < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      if (e.target.hasAttribute('data-count')) countUp(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
  $$('[data-reveal], [data-split], [data-count]').forEach((el) => {
    if (!el.closest('.hero')) io.observe(el);
  });

  /* ---------- small interactions ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--ry', (px * 6).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-py * 6).toFixed(2) + 'deg');
        el.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px,' +
          ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  $$('[data-copy]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const label = btn.querySelector('span') || btn;
      const original = label.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        label.textContent = 'Copied ✓';
      } catch (e) {
        label.textContent = btn.dataset.copy;
      }
      setTimeout(() => { label.textContent = original; }, 1800);
    }));

  /* ---------- cement-bag cursor ---------- */
  function initCursor() {
    const cursor = $('.cursor');
    if (!finePointer || !cursor) return null;
    root.classList.add('has-cursor');
    const dot = $('.cursor__dot', cursor);
    const bag = $('.cursor__bag', cursor);
    const label = $('.cursor__label', cursor);
    let mx = -100, my = -100, bx = -100, by = -100, rot = 0, scale = 1, hover = false, down = false, seen = false;

    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; bx = mx; by = my; cursor.classList.add('is-visible'); }
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest && e.target.closest('a, button, [data-cursor]');
      hover = !!t;
      label.textContent = t ? (t.dataset.cursor || '') : '';
      cursor.classList.toggle('is-hover', hover);
      cursor.classList.toggle('has-label', !!label.textContent);
    });
    document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));
    document.addEventListener('pointerenter', () => { if (seen) cursor.classList.add('is-visible'); });
    addEventListener('pointerdown', (e) => { down = true; if (!reduceMotion) puff(e.clientX, e.clientY + 34); });
    addEventListener('pointerup', () => { down = false; });

    function puff(x, y) {
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('span');
        const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 30;
        p.className = 'puff';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
        p.style.setProperty('--dy', (Math.sin(a) * d - 10).toFixed(1) + 'px');
        p.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
      }
    }

    return function tick(dt) {
      const k = 1 - Math.exp(-dt * 16);
      const nx = bx + (mx - bx) * k;
      const ny = by + (my - by) * k;
      const vel = (nx - bx) / Math.max(dt, 0.001);
      bx = nx; by = ny;
      rot += (clamp(vel * 0.025, -30, 30) - rot) * (1 - Math.exp(-dt * 9));
      const target = (hover ? 1.4 : 1) * (down ? 0.82 : 1);
      scale += (target - scale) * (1 - Math.exp(-dt * 18));
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      bag.style.transform = 'translate3d(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    };
  }
  const cursorTick = initCursor();

  /* ---------- resize ---------- */
  let resizeQueued = false;
  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (scene) scene.resize(innerWidth, innerHeight);
      measure();
    });
  }
  addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(document.body);

  /* ---------- main loop ---------- */
  const goal = Object.assign(cloneState(DEF), { cam: [0, 0, 0], tgt: [0, 0, 0] });
  let cur = null, boost = 0, last = performance.now(), firstFrame = false;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    if (lenis) lenis.raf(now);
    tickLoader(dt);

    const y = window.scrollY;
    if (keys.length) {
      sample(y, goal);
      frameCamera(goal);
      if (!cur) cur = cloneState(goal);
      damp(cur, goal, reduceMotion ? 1 : 1 - Math.exp(-dt * 5.5));
      const v = lenis ? Math.abs(lenis.velocity || 0) : 0;
      boost += (Math.min(3, v * 0.06) - boost) * (1 - Math.exp(-dt * 4));
      cur.boost = boost;

      if (scene) {
        scene.update(cur, dt, now / 1000);
        scene.render();
        updateLabels(cur.labels, cur.split);
        if (!firstFrame) { firstFrame = true; milestone(3); }
      }
      veil.style.opacity = cur.dim.toFixed(3);
      updateHud(y, dt, boost);
    }
    // logo: the mill shell turns with time and scroll, the ball charge stays at the bottom
    brandShell.setAttribute('transform', 'rotate(' + ((y * 0.12 + now * 0.012) % 360).toFixed(1) + ' 20 20)');
    if (cursorTick) cursorTick(dt);
  }
  requestAnimationFrame(loop);
})();
