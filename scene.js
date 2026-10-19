/* ==========================================================================
   Xenri — "Sumi & Water" background film
   One WebGL canvas behind the page. Ink clouds drift through dark pond water,
   gold leaf rises, and the pointer leaves ripples. Scrolling scrubs the film
   forward and back, and each section grades it to its own palette.

   Optional: drop a file named xenri-film.mp4 next to index.html and it is
   pulled into the same shader, scrubbed by scroll and rippled by the pointer.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.querySelector('.scene');
  var video = document.querySelector('.film');
  if (!canvas) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  } catch (e) { gl = null; }

  // Section palettes (linear-ish sRGB). deep, body, glow, gold leaf.
  var TONES = [
    { c1: [0.030, 0.036, 0.040], c2: [0.060, 0.088, 0.094], c3: [0.36, 0.31, 0.21], c4: [0.98, 0.80, 0.46] }, // 0 hero: night pond
    { c1: [0.036, 0.033, 0.031], c2: [0.080, 0.074, 0.068], c3: [0.30, 0.26, 0.20], c4: [0.92, 0.76, 0.46] }, // 1 manifesto: sumi
    { c1: [0.042, 0.030, 0.022], c2: [0.115, 0.072, 0.042], c3: [0.48, 0.29, 0.13], c4: [1.00, 0.80, 0.45] }, // 2 course: amber lacquer
    { c1: [0.048, 0.024, 0.020], c2: [0.140, 0.048, 0.034], c3: [0.58, 0.19, 0.10], c4: [1.00, 0.70, 0.40] }, // 3 takeen: ember
    { c1: [0.022, 0.032, 0.032], c2: [0.046, 0.084, 0.078], c3: [0.19, 0.31, 0.26], c4: [0.86, 0.80, 0.55] }, // 4 rooms: koi pond
    { c1: [0.036, 0.033, 0.031], c2: [0.080, 0.074, 0.068], c3: [0.30, 0.26, 0.20], c4: [0.92, 0.76, 0.46] }, // 5 honours
    { c1: [0.028, 0.030, 0.046], c2: [0.056, 0.064, 0.104], c3: [0.26, 0.27, 0.40], c4: [0.92, 0.80, 0.52] }, // 6 menus: indigo
    { c1: [0.046, 0.038, 0.028], c2: [0.120, 0.094, 0.060], c3: [0.52, 0.40, 0.21], c4: [1.00, 0.85, 0.50] }  // 7 visit: dawn
  ];

  var api = {
    setTone: function () {}, setScroll: function () {}, ripple: function () {}, intro: function () {}, ready: false
  };
  window.XenriScene = api;

  if (!gl) {
    document.documentElement.classList.add('no-webgl');
    if (video) {
      video.addEventListener('loadeddata', function () { video.classList.add('is-ready'); });
      video.addEventListener('error', function () { video.remove(); }, true);
    }
    return;
  }

  var VERT = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uFlow;',
    'uniform float uScroll;',
    'uniform float uVel;',
    'uniform vec2 uMouse;',
    'uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;',
    'uniform vec4 uRip[8];',
    'uniform sampler2D uVideo;',
    'uniform float uHasVideo;',
    'uniform vec2 uVidRes;',
    'uniform float uIntro;',

    'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
    '  for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  float asp = uRes.x / uRes.y;',
    '  vec2 p = (uv - 0.5) * vec2(asp, 1.0);',

    // Pointer ripples: travelling rings that displace everything beneath.
    '  vec2 disp = vec2(0.0); float ring = 0.0;',
    '  for (int i = 0; i < 8; i++){',
    '    vec4 r = uRip[i];',
    '    float age = uTime - r.z;',
    '    if (r.w <= 0.0 || age < 0.0 || age > 4.0) continue;',
    '    vec2 c = (r.xy - 0.5) * vec2(asp, 1.0);',
    '    vec2 d = p - c; float dist = length(d);',
    '    float front = age * 0.34;',
    '    float w = sin((dist - front) * 40.0) * exp(-abs(dist - front) * 10.0) * exp(-age * 1.15) * r.w;',
    '    disp += (d / (dist + 0.0001)) * w * 0.016;',
    '    ring += w;',
    '  }',
    '  p += disp;',

    // Domain-warped ink drifting in water. Scroll moves the camera down the pond.
    '  float t = uTime * 0.04 + uFlow;',
    '  vec2 q = p * 1.3 + vec2(0.0, uScroll * 2.4);',
    '  vec2 w1 = vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(5.2, 1.3) - t * 0.8));',
    '  vec2 w2 = vec2(fbm(q + 3.2 * w1 + vec2(1.7, 9.2) + t * 0.6), fbm(q + 3.2 * w1 + vec2(8.3, 2.8) - t * 0.5));',
    '  float f = fbm(q + 3.4 * w2);',

    '  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);',
    '  float ml = exp(-length(p - m) * 2.6);',

    '  vec3 col = mix(uC1, uC2, smoothstep(0.18, 0.86, f));',
    '  col = mix(col, uC3, smoothstep(0.58, 1.08, f + length(w2) * 0.32) * 0.5);',
    '  float vein = smoothstep(0.022, 0.0, abs(f - 0.52));',
    '  col *= 1.0 - vein * 0.35;',

    // Caustic light, brighter near the pointer.
    '  float ca = fbm(q * 3.3 + w2 * 2.2 - t * 1.6);',
    '  float caustic = pow(smoothstep(0.45, 0.96, 1.0 - abs(ca - 0.5) * 2.0), 6.0);',
    '  col += uC3 * caustic * (0.09 + ml * 0.22);',
    '  col += uC3 * ml * 0.09;',
    '  col += uC4 * ring * 0.045;',

    // Optional film, graded into the palette and rippled.
    '  if (uHasVideo > 0.5){',
    '    float sa = uRes.x / uRes.y; float va = uVidRes.x / max(uVidRes.y, 1.0);',
    '    vec2 sc = sa > va ? vec2(1.0, va / sa) : vec2(sa / va, 1.0);',
    '    vec2 vuv = (uv - 0.5) * sc + 0.5;',
    '    vuv += disp * vec2(1.0 / asp, 1.0) * 1.6 + (w2 - 0.5) * 0.006;',
    '    vec3 v = texture2D(uVideo, vec2(vuv.x, 1.0 - vuv.y)).rgb;',
    '    float lum = dot(v, vec3(0.299, 0.587, 0.114));',
    '    vec3 graded = mix(uC1, uC3 * 1.4, lum) * 0.5 + v * 0.5;',
    '    col = mix(col, graded, 0.8);',
    '  }',

    // Kinpaku: gold leaf flecks rising through the water.
    '  vec2 fp = uv * vec2(asp, 1.0) * 9.0;',
    '  fp.y -= uTime * 0.05 + uScroll * 7.0;',
    '  vec2 cell = floor(fp); vec2 fr = fract(fp) - 0.5;',
    '  float h = hash(cell);',
    '  if (h > 0.87){',
    '    vec2 o = vec2(hash(cell + 3.1) - 0.5, hash(cell + 7.7) - 0.5) * 0.6;',
    '    float d = length(fr - o);',
    '    float tw = 0.5 + 0.5 * sin(uTime * 1.3 + h * 40.0);',
    '    col += uC4 * smoothstep(0.055, 0.0, d) * tw * (0.3 + min(abs(uVel), 1.0) * 1.1);',
    '  }',

    '  float vig = smoothstep(1.25, 0.2, length((uv - 0.5) * vec2(asp * 0.85, 1.0)));',
    '  col *= mix(0.5, 1.0, vig);',
    '  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.024;',
    '  col *= uIntro;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[scene] shader error', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { document.documentElement.classList.add('no-webgl'); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { document.documentElement.classList.add('no-webgl'); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['uRes', 'uTime', 'uFlow', 'uScroll', 'uVel', 'uMouse', 'uC1', 'uC2', 'uC3', 'uC4', 'uRip', 'uVideo', 'uHasVideo', 'uVidRes', 'uIntro'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  // ---- State ----
  var state = {
    time: 0, flow: 0, scroll: 0, scrollTarget: 0, vel: 0, velTarget: 0,
    mouse: [0.62, 0.55], mouseTarget: [0.62, 0.55],
    intro: 0, introTarget: reduce ? 1 : 0,
    tone: 0,
    pal: clonePal(TONES[0]),
    ripples: new Float32Array(32),
    ripIndex: 0,
    hasVideo: false, vidW: 16, vidH: 9, vidTime: 0
  };

  function clonePal(t) { return { c1: t.c1.slice(), c2: t.c2.slice(), c3: t.c3.slice(), c4: t.c4.slice() }; }

  // ---- Size ----
  var scale = 1;
  function resize() {
    var mobile = window.innerWidth < 800;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = (mobile ? 0.5 : 0.62) * Math.min(dpr, 1.25);
    var w = Math.max(2, Math.round(window.innerWidth * scale));
    var h = Math.max(2, Math.round(window.innerHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    if (reduce) draw(0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Optional video ----
  var tex = null;
  if (video) {
    var onReady = function () {
      if (!video.videoWidth || state.hasVideo) return;
      state.hasVideo = true;
      state.vidW = video.videoWidth; state.vidH = video.videoHeight;
      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(U.uVideo, 0);
      video.pause();
    };
    video.addEventListener('loadeddata', onReady);
    if (video.readyState >= 2) onReady();
    // A missing file is the normal case: quietly drop the element.
    video.addEventListener('error', function () { video.remove(); video = null; }, true);
    var src = video.querySelector('source');
    if (src) src.addEventListener('error', function () { if (video) { video.remove(); video = null; } });
  }

  function uploadVideoFrame() {
    if (!state.hasVideo || !video || video.readyState < 2) return;
    // Scrub the film with page progress, eased so seeks stay smooth.
    var dur = video.duration || 0;
    if (dur > 0) {
      var target = state.scroll * (dur - 0.05);
      state.vidTime += (target - state.vidTime) * 0.12;
      if (Math.abs(video.currentTime - state.vidTime) > 1 / 30 && !video.seeking) {
        try { video.currentTime = state.vidTime; } catch (e) {}
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    } catch (e) { state.hasVideo = false; }
  }

  // ---- Draw ----
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpArr(a, b, t) { for (var i = 0; i < 3; i++) a[i] = lerp(a[i], b[i], t); }

  function draw(dt) {
    var target = TONES[state.tone] || TONES[0];
    var k = reduce ? 1 : Math.min(1, dt * 1.6);
    lerpArr(state.pal.c1, target.c1, k);
    lerpArr(state.pal.c2, target.c2, k);
    lerpArr(state.pal.c3, target.c3, k);
    lerpArr(state.pal.c4, target.c4, k);

    if (!reduce) {
      state.scroll = lerp(state.scroll, state.scrollTarget, Math.min(1, dt * 6));
      state.vel = lerp(state.vel, state.velTarget, Math.min(1, dt * 4));
      state.velTarget *= Math.pow(0.02, dt); // settles when scrolling stops
      state.flow += state.vel * dt * 0.35;
      state.mouse[0] = lerp(state.mouse[0], state.mouseTarget[0], Math.min(1, dt * 3));
      state.mouse[1] = lerp(state.mouse[1], state.mouseTarget[1], Math.min(1, dt * 3));
      state.intro = lerp(state.intro, state.introTarget, Math.min(1, dt * 1.4));
    } else {
      state.scroll = state.scrollTarget; state.intro = 1;
    }

    uploadVideoFrame();

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, state.time);
    gl.uniform1f(U.uFlow, state.flow);
    gl.uniform1f(U.uScroll, state.scroll);
    gl.uniform1f(U.uVel, state.vel);
    gl.uniform2f(U.uMouse, state.mouse[0], state.mouse[1]);
    gl.uniform3fv(U.uC1, state.pal.c1);
    gl.uniform3fv(U.uC2, state.pal.c2);
    gl.uniform3fv(U.uC3, state.pal.c3);
    gl.uniform3fv(U.uC4, state.pal.c4);
    gl.uniform4fv(U.uRip, state.ripples);
    gl.uniform1f(U.uHasVideo, state.hasVideo ? 1 : 0);
    gl.uniform2f(U.uVidRes, state.vidW, state.vidH);
    gl.uniform1f(U.uIntro, state.intro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  var running = !reduce;
  var last = 0;
  function frame(now) {
    if (!running) return;
    var t = now / 1000;
    var dt = last ? Math.min(0.05, t - last) : 0.016;
    last = t;
    state.time += dt;
    draw(dt);
  }

  // One RAF for the whole page: ride GSAP's ticker when it exists.
  function tick() { frame(performance.now()); }
  if (!reduce) {
    if (window.gsap) window.gsap.ticker.add(tick);
    else (function loop(n) { frame(n); requestAnimationFrame(loop); })(performance.now());
  } else {
    draw(0);
  }

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden && !reduce;
    last = 0;
  });

  // ---- Public API ----
  api.ready = true;
  api.setTone = function (i) {
    if (i === state.tone || !TONES[i]) return;
    state.tone = i;
    if (reduce) draw(0);
  };
  api.setScroll = function (progress, velocity) {
    state.scrollTarget = progress;
    if (typeof velocity === 'number') state.velTarget = Math.max(-2.5, Math.min(2.5, velocity));
    if (reduce) draw(0);
  };
  api.pointer = function (x, y) {
    state.mouseTarget[0] = x;
    state.mouseTarget[1] = y;
  };
  api.ripple = function (x, y, strength) {
    if (reduce) return;
    var i = state.ripIndex * 4;
    state.ripples[i] = x;
    state.ripples[i + 1] = y;
    state.ripples[i + 2] = state.time;
    state.ripples[i + 3] = strength;
    state.ripIndex = (state.ripIndex + 1) % 8;
  };
  api.intro = function (v) { state.introTarget = v; if (reduce) draw(0); };
})();
