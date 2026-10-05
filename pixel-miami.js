/* =====================================================================
   Pixel Miami: the profile banner as live pixel art.
   pixel-miami.png is background.jpeg reduced to 313x78 and 32 colors.
   Every frame starts from that image and paints the moving parts on
   top, one logical pixel at a time. CSS scales the canvas up with
   nearest-neighbor sampling, so the pixels stay square and crisp.
   ===================================================================== */
(function () {
  "use strict";
  const canvas = document.querySelector(".banner canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const FPS = 12;                       // low on purpose, so motion reads as sprite animation

  /* ---------- palette ---------- */
  const C = {
    w: [248, 244, 255], W: [255, 238, 222], l: [196, 188, 226], g: [112, 104, 146], k: [26, 14, 46],
    p: [255, 72, 172], P: [200, 30, 120], T: [20, 150, 150], c: [150, 250, 250],
    y: [255, 212, 136], r: [255, 52, 64], n: [18, 46, 108], o: [248, 194, 62], b: [92, 146, 236],
  };

  /* ---------- tiny pixel toolkit ---------- */
  let base, frame, d;                   // source pixels, the frame being drawn, its bytes
  function put(x, y, c, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
    const i = (y * W + x) * 4;
    if (a === undefined || a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; return; }
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
  }
  // ["..ww", ...] becomes a list of [x, y, paletteKey]. "." is transparent.
  function sprite(rows) {
    const s = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== ".") s.push([x, y, r[x]]); });
    s.w = Math.max(...rows.map(r => r.length)); s.h = rows.length;
    return s;
  }
  // o.flip mirrors the sprite, o.x0 and o.x1 clip it (boats slip behind the river banks)
  function blit(s, x, y, o = {}) {
    for (const [dx, dy, k] of s) {
      const px = x + (o.flip ? s.w - 1 - dx : dx);
      if (o.x0 !== undefined && (px < o.x0 || px > o.x1)) continue;
      put(px, y + dy, C[k], o.a);
    }
  }

  /* ---------- 3x5 pixel font, only the letters the scene uses ---------- */
  const FONT = {
    A: [".#.", "#.#", "###", "#.#", "#.#"], C: [".##", "#..", "#..", "#..", ".##"],
    D: ["##.", "#.#", "#.#", "#.#", "##."], E: ["###", "#..", "##.", "#..", "###"],
    F: ["###", "#..", "##.", "#..", "#.."], G: [".##", "#..", "#.#", "#.#", ".##"],
    H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"], O: ["###", "#.#", "#.#", "#.#", "###"],
    P: ["##.", "#.#", "##.", "#..", "#.."], R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."], " ": ["..", "..", "..", "..", ".."],
  };
  // keys holds one palette key per character: text("GO FIU", "ww ooo")
  function text(str, keys) {
    const rows = ["", "", "", "", ""];
    [...str].forEach((ch, i) => {
      for (let y = 0; y < 5; y++) rows[y] += (i ? "." : "") + FONT[ch][y].replace(/#/g, keys[i]);
    });
    return sprite(rows);
  }

  /* ---------- sprites, facing right unless noted ---------- */
  const PLANE = sprite([                // faces left and tows the banner
    "..........p.",
    "...wwwww..pp",
    ".wbbwwwwwwwp",
    ".wwwwwwwwww.",
    "....k..k....",
  ]);
  const YACHT = sprite([
    "...........k............",
    ".........lwwwl..........",
    ".......wwkkkkkww........",
    "....wwwwwwwwwwwwwwww....",
    "..wwyykkyykkyykkkwwwwwww",
    "..wwwwwwwwwwwwwwwwwwwww.",
    "...ggggggggggggggggggg..",
  ]);
  const SPEEDBOAT = sprite([            // faces left, straight out of Miami Vice
    ".....kl.......",
    "..wwwwwwwwwww.",
    "wwPPPPPPPPPPwk",
    ".wwTTTTTTTTTwk",
    "..ggggggggggg.",
  ]);
  const BARGE = sprite([                // billboard boat, the panel is filled by the marquee
    "ggggggggggggggggggggggggg.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.ww..",
    "gnnnnnnnnnnnnnnnnnnnnnnngwbbw.",
    "ggggggggggggggggggggggggg.www.",
    "...k.................k...wwww.",
    "wwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ".gggggggggggggggggggggggggggg.",
  ]);
  const JETSKI = sprite([
    "..y....",
    "..pp...",
    ".wwwwk.",
    "TTTTTTT",
  ]);
  const ROBOT = [                       // sidewalk delivery robot, two wheel frames
    sprite(["....o", "....l", "wwwwl", "wwwww", ".k.k."]),
    sprite(["....o", "....l", "wwwwl", "wwwww", "k.k.k"]),
  ];
  const BIRD = [sprite(["k.k", ".k."]), sprite(["...", "kkk"])];
  const BANNER = text("VICE CITY", "PPPP TTTT"), BANNER_W = BANNER.w + 4;
  const MARQUEE = text("GO FIU PANTHERS", "ww ooo oooooooo");
  const SIGN = text("PURA VIDA", "pppp cccc");

  /* ---------- scene geometry, traced from the photo ---------- */
  const WATER_TOP = 66;
  const bankL = y => Math.ceil(147 - 2.17 * (y - WATER_TOP));
  const bankR = y => Math.floor(199 + 0.4 * (y - WATER_TOP));
  const isWater = (x, y) => y >= WATER_TOP && y < H && x >= bankL(y) && x <= bankR(y);
  const TOWERS = [[62, 14, 93, 34], [108, 19, 118, 48], [135, 14, 148, 52], [150, 27, 157, 55],
                  [180, 26, 198, 56], [200, 14, 217, 52], [218, 14, 228, 50], [250, 14, 276, 48]];
  const OFFICES = [[205, 24], [209, 35], [221, 30], [140, 22], [139, 38], [111, 30],
                   [72, 18], [84, 26], [257, 21], [264, 33]];
  const BEACONS = [[46, 9], [104, 27], [112, 17], [141, 3], [154, 26], [183, 24], [193, 26], [222, 9]];
  const STARS = [[4, 14], [13, 19], [24, 13], [286, 15], [296, 19], [305, 14], [310, 21]];
  let windows = [], foam = [];

  /* ---------- layers ---------- */
  function water(t) {
    for (let y = WATER_TOP; y < H; y++) {
      const shift = Math.round(Math.sin(t * 1.7 + y * 0.9));     // ripple the reflections
      if (!shift) continue;
      const x0 = bankL(y), x1 = bankR(y);
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4, j = (y * W + Math.min(x1, Math.max(x0, x + shift))) * 4;
        d[i] = base[j]; d[i + 1] = base[j + 1]; d[i + 2] = base[j + 2];
      }
    }
    for (let n = 0; n < 4; n++) {                                 // glints
      const y = WATER_TOP + Math.floor(Math.random() * (H - WATER_TOP));
      put(bankL(y) + Math.random() * (bankR(y) - bankL(y)), y, C.W, 0.6);
    }
  }

  function traffic(t) {                 // cars crossing the far bridge
    for (let i = 0; i < 5; i++) put(141 + (t * 6 + i * 12.5) % 58, 64, C.y, 0.9);
    for (let i = 0; i < 4; i++) put(198 - (t * 5 + i * 15) % 58, 65, C.r, 0.8);
  }

  function brickell(t) {
    for (const w of windows) {          // late nights in the towers
      if (Math.random() < (w.on ? 0.012 : 0.0026)) w.on = !w.on;    // about 18% lit at any time
      if (w.on) put(w.x, w.y, w.warm ? C.y : C.c, 0.7);
    }
    OFFICES.forEach(([x, y], i) => {    // lit offices with someone still at work
      if (Math.sin(t * 0.07 + i * 2.3) < -0.75) return;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) put(x + c, y + r, C.y, 0.9);
      put(x + (i % 2 ? 3 : 0), y + 2, C.c);
      const px = x + Math.round(1.5 + 1.5 * Math.sin(t * (0.5 + (i % 3) * 0.2) + i));
      put(px, y + 1, C.k); put(px, y + 2, C.k);
    });
    BEACONS.forEach(([x, y], i) => {
      if ((t * 0.8 + i * 0.37) % 1 > 0.25) return;
      put(x, y, C.r); put(x - 1, y, C.r, 0.35); put(x + 1, y, C.r, 0.35);
    });
    STARS.forEach(([x, y], i) => put(x, y, C.W, 0.25 + 0.35 * (1 + Math.sin(t * 1.3 + i * 2.1))));
  }

  function pelicans(t) {
    const p = (t + 20) % 70;
    if (p > 60) return;
    for (let i = 0; i < 3; i++)
      blit(BIRD[Math.floor(t * 3 + i) % 2], -6 + p * 6 - i * 7, 33 + i * 2 + Math.round(Math.sin(t * 0.8 + i)));
  }

  function puraVida(t) {
    const x = 192, y = 57, p = t % 9;            // ends by x 228, so phones still see it whole
    const vidaOff = (p > 6.1 && p < 6.25) || (p > 6.4 && p < 6.5);   // a tired neon tube
    for (let r = -1; r <= 5; r++) for (let c = -2; c < SIGN.w + 2; c++) put(x + c, y + r, C.k, 0.85);
    const lit = SIGN.filter(([, , k]) => !(k === "c" && vidaOff));
    for (const [dx, dy, k] of lit)
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(x + dx + ox, y + dy + oy, C[k], 0.3);
    for (const [dx, dy, k] of lit) put(x + dx, y + dy, C[k]);
  }

  function robot(t) {                   // Pura Vida to the riverwalk and back, pausing at both ends
    const p = t % 28, A = 226, B = 206, v = 2;
    let x = A, dir = 1, moving = false;
    if (p < 10) { x = A - p * v; dir = -1; moving = true; }
    else if (p < 14) { x = B; dir = -1; }
    else if (p < 24) { x = B + (p - 14) * v; moving = true; }
    blit(ROBOT[moving ? Math.floor(t * 6) % 2 : 0], Math.round(x), 68, { flip: dir > 0 });
  }

  // a boat p seconds into crossing the river along lane y: its left edge, or null when off the water
  function crossing(p, speed, w, y, dir) {
    if (p < 0 || p * speed > bankR(y) - bankL(y) + w + 2) return null;
    return Math.round(dir > 0 ? bankL(y) - w + p * speed : bankR(y) + 1 - p * speed);
  }
  function wake(x, y, t, life, n) {
    for (let i = 0; i < n; i++)
      foam.push({ x: x + Math.round(Math.random() * 2 - 1), y: y + (Math.random() < 0.5 ? 0 : 1), t0: t, life });
  }

  function boats(t) {
    foam = foam.filter(f => t >= f.t0 && t - f.t0 < f.life);
    for (const f of foam) if (isWater(f.x, f.y)) put(f.x, f.y, C.W, 0.75 * (1 - (t - f.t0) / f.life));

    // far lane: a yacht with its underglow on, heading upriver
    let y = 69, x = crossing(t % 50, 3, YACHT.w, y, -1);
    if (x !== null) {
      wake(x + YACHT.w - 3, y, t, 2.5, 1);
      for (let c = 3; c < 21; c++) if (x + c >= bankL(y) && x + c <= bankR(y)) put(x + c, y + 1, C.p, 0.5);
      blit(YACHT, x, y - YACHT.h + 1, { flip: true, x0: bankL(y), x1: bankR(y) });
    }
    // middle lane: now and then a jet ski
    y = 73; x = crossing((t + 20) % 37, 12, JETSKI.w, y, 1);
    if (x !== null) {
      wake(x, y, t, 1.2, 2);
      blit(JETSKI, x, y - JETSKI.h + 1, { x0: bankL(y), x1: bankR(y) });
    }
    // near lane: the FIU billboard boat with its LED panel scrolling. While the lane
    // is clear between its trips, the speedboat makes a run there and back.
    y = 77;
    const lap = (t + 43) % 46, x0 = bankL(y), x1 = bankR(y);
    x = crossing(lap, 4, BARGE.w, y, 1);
    if (x !== null) {
      const top = y - BARGE.h + 1;
      wake(x + 1, y, t, 2, 1);
      blit(BARGE, x, top, { x0, x1 });
      const scroll = Math.floor(t * 9) % (MARQUEE.w + 23);
      for (const [dx, dy, k] of MARQUEE) {
        const cx = x + 1 + dx + 23 - scroll;
        if (cx > x && cx < x + 24 && cx >= x0 && cx <= x1) put(cx, top + 1 + dy, C[k]);
      }
    }
    for (const [start, dir] of [[29, -1], [38, 1]]) {
      x = crossing(lap - start, 24, SPEEDBOAT.w, y, dir);
      if (x === null) continue;
      wake(dir < 0 ? x + SPEEDBOAT.w - 1 : x, y, t, 1.6, 3);
      blit(SPEEDBOAT, x, y - SPEEDBOAT.h + 1, { flip: dir > 0, x0, x1 });
    }
  }

  function plane(t) {                   // a banner plane, Miami Beach style
    const x = W + 2 - Math.round(((t + 6) % 58) * 9), y = 20 + Math.round(Math.sin(t * 2.2) * 0.6);
    if (x + 16 + BANNER_W < 0) return;
    blit(PLANE, x, y);
    const prop = Math.floor(t * FPS) % 2 ? C.l : C.g;
    put(x, y + 2, prop); put(x, y + 3, prop);
    for (let i = 12; i < 16; i++) put(x + i, y + 2, C.l, 0.8);
    // the banner trails the plane's bob a beat late, and only its loose end flaps,
    // so the letters stay readable
    const bx = x + 16, by = 19 + Math.round(Math.sin(t * 2.2 - 0.9) * 0.6), flap = Math.floor(t * 8) % 2;
    for (let cx = 0; cx < BANNER_W; cx++) {
      const dy = cx >= BANNER_W - 3 ? flap * (cx - BANNER_W + 4) % 2 : 0;
      for (let r = 0; r < 7; r++) put(bx + cx, by + r + dy, C.W);
    }
    for (const [dx, dy, k] of BANNER) put(bx + dx + 2, by + 1 + dy, C[k]);
  }

  function draw(t) {
    d.set(base);
    water(t);
    traffic(t);
    brickell(t);
    pelicans(t);
    puraVida(t);
    robot(t);
    boats(t);
    plane(t);
    ctx.putImageData(frame, 0, 0);
  }

  /* ---------- loop: 12 fps, paused off screen and in background tabs ---------- */
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = 6, prev = null, shown = -1, onScreen = true, raf = 0;
  function tick(ts) {
    if (prev !== null) t += Math.min(0.1, (ts - prev) / 1000);
    prev = ts;
    const step = Math.floor(t * FPS);
    if (step !== shown) { shown = step; draw(step / FPS); }
    raf = requestAnimationFrame(tick);
  }
  function run() {
    const want = onScreen && !document.hidden;
    if (want && !raf) { prev = null; raf = requestAnimationFrame(tick); }
    if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function init() {
    ctx.drawImage(img, 0, 0);
    try { base = ctx.getImageData(0, 0, W, H).data.slice(); }
    catch (e) { return; }               // unreadable pixels (e.g. opened from disk): the photo stays
    frame = ctx.createImageData(W, H); d = frame.data;

    const sky = i => base[i] > 150 && base[i] - base[i + 2] > 30;
    for (const [x0, y0, x1, y1] of TOWERS)
      for (let y = y0 + 1; y < y1; y += 3)
        for (let x = x0 + 1; x < x1; x += 2) {
          const i = (y * W + x) * 4;
          if (!sky(i) && 0.3 * base[i] + 0.59 * base[i + 1] + 0.11 * base[i + 2] < 120)
            windows.push({ x, y, on: Math.random() < 0.18, warm: Math.random() < 0.85 });
        }

    draw(still ? 12 : t);
    canvas.classList.add("is-live");
    if (still) return;
    document.addEventListener("visibilitychange", run);
    if ("IntersectionObserver" in window)
      new IntersectionObserver(es => { onScreen = es[0].isIntersecting; run(); }).observe(canvas);
    run();
  }

  const img = new Image();
  img.onload = init;
  img.src = canvas.dataset.src;
})();
