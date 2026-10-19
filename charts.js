/* ==========================================================================
   Xenri — Ink charts
   A dependency-free port of Bklit UI's chart grammar for a no-build site:
   root chart → grid → series → markers → axis → tooltip, themed through the
   same --chart-* tokens, with Bklit's staged enter animation (grid expands,
   series reveal, markers settle) and crosshair tooltips.

   Also exposes XenriHours, the live open/closed status in Kuala Lumpur time.
   ========================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G = window.gsap || null;

  // ------------------------------------------------------------------------
  // Hours (Kuala Lumpur, UTC+8)
  // ------------------------------------------------------------------------
  var SERVICES = [
    { key: 'lunch', label: 'Lunch', from: 12 * 60, to: 14 * 60 + 30 },
    { key: 'dinner', label: 'Dinner', from: 18 * 60, to: 22 * 60 + 30 }
  ];

  function klNow() {
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date())
        .forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var d = new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000);
      parts.hour = String(d.getHours()); parts.minute = String(d.getMinutes());
    }
    var h = parseInt(parts.hour, 10) % 24, m = parseInt(parts.minute, 10);
    return { h: h, m: m, mins: h * 60 + m, label: pad(h) + ':' + pad(m) };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(mins) { return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60); }

  function status() {
    var now = klNow(), t = now.mins;
    for (var i = 0; i < SERVICES.length; i++) {
      var s = SERVICES[i];
      if (t >= s.from && t < s.to) {
        return { open: true, now: now, short: 'Open now', title: 'Open now', detail: s.label + ' until ' + fmt(s.to), long: 'Open now · ' + s.label.toLowerCase() + ' service until ' + fmt(s.to) };
      }
    }
    var next = t < SERVICES[0].from ? 'Opens 12:00 today' : t < SERVICES[1].from ? 'Opens 18:00 for dinner' : 'Opens 12:00 tomorrow';
    return { open: false, now: now, short: next, title: 'Closed now', detail: next, long: 'Closed now · ' + next.charAt(0).toLowerCase() + next.slice(1) };
  }

  window.XenriHours = { status: status, services: SERVICES, klNow: klNow };

  // ------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function scale(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function tip(container) {
    var t = document.createElement('div');
    t.className = 'ink-tip';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    container.appendChild(t);
    return {
      show: function (html, x, y) { t.innerHTML = html; t.style.left = x + 'px'; t.style.top = y + 'px'; t.classList.add('is-on'); },
      hide: function () { t.classList.remove('is-on'); }
    };
  }
  function onResize(node, fn) {
    var w = node.clientWidth, raf = 0;
    var ro = new ResizeObserver(function () {
      if (Math.abs(node.clientWidth - w) < 2) return;
      w = node.clientWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fn);
    });
    ro.observe(node);
  }

  // ------------------------------------------------------------------------
  // 1. Honours: step area + markers + crosshair (Bklit composed chart)
  // ------------------------------------------------------------------------
  var HONOURS = [
    { year: 2008, total: 1, title: 'Gold Medal, Most Creative Team', org: 'Hong Kong Grand Cuisine' },
    { year: 2009, total: 6, title: 'Five Awards of Excellence', org: 'Malaysia International Gourmet Festival' },
    { year: 2014, total: 7, title: 'Best Restaurants', org: 'Malaysia Tatler' },
    { year: 2023, total: 7, title: 'TA.KE.EN Omakase opens', org: 'Kappo omakase counter, Kuala Lumpur', milestone: true },
    { year: 2024, total: 9, title: 'King of Asian Cuisine · Best 30 Recommended Japanese Restaurants', org: 'HAPA Award 2023–24' }
  ];

  function honoursChart(root) {
    var plot = root.querySelector('.chart__plot');
    var played = false;
    var parts = null;
    var tt = tip(plot);

    function render() {
      plot.querySelectorAll('svg').forEach(function (s) { s.remove(); });
      var W = Math.max(300, plot.clientWidth);
      var H = Math.round(Math.max(240, Math.min(380, W * 0.46)));
      var m = { t: 24, r: 18, b: 38, l: 30 };
      var x = scale(2006.5, 2025.5, m.l, W - m.r);
      var y = scale(0, 10, H - m.b, m.t);

      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ink-svg', 'aria-hidden': 'true' });
      plot.insertBefore(svg, plot.firstChild);

      var uid = 'hg' + Math.random().toString(36).slice(2, 7);
      var defs = el('defs', null, svg);
      var grad = el('linearGradient', { id: uid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': 'var(--chart-1)', 'stop-opacity': 0.32 }, grad);
      el('stop', { offset: '100%', 'stop-color': 'var(--chart-1)', 'stop-opacity': 0 }, grad);
      var clip = el('clipPath', { id: uid + 'c' }, defs);
      var clipRect = el('rect', { x: 0, y: 0, width: played || reduce ? W : 0, height: H }, clip);

      // Grid
      var grid = el('g', { class: 'ink-grid' }, svg);
      var ylab = el('g', { class: 'ink-ylab' }, svg);
      var gridLines = [];
      [0, 2, 4, 6, 8, 10].forEach(function (v) {
        gridLines.push(el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid));
        var t = el('text', { x: m.l - 10, y: y(v) + 4, 'text-anchor': 'end' }, ylab);
        t.textContent = v;
      });

      // Series: step-after path
      var pts = [[2006.5, 0]];
      var prev = 0;
      HONOURS.forEach(function (d) { pts.push([d.year, prev]); pts.push([d.year, d.total]); prev = d.total; });
      pts.push([2025.5, prev]);
      var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); }).join(' ');
      var area = line + ' L' + x(2025.5).toFixed(1) + ' ' + y(0) + ' L' + x(2006.5).toFixed(1) + ' ' + y(0) + ' Z';
      var series = el('g', { 'clip-path': 'url(#' + uid + 'c)' }, svg);
      el('path', { d: area, fill: 'url(#' + uid + ')' }, series);
      el('path', { d: line, class: 'ink-line' }, series);

      // Axis
      var axis = el('g', { class: 'ink-axis' }, svg);
      var lastX = -99;
      HONOURS.forEach(function (d) {
        var px = x(d.year);
        if (px - lastX < 34) return;
        var t = el('text', { x: px, y: H - 12, 'text-anchor': 'middle' }, axis);
        t.textContent = d.year;
        lastX = px;
      });

      // Crosshair
      var cross = el('line', { class: 'ink-cross', x1: 0, x2: 0, y1: m.t - 6, y2: H - m.b, opacity: 0 }, svg);

      // Markers (keyboard reachable)
      var markers = el('g', null, svg);
      var marks = HONOURS.map(function (d, i) {
        var g = el('g', { class: 'ink-marker' + (d.milestone ? ' is-milestone' : ''), tabindex: 0, role: 'img', 'aria-label': d.year + ': ' + d.title + ', ' + d.org }, markers);
        el('circle', { class: 'hit', cx: x(d.year), cy: y(d.total), r: 16 }, g);
        var ring = el('circle', { class: 'ring', cx: x(d.year), cy: y(d.total), r: 5 }, g);
        g.addEventListener('focus', function () { activate(i); });
        g.addEventListener('blur', deactivate);
        return { g: g, ring: ring, px: x(d.year), py: y(d.total) };
      });

      // Hover surface
      var surface = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H - m.b, fill: 'transparent' }, svg);
      surface.style.cursor = 'crosshair';
      svg.insertBefore(surface, markers);

      function activate(i) {
        var d = HONOURS[i], mk = marks[i];
        marks.forEach(function (o, j) { o.g.classList.toggle('is-active', j === i); });
        cross.setAttribute('x1', mk.px); cross.setAttribute('x2', mk.px); cross.setAttribute('opacity', 1);
        var r = svg.getBoundingClientRect(), k = r.width / W;
        var left = Math.min(Math.max(mk.px * k, 110), r.width - 110);
        tt.show('<span class="k">' + (d.year === 2024 ? '2023–24' : d.year) + '</span><b>' + d.title + '</b><span class="s">' + d.org + '</span><br><span class="s">' + d.total + ' honours to date</span>', left, mk.py * k);
      }
      function deactivate() {
        marks.forEach(function (o) { o.g.classList.remove('is-active'); });
        cross.setAttribute('opacity', 0);
        tt.hide();
      }
      function nearest(evt) {
        var r = svg.getBoundingClientRect();
        var px = (evt.clientX - r.left) * (W / r.width);
        var best = 0, bd = Infinity;
        marks.forEach(function (mk, i) { var dd = Math.abs(mk.px - px); if (dd < bd) { bd = dd; best = i; } });
        return best;
      }
      svg.addEventListener('pointermove', function (e) { activate(nearest(e)); });
      svg.addEventListener('pointerdown', function (e) { activate(nearest(e)); });
      svg.addEventListener('pointerleave', deactivate);

      parts = { gridLines: gridLines, clipRect: clipRect, W: W, marks: marks, labels: [ylab, axis] };
      if (!played && !reduce && G) {
        G.set(gridLines, { scaleX: 0, transformOrigin: '0% 50%' });
        G.set(marks.map(function (o) { return o.ring; }), { scale: 0, opacity: 0, transformOrigin: '50% 50%' });
        G.set(parts.labels, { opacity: 0 });
      }
    }

    function play() {
      if (played) return;
      played = true;
      if (!G || reduce || !parts) { if (parts) parts.clipRect.setAttribute('width', parts.W); return; }
      var tl = G.timeline();
      tl.to(parts.gridLines, { scaleX: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 })
        .to(parts.labels, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.2)
        .to(parts.clipRect, { attr: { width: parts.W }, duration: 1.4, ease: 'power2.inOut' }, 0.25);
      parts.marks.forEach(function (mk) {
        tl.to(mk.ring, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' }, 0.25 + (mk.px / parts.W) * 1.3);
      });
    }

    render();
    onResize(plot, render);
    return { play: play };
  }

  // ------------------------------------------------------------------------
  // 2. Reviews: horizontal bar distribution (Bklit bar chart, horizontal)
  // ------------------------------------------------------------------------
  var REVIEWS = { avg: 4.3, total: 684, rows: [ { stars: 5, count: 397 }, { stars: 4, count: 180 }, { stars: 3, count: 62 }, { stars: 2, count: 23 }, { stars: 1, count: 22 } ] };
  var STAR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 7.5 4.3l3.7.3-2.8 2.4.9 3.7L6 8.7 2.7 10.7l.9-3.7L.8 4.6l3.7-.3z"/></svg>';

  function reviewsChart(root) {
    var plot = root.querySelector('.chart__plot');
    var avgEl = root.querySelector('[data-avg]');
    var totalEl = root.querySelector('[data-total]');
    var max = Math.max.apply(null, REVIEWS.rows.map(function (r) { return r.count; }));
    var tt = tip(plot);
    var list = document.createElement('div');
    list.className = 'bars';
    list.setAttribute('role', 'list');
    REVIEWS.rows.forEach(function (r) {
      var pct = (r.count / REVIEWS.total * 100);
      var row = document.createElement('div');
      row.className = 'bar';
      row.setAttribute('role', 'listitem');
      row.tabIndex = 0;
      row.setAttribute('aria-label', r.stars + ' stars: ' + r.count + ' reviews, ' + pct.toFixed(1) + ' percent');
      row.innerHTML =
        '<span class="bar__label">' + r.stars + STAR + '</span>' +
        '<span class="bar__track"><span class="bar__fill" style="transform:scaleX(' + (r.count / max) + ')"></span></span>' +
        '<span class="bar__val"><b data-n="' + r.count + '">' + r.count + '</b></span>';
      function show() {
        var tr = row.querySelector('.bar__track');
        var pr = plot.getBoundingClientRect(), br = tr.getBoundingClientRect();
        var x = br.left - pr.left + br.width * (r.count / max);
        tt.show('<span class="k">' + r.stars + ' star' + (r.stars > 1 ? 's' : '') + '</span><b>' + r.count + ' reviews</b><span class="s">' + pct.toFixed(1) + '% of all ratings</span>', Math.min(Math.max(x, 100), pr.width - 100), br.top - pr.top);
      }
      row.addEventListener('pointerenter', show);
      row.addEventListener('focus', show);
      row.addEventListener('pointerleave', tt.hide);
      row.addEventListener('blur', tt.hide);
      list.appendChild(row);
    });
    plot.appendChild(list);

    var fills = list.querySelectorAll('.bar__fill');
    var nums = list.querySelectorAll('[data-n]');
    var played = false;
    if (G && !reduce) {
      G.set(fills, { scaleX: 0 });
      nums.forEach(function (n) { n.textContent = '0'; });
      if (avgEl) avgEl.textContent = '0.0';
      if (totalEl) totalEl.textContent = '0';
    }

    function play() {
      if (played) return;
      played = true;
      if (!G || reduce) return;
      var tl = G.timeline();
      fills.forEach(function (f, i) {
        var r = REVIEWS.rows[i];
        tl.to(f, { scaleX: r.count / max, duration: 1.2, ease: 'expo.out' }, 0.1 + i * 0.08);
        var o = { v: 0 };
        tl.to(o, { v: r.count, duration: 1.2, ease: 'expo.out', onUpdate: function () { nums[i].textContent = Math.round(o.v); } }, 0.1 + i * 0.08);
      });
      var a = { v: 0, t: 0 };
      tl.to(a, { v: REVIEWS.avg, t: REVIEWS.total, duration: 1.6, ease: 'expo.out', onUpdate: function () {
        if (avgEl) avgEl.textContent = a.v.toFixed(1);
        if (totalEl) totalEl.textContent = Math.round(a.t);
      } }, 0);
    }
    return { play: play };
  }

  // ------------------------------------------------------------------------
  // 3. Service clock: 24-hour ring with live needle (Bklit ring chart)
  // ------------------------------------------------------------------------
  function clockChart(root) {
    var plot = root.querySelector('.chart__plot');
    var wrap = document.createElement('div');
    wrap.className = 'clock-wrap';
    plot.appendChild(wrap);
    var tt = tip(plot);

    var S = 340, C = S / 2, R = 128, SW = 12;
    var svg = el('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'ink-svg', role: 'img', 'aria-label': 'Daily service hours: lunch 12:00 to 14:30, dinner 18:00 to 22:30.' }, wrap);

    function ang(mins) { return (mins / 1440) * Math.PI * 2 - Math.PI / 2; }
    function pt(a, r) { return [C + Math.cos(a) * r, C + Math.sin(a) * r]; }

    el('circle', { cx: C, cy: C, r: R, class: 'ink-ring-track', 'stroke-width': SW }, svg);

    var ticks = el('g', null, svg);
    for (var h = 0; h < 24; h++) {
      var a = ang(h * 60), major = h % 6 === 0;
      var p1 = pt(a, R + SW / 2 + 6), p2 = pt(a, R + SW / 2 + (major ? 16 : 10));
      el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: 'ink-tick' + (major ? ' major' : '') }, ticks);
      if (major) {
        var lp = pt(a, R + SW / 2 + 30);
        var t = el('text', { x: lp[0], y: lp[1] + 4, 'text-anchor': 'middle', class: 'ink-center-time' }, ticks);
        t.textContent = pad(h);
      }
    }

    var arcs = SERVICES.map(function (s) {
      var a0 = ang(s.from), a1 = ang(s.to);
      var p0 = pt(a0, R), p1 = pt(a1, R);
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var d = 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
      var path = el('path', { d: d, class: 'ink-arc', 'stroke-width': SW, pathLength: 1, tabindex: 0, role: 'img', 'aria-label': s.label + ' ' + fmt(s.from) + ' to ' + fmt(s.to) }, svg);
      var mid = pt((a0 + a1) / 2, R);
      function show() {
        path.classList.add('is-active');
        var r = svg.getBoundingClientRect(), pr = plot.getBoundingClientRect(), k = r.width / S;
        tt.show('<span class="k">' + fmt(s.from) + ' – ' + fmt(s.to) + '</span><b>' + s.label + ' service</b><span class="s">Daily · reservations only</span>', r.left - pr.left + mid[0] * k, r.top - pr.top + mid[1] * k - 8);
      }
      function hide() { path.classList.remove('is-active'); tt.hide(); }
      path.addEventListener('pointerenter', show);
      path.addEventListener('focus', show);
      path.addEventListener('pointerleave', hide);
      path.addEventListener('blur', hide);
      return path;
    });

    // The needle lives on the ring only, so it never crosses the centre label.
    var needle = el('g', { class: 'ink-needle' }, svg);
    el('line', { x1: C, y1: C - R + SW / 2 + 10, x2: C, y2: C - R - SW / 2 - 6 }, needle);
    el('circle', { cx: C, cy: C - R - SW / 2 - 10, r: 4 }, needle);

    var tStatus = el('text', { x: C, y: C - 6, 'text-anchor': 'middle', class: 'ink-center-status' }, svg);
    var tSub = el('text', { x: C, y: C + 16, 'text-anchor': 'middle', class: 'ink-center-sub' }, svg);
    var tTime = el('text', { x: C, y: C + 40, 'text-anchor': 'middle', class: 'ink-center-time' }, svg);

    function needleDeg() { var n = klNow(); return (n.mins / 1440) * 360; }
    function setNeedle(deg) { needle.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + C + ' ' + C + ')'); }
    function update() {
      var s = status();
      tStatus.textContent = s.title;
      tSub.textContent = s.detail;
      tTime.textContent = 'KL ' + s.now.label;
    }

    var played = false;
    update();
    if (G && !reduce) {
      arcs.forEach(function (p) { p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; });
      setNeedle(0);
      G.set(needle, { opacity: 0 });
    } else {
      setNeedle(needleDeg());
    }
    setInterval(function () { update(); if (played || reduce || !G) setNeedle(needleDeg()); }, 30000);

    function play() {
      if (played) return;
      played = true;
      if (!G || reduce) { setNeedle(needleDeg()); return; }
      var tl = G.timeline();
      arcs.forEach(function (p, i) { tl.to(p, { strokeDashoffset: 0, duration: 1.2, ease: 'expo.out' }, 0.15 + i * 0.2); });
      var o = { d: 0 };
      tl.to(needle, { opacity: 1, duration: 0.3 }, 0.2)
        .to(o, { d: needleDeg(), duration: 1.6, ease: 'expo.out', onUpdate: function () { setNeedle(o.d); } }, 0.2);
    }
    return { play: play };
  }

  // ------------------------------------------------------------------------
  // Mount
  // ------------------------------------------------------------------------
  var registry = { honours: honoursChart, reviews: reviewsChart, clock: clockChart };
  var mounted = [];
  document.querySelectorAll('[data-chart]').forEach(function (node) {
    var fn = registry[node.getAttribute('data-chart')];
    if (!fn) return;
    try { mounted.push({ node: node, chart: fn(node) }); } catch (e) { console.warn('[charts]', e); }
  });

  window.XenriCharts = {
    list: mounted,
    playAll: function () { mounted.forEach(function (m) { m.chart.play(); }); }
  };

  // Without GSAP's ScrollTrigger (or with reduced motion) charts show their final state.
  if (!G || reduce || !window.ScrollTrigger) {
    if (!('IntersectionObserver' in window)) { window.XenriCharts.playAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        mounted.forEach(function (m) { if (m.node === en.target) m.chart.play(); });
        io.unobserve(en.target);
      });
    }, { threshold: 0.25 });
    mounted.forEach(function (m) { io.observe(m.node); });
  }
})();
