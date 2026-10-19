/* ==========================================================================
   Xenri — page choreography
   Lenis smooth scroll driven by GSAP's ticker (one RAF), ScrollTrigger scenes,
   SplitText reveals, and the hooks that feed scroll and pointer into the
   background film (scene.js) and the charts (charts.js).
   ========================================================================== */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var Split = window.SplitText;
  var noop = function () {};
  var Scene = window.XenriScene || { setTone: noop, setScroll: noop, ripple: noop, intro: noop, pointer: noop };
  if (!Scene.pointer) Scene.pointer = noop;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // ------------------------------------------------------------------------
  // Small things that work with or without animation libraries
  // ------------------------------------------------------------------------
  document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  function paintStatus() {
    if (!window.XenriHours) return;
    var s = window.XenriHours.status();
    document.querySelectorAll('[data-status]').forEach(function (n) {
      n.setAttribute('data-open', s.open ? 'true' : 'false');
      var a = n.querySelector('[data-status-short]'); if (a) a.textContent = s.short;
      var b = n.querySelector('[data-status-long]'); if (b) b.textContent = s.long;
    });
  }
  paintStatus();
  setInterval(paintStatus, 30000);

  var lenis = null;
  var nav = document.querySelector('[data-nav]');
  var burger = document.querySelector('.nav__burger');
  var menu = document.getElementById('menu');
  var menuOpen = false;

  function openMenu() {
    if (!menu || menuOpen) return;
    menuOpen = true;
    menu.hidden = false;
    void menu.offsetWidth;
    menu.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    if (nav) nav.classList.remove('is-hidden');
    if (lenis) lenis.stop();
    var first = menu.querySelector('a');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 300);
  }
  function closeMenu(returnFocus) {
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    if (lenis) lenis.start();
    setTimeout(function () { if (!menuOpen) menu.hidden = true; }, reduce ? 0 : 800);
    if (returnFocus) burger.focus({ preventScroll: true });
  }
  if (burger) burger.addEventListener('click', function () { menuOpen ? closeMenu(true) : openMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) closeMenu(true); });

  // In-page links: smooth with Lenis, native otherwise.
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id === '#main') return;
      var target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      var wasOpen = menuOpen;
      closeMenu(false);
      var go = function () {
        if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: function (t) { return 1 - Math.pow(1 - t, 4); } });
        else if (target === 0) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      };
      if (wasOpen) setTimeout(go, reduce ? 0 : 420); else go();
    });
  });

  // Pointer → background film (ripples + light)
  var lastRip = 0, rpx = 0, rpy = 0;
  window.addEventListener('pointermove', function (e) {
    var x = e.clientX / window.innerWidth, y = 1 - e.clientY / window.innerHeight;
    Scene.pointer(x, y);
    var now = performance.now();
    var d = Math.hypot(e.clientX - rpx, e.clientY - rpy);
    if (now - lastRip > 90 && d > 26) {
      Scene.ripple(x, y, Math.min(1, d / 180) * 0.6);
      lastRip = now; rpx = e.clientX; rpy = e.clientY;
    }
  }, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    Scene.ripple(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight, 1);
  }, { passive: true });

  var loader = document.querySelector('.loader');
  function dropLoader() { if (loader && loader.parentNode) loader.parentNode.removeChild(loader); }

  // Without GSAP the page is a complete static site.
  if (!gsap || !ST) {
    dropLoader();
    Scene.intro(1);
    window.addEventListener('scroll', function () {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      Scene.setScroll(window.scrollY / max, 0);
    }, { passive: true });
    return;
  }

  gsap.registerPlugin(ST);
  if (Split) gsap.registerPlugin(Split);
  ST.config({ ignoreMobileResize: true });
  gsap.defaults({ ease: 'expo.out' });

  // ------------------------------------------------------------------------
  // Lenis on GSAP's ticker
  // ------------------------------------------------------------------------
  if (window.Lenis && !reduce) {
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95, touchMultiplier: 1.3 });
    lenis.on('scroll', ST.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }
  window.scrollTo(0, 0);

  // Feed scroll position and velocity into the film every frame.
  var vel = 0, lastY = window.scrollY;
  function maxScroll() { return Math.max(1, document.documentElement.scrollHeight - window.innerHeight); }
  gsap.ticker.add(function () {
    var y = lenis ? lenis.scroll : window.scrollY;
    var v = lenis ? lenis.velocity : (y - lastY);
    lastY = y;
    vel += (v - vel) * 0.2;
    Scene.setScroll(Math.min(1, Math.max(0, y / maxScroll())), vel / 28);
  });

  // Scroll progress hairline
  gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

  // Nav hides on the way down, returns on the way up.
  ST.create({
    start: 0, end: 'max',
    onUpdate: function (self) {
      if (!nav || menuOpen) return;
      var y = self.scroll();
      if (y < 160 || self.direction < 0) nav.classList.remove('is-hidden');
      else nav.classList.add('is-hidden');
    }
  });

  // ------------------------------------------------------------------------
  // Reveal helpers
  // ------------------------------------------------------------------------
  if (!reduce) {
    document.querySelectorAll('[data-reveal="lines"]').forEach(function (el) {
      if (!Split) return;
      Split.create(el, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.lines, {
            yPercent: 112, duration: 1.25, ease: 'expo.out', stagger: 0.09,
            scrollTrigger: { trigger: el, start: 'top 87%', once: true }
          });
        }
      });
    });

    gsap.set('[data-reveal="fade"]', { y: 36, autoAlpha: 0 });
    ST.batch('[data-reveal="fade"]', {
      start: 'top 90%', once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch, { filter: 'blur(8px)' }, { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 1.2, ease: 'expo.out', stagger: 0.09, clearProps: 'filter' });
      }
    });
  }

  var mm = gsap.matchMedia();

  // ------------------------------------------------------------------------
  // HERO — intro after the loader, scrubbed exit on scroll
  // ------------------------------------------------------------------------
  var heroSplit = null;
  function heroIntro() {
    var tl = gsap.timeline({
      onComplete: function () { if (heroSplit) heroSplit.revert(); }
    });
    tl.add(function () { Scene.intro(1); }, 0);
    if (Split) {
      heroSplit = Split.create('.hero__title', { type: 'lines', mask: 'lines' });
      tl.from(heroSplit.lines, { yPercent: 112, duration: 1.4, ease: 'expo.out', stagger: 0.11 }, 0.05);
    }
    tl.fromTo('.hero__media', { clipPath: 'inset(22% 26% 22% 26%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.8, ease: 'expo.inOut' }, 0)
      .from('.hero__img', { scale: 1.3, duration: 2.4, ease: 'expo.out' }, 0.2)
      .from(['.hero__lead', '.hero__actions'], { y: 28, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }, 0.45)
      .from('.hero__foot > *', { y: 16, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.7)
      .from('.hero__vert', { autoAlpha: 0, duration: 1.4, ease: 'power2.out' }, 0.8)
      .from('.nav', { autoAlpha: 0, duration: 1, ease: 'power2.out' }, 0.5);
    return tl;
  }

  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
    .to('.hero__parallax', { yPercent: 16, scale: 1.1, autoAlpha: 0.3, ease: 'none' }, 0)
    .to('.hero__title', { yPercent: -45, ease: 'none' }, 0)
    .to('.hero__lower', { y: -90, autoAlpha: 0, ease: 'none' }, 0)
    .to('.hero__vert', { yPercent: -140, ease: 'none' }, 0);

  if (fine && !reduce) {
    var hx = gsap.quickTo('.hero__media', 'x', { duration: 1.4, ease: 'power3' });
    var hy = gsap.quickTo('.hero__media', 'y', { duration: 1.4, ease: 'power3' });
    window.addEventListener('pointermove', function (e) {
      if (window.scrollY > window.innerHeight) return;
      hx((e.clientX / window.innerWidth - 0.5) * -26);
      hy((e.clientY / window.innerHeight - 0.5) * -18);
    }, { passive: true });
  }

  // ------------------------------------------------------------------------
  // MANIFESTO — words light up as you read
  // ------------------------------------------------------------------------
  var words = document.querySelector('[data-words]');
  if (words && Split && !reduce) {
    var ws = Split.create(words, { type: 'words', wordsClass: 'mw' });
    gsap.fromTo(ws.words, { opacity: 0.14 }, {
      opacity: 1, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: words, start: 'top 80%', end: 'bottom 52%', scrub: true }
    });
  }
  if (!reduce) {
    gsap.utils.toArray('.inline-img').forEach(function (n) {
      gsap.fromTo(n, { clipPath: 'inset(0% 50% 0% 50% round 999px)' }, {
        clipPath: 'inset(0% 0% 0% 0% round 999px)', ease: 'none',
        scrollTrigger: { trigger: n, start: 'top 88%', end: 'top 58%', scrub: true }
      });
      gsap.fromTo(n.querySelector('img'), { scale: 1.6 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: n, start: 'top 88%', end: 'top 45%', scrub: true }
      });
    });
    gsap.fromTo('.manifesto__seal', { rotate: -18, scale: 0.7 }, {
      rotate: -3, scale: 1, ease: 'none',
      scrollTrigger: { trigger: '.manifesto__sign', start: 'top 95%', end: 'top 60%', scrub: true }
    });
  }

  // ------------------------------------------------------------------------
  // COURSE — pinned horizontal journey (desktop), clip reveals (mobile)
  // ------------------------------------------------------------------------
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function rollIndex(el, i) {
    if (!el) return;
    el.textContent = pad2(i);
    gsap.fromTo(el, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
  }

  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
    var section = document.querySelector('.course');
    var pin = section.querySelector('.course__pin');
    var track = section.querySelector('.course__track');
    var bar = section.querySelector('.course__bar i');
    var idxEl = section.querySelector('[data-course-index]');
    var dishes = gsap.utils.toArray('.dish', track);
    var n = dishes.length, cur = 1;
    function dist() { return Math.max(0, track.scrollWidth - window.innerWidth); }

    var tween = gsap.to(track, {
      x: function () { return -dist(); },
      ease: 'none',
      scrollTrigger: {
        trigger: section, pin: pin, start: 'top top',
        end: function () { return '+=' + dist(); },
        scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: function (self) {
          gsap.set(bar, { scaleX: self.progress });
          var i = Math.min(n, Math.floor(self.progress * n * 0.999) + 1);
          if (i !== cur) { cur = i; rollIndex(idxEl, i); }
        }
      }
    });

    dishes.forEach(function (d) {
      gsap.fromTo(d.querySelector('img'), { xPercent: -6 }, {
        xPercent: 6, ease: 'none',
        scrollTrigger: { trigger: d, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true }
      });
      gsap.fromTo(d.querySelector('.dish__frame'), { clipPath: 'inset(14% 0% 14% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
        scrollTrigger: { trigger: d, containerAnimation: tween, start: 'left right', end: 'left 50%', scrub: true }
      });
      gsap.from(d.querySelectorAll('.dish__meta > *'), {
        y: 26, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
        scrollTrigger: { trigger: d, containerAnimation: tween, start: 'left 80%', toggleActions: 'play none none reverse' }
      });
    });
  });

  mm.add('(max-width: 899px) and (prefers-reduced-motion: no-preference)', function () {
    gsap.utils.toArray('.dish').forEach(function (d) {
      gsap.fromTo(d.querySelector('.dish__frame'), { clipPath: 'inset(10% 6% 10% 6%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
        scrollTrigger: { trigger: d, start: 'top 92%', end: 'top 42%', scrub: true }
      });
      gsap.fromTo(d.querySelector('img'), { scale: 1.22 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: d, start: 'top bottom', end: 'bottom top', scrub: true }
      });
      gsap.from(d.querySelectorAll('.dish__meta > *'), {
        y: 24, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
        scrollTrigger: { trigger: d.querySelector('.dish__meta'), start: 'top 92%', once: true }
      });
    });
  });

  // ------------------------------------------------------------------------
  // TA.KE.EN — 割 and 烹 part to reveal the counter
  // ------------------------------------------------------------------------
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var tl = gsap.timeline({
      scrollTrigger: { trigger: '.takeen__stage', start: 'top top', end: '+=140%', pin: true, scrub: 1, anticipatePin: 1 }
    });
    tl.fromTo('.takeen__k--l', { xPercent: 0 }, { xPercent: -64, ease: 'power2.inOut' }, 0)
      .fromTo('.takeen__k--r', { xPercent: 0 }, { xPercent: 64, ease: 'power2.inOut' }, 0)
      .fromTo('.takeen__media', { clipPath: 'inset(50% 50% 50% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut' }, 0.08)
      .fromTo('.takeen__media img', { scale: 1.45 }, { scale: 1, ease: 'power2.out' }, 0.08)
      .fromTo('.takeen__caption', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, ease: 'power2.out' }, 0.6)
      .to({}, { duration: 0.25 });
  });

  // ------------------------------------------------------------------------
  // PRAISE — velocity-reactive marquee
  // ------------------------------------------------------------------------
  (function () {
    var track = document.querySelector('.marquee__track');
    if (!track || reduce) return;
    var x = 0, half = 0, dir = -1, skew = 0, active = false;
    function measure() { half = track.scrollWidth / 2; }
    measure();
    window.addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);
    ST.create({ trigger: '.praise', start: 'top bottom', end: 'bottom top', onToggle: function (s) { active = s.isActive; } });
    var setX = gsap.quickSetter(track, 'x', 'px');
    var setSkew = gsap.quickSetter(track, 'skewX', 'deg');
    gsap.ticker.add(function (t, dtMs) {
      if (!active || !half) return;
      var dt = Math.min(0.05, dtMs / 1000);
      var v = lenis ? lenis.velocity : 0;
      if (v > 0.4) dir = -1; else if (v < -0.4) dir = 1;
      x += dir * (55 + Math.min(Math.abs(v) * 45, 1100)) * dt;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      skew += (Math.max(-9, Math.min(9, -v * 0.5)) - skew) * 0.12;
      setX(x);
      setSkew(skew);
    });
  })();

  // ------------------------------------------------------------------------
  // ROOMS — sticky stack; each card recedes as the next arrives.
  // Positions are computed from the (non-sticky) stack so refreshes are exact.
  // ------------------------------------------------------------------------
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var stack = document.querySelector('.rooms__stack');
    var rooms = gsap.utils.toArray('.room', stack);
    function stackTop() { return stack.getBoundingClientRect().top + window.scrollY; }
    function roomTop(i) { var t = stackTop(); for (var k = 0; k < i; k++) t += rooms[k].offsetHeight; return t; }
    var vh = function () { return window.innerHeight; };

    rooms.forEach(function (room, i) {
      gsap.fromTo(room.querySelector('.room__inner > img'), { scale: 1.22 }, {
        scale: 1.02, ease: 'none',
        scrollTrigger: { start: function () { return roomTop(i) - vh(); }, end: function () { return roomTop(i); }, scrub: true, invalidateOnRefresh: true }
      });
      gsap.from(room.querySelectorAll('.room__copy > *, .room__k'), {
        y: 44, autoAlpha: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { start: function () { return roomTop(i) - vh() * 0.55; }, toggleActions: 'play none none reverse', invalidateOnRefresh: true }
      });
      if (rooms[i + 1]) {
        gsap.timeline({
          scrollTrigger: { start: function () { return roomTop(i + 1) - vh(); }, end: function () { return roomTop(i + 1); }, scrub: true, invalidateOnRefresh: true }
        })
          .to(room.querySelector('.room__inner'), { scale: 0.9, ease: 'none' }, 0)
          .to(room.querySelector('.room__dim'), { opacity: 0.72, ease: 'none' }, 0);
      }
    });
  });

  // ------------------------------------------------------------------------
  // HONOURS — paper unfolds, charts draw in
  // ------------------------------------------------------------------------
  if (!reduce) {
    gsap.fromTo('.honours__paper', { clipPath: 'inset(0% 5% 0% 5% round 14px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
      scrollTrigger: { trigger: '.honours', start: 'top bottom', end: 'top 12%', scrub: true }
    });
    gsap.fromTo('.trophies img', { yPercent: 12 }, {
      yPercent: -6, ease: 'none',
      scrollTrigger: { trigger: '.trophies', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  }
  if (window.XenriCharts) {
    window.XenriCharts.list.forEach(function (m) {
      if (reduce) { m.chart.play(); return; }
      ST.create({ trigger: m.node, start: 'top 80%', once: true, onEnter: function () { m.chart.play(); } });
    });
  }

  // ------------------------------------------------------------------------
  // MENUS — ruled list, cursor-following plate
  // ------------------------------------------------------------------------
  if (!reduce) {
    gsap.utils.toArray('.menu-row').forEach(function (row) {
      gsap.fromTo(row, { '--line-x': 0 }, {
        '--line-x': 1, ease: 'none',
        scrollTrigger: { trigger: row, start: 'top 96%', end: 'top 72%', scrub: true }
      });
      gsap.from(row.querySelector('a'), {
        y: 34, autoAlpha: 0, duration: 1.1, ease: 'expo.out',
        scrollTrigger: { trigger: row, start: 'top 92%', once: true }
      });
    });
  }

  if (fine && !reduce) {
    var hm = document.querySelector('.hover-media');
    var himg = hm && hm.querySelector('img');
    if (hm && himg) {
      gsap.set(hm, { xPercent: -50, yPercent: -50, scale: 0.85, rotation: -4 });
      var mx = gsap.quickTo(hm, 'x', { duration: 0.7, ease: 'power3' });
      var my = gsap.quickTo(hm, 'y', { duration: 0.7, ease: 'power3' });
      var mr = gsap.quickTo(hm, 'rotation', { duration: 0.9, ease: 'power3' });
      var lx = 0;
      window.addEventListener('pointermove', function (e) {
        mx(e.clientX); my(e.clientY);
        mr(Math.max(-12, Math.min(12, (e.clientX - lx) * 0.5)));
        lx = e.clientX;
      }, { passive: true });
      document.querySelectorAll('.menu-row').forEach(function (row) {
        row.addEventListener('pointerenter', function () {
          if (himg.getAttribute('src') !== row.dataset.img) himg.src = row.dataset.img;
          gsap.to(hm, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
        });
        row.addEventListener('pointerleave', function () {
          gsap.to(hm, { autoAlpha: 0, scale: 0.85, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
        });
      });
      ST.create({
        trigger: '.menus', start: 'top 180%', once: true,
        onEnter: function () { document.querySelectorAll('.menu-row').forEach(function (r) { var im = new Image(); im.decoding = 'async'; im.src = r.dataset.img; }); }
      });
    }
  }

  // Magnetic buttons
  if (fine && !reduce) {
    document.querySelectorAll('[data-magnetic]').forEach(function (b) {
      var bx = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3' });
      var by = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3' });
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        bx((e.clientX - r.left - r.width / 2) * 0.22);
        by((e.clientY - r.top - r.height / 2) * 0.3);
      });
      b.addEventListener('pointerleave', function () { bx(0); by(0); });
    });
  }

  // ------------------------------------------------------------------------
  // VISIT + FOOTER
  // ------------------------------------------------------------------------
  if (!reduce) {
    gsap.fromTo('.visit__map', { clipPath: 'inset(10% 8% 10% 8% round 16px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 4px)', ease: 'none',
      scrollTrigger: { trigger: '.visit__map', start: 'top bottom', end: 'top 35%', scrub: true }
    });
    gsap.fromTo('.footer > .wrap', { yPercent: -14 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true }
    });
    gsap.from('.footer__word span', {
      yPercent: 105, duration: 1.5, ease: 'expo.out', stagger: 0.07,
      scrollTrigger: { trigger: '.footer__word', start: 'top 96%', toggleActions: 'play none none reverse' }
    });
  }

  // ------------------------------------------------------------------------
  // Global triggers, created last so pinned sections above are measured first
  // ------------------------------------------------------------------------
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var id = a.getAttribute('data-link');
    var sec = document.getElementById(id);
    if (!sec) return;
    ST.create({
      trigger: sec, start: 'top 50%', end: 'bottom 50%',
      endTrigger: id === 'kaiseki' ? '.course' : sec,
      onToggle: function (s) { a.classList.toggle('is-active', s.isActive); }
    });
  });

  document.querySelectorAll('[data-tone]').forEach(function (sec) {
    var tone = parseInt(sec.getAttribute('data-tone'), 10);
    ST.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: function (s) { if (s.isActive) Scene.setTone(tone); }
    });
  });

  if (document.fonts) document.fonts.ready.then(function () { ST.refresh(); });
  window.addEventListener('load', function () { ST.refresh(); });

  // ------------------------------------------------------------------------
  // PRELOADER → hero
  // ------------------------------------------------------------------------
  function start() {
    if (lenis) lenis.start();
    ST.refresh();
  }

  if (!loader || reduce) {
    dropLoader();
    Scene.intro(1);
    if (!reduce) heroIntro();
    start();
    return;
  }

  loader.style.animation = 'none';
  if (lenis) lenis.stop();

  var quick = false;
  try { quick = !!sessionStorage.getItem('xenri:seen'); sessionStorage.setItem('xenri:seen', '1'); } catch (e) {}

  var countEl = loader.querySelector('[data-count]');
  var c = { v: 0 };
  var d = quick ? 0.7 : 1.6;
  var intro = gsap.timeline();
  intro.from('.loader__kanji i', { yPercent: 115, duration: quick ? 0.7 : 1.2, ease: 'expo.out', stagger: 0.14 }, 0)
    .to(c, { v: 100, duration: d, ease: 'power2.inOut', onUpdate: function () { countEl.textContent = Math.round(c.v); } }, 0)
    .to('.loader__bar i', { scaleX: 1, duration: d, ease: 'power2.inOut' }, 0);

  var heroImg = document.querySelector('.hero__img');
  var imgReady = new Promise(function (res) {
    if (!heroImg || heroImg.complete) return res();
    heroImg.addEventListener('load', res, { once: true });
    heroImg.addEventListener('error', res, { once: true });
  });
  var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  var cap = new Promise(function (res) { setTimeout(res, 2400); });

  // Failsafe: if animation frames are throttled, never leave the visitor behind the curtain.
  var released = false;
  setTimeout(function () {
    if (released || !loader.parentNode) return;
    released = true;
    intro.kill();
    dropLoader();
    Scene.intro(1);
    start();
  }, 9000);

  Promise.race([Promise.all([imgReady, fontsReady]), cap])
    .then(function () { return intro.then(); })
    .then(function () {
      if (released) return;
      released = true;
      var out = gsap.timeline({ onComplete: dropLoader });
      out.to(['.loader__inner', '.loader__meta'], { yPercent: -30, autoAlpha: 0, duration: 0.7, ease: 'power3.in' }, 0)
        .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: 'expo.inOut' }, 0.35)
        .add(heroIntro(), 0.75)
        .add(start, 0.9);
    });
})();
