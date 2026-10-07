/* =====================================================================
   Pixel Miami: the profile banner as a live pixel-art scene.
   Brickell from across Biscayne Bay on a bright day, drawn entirely in
   code. Each scene pixel shows as a 2x2 block of CSS pixels, and the
   city is laid out around the banner's center, so a phone shows the
   heart of the skyline and a wider screen adds more city on each side.
   The still parts are painted once into a base layer. Every frame
   copies that layer and paints the moving parts on top.
   ===================================================================== */
(function () {
  "use strict";
  const canvas = document.querySelector(".banner canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const banner = canvas.parentNode;
  const S = 2, H = 84, FPS = 12;          // CSS px per scene pixel, scene height, frame rate
  const GY = 58, SEA = 62, SHORE = 78;    // street level, top of the bay, top of the beach
  const REACH = 270;                      // the city spans -REACH..REACH around the center
  let W = 0, c = 0;                       // scene width and center, set by build()

  /* ---------- palette ---------- */
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const blend = (a, b, f) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * f));
  const C = {};                           // one-letter keys, used by the sprites
  for (const [k, v] of Object.entries({
    w: "#FFFFFF", W: "#FFF8EC", g: "#D5D9E3", G: "#9AA3B5", k: "#3B3550",
    n: "#14306E", o: "#E8B53F", b: "#7DB4E6", B: "#2F6DB5", q: "#4C5A8A",
    p: "#F7A1C0", P: "#E5679A", t: "#7FD6CC", T: "#1FA295", y: "#FFDB6E", r: "#EE6B6B",
    s: "#E9B38F", h: "#4A3A35", L: "#3F9C66", l: "#74C98F", u: "#B9916A", c: "#8A6A45",
    f: "#FF9EBB", F: "#EC7AA2", e: "#FFC9A8", v: "#C9B8F0", D: "#D2E7F5", E: "#E8F4FC",
  })) C[k] = hex(v);
  const N = {};                           // named scene colors
  for (const [k, v] of Object.entries({
    sunCore: "#FFFBE3", sunRing: "#FFF0B5", sunGlow: "#FFF5D2",
    haze: "#C9DFF0", haze2: "#BAD4EA", hazeWin: "#DCEBF6",
    concrete: "#EEEAE3", concreteShade: "#D3CBBF",
    walk: "#F2EDE4", walkLine: "#DDD4C6", wall: "#CFC5B5", wallDark: "#ADA290",
    sand: "#F7E7C1", sandShade: "#EDD7A8", sandWet: "#E2C995",
    roofTeal: "#86D5CC", roofTealShade: "#5DB8AE", crane: "#F7C948", craneDark: "#D9A72B",
    sea1: "#A3E0E8", sea2: "#8AD6E1", sea3: "#72CBDA", sea4: "#5EC0D2", spark: "#F0FCFC",
  })) N[k] = hex(v);
  const SKY = ["#7CC5EE", "#8ECDF1", "#A0D5F3", "#B3DDF5", "#C6E6F7", "#D9EEF8", "#EAF5F7", "#F9F3EA"].map(hex);
  const PAL = {                           // base, shade, windows, highlight
    mint: ["#B6EAD6", "#94D2BC", "#7DB9C9", "#DDF8EE"],
    peach: ["#FFD9C0", "#F1BC9E", "#93BFE6", "#FFEDE0"],
    pink: ["#FBC6D2", "#EAA6B8", "#93BFE6", "#FFE3EA"],
    lav: ["#D7CBF2", "#BBAEE2", "#8DB2E3", "#EEE8FB"],
    butter: ["#FFF0B8", "#EFD891", "#93BFE6", "#FFF9DD"],
    white: ["#F8F7F3", "#DADCE6", "#8DBAE3", "#FFFFFF"],
    glass: ["#A9D6F3", "#86BEE6", "#6EA8DA", "#E2F4FF"],
    teal: ["#A3E2DC", "#80CBC5", "#68AFC9", "#D6F5F2"],
    sand: ["#F3E2C4", "#E2CAA4", "#93BFE6", "#FBF1E0"],
    concrete: ["#E3DED6", "#C5BDB0", "#9E9686", "#F1EEE8"],
  };
  for (const k in PAL) PAL[k] = PAL[k].map(hex);
  const COLORS = ["mint", "peach", "pink", "lav", "butter", "white", "glass", "teal", "sand"];

  /* ---------- tiny pixel toolkit ---------- */
  let d, frame, base, skyMask, seaMask;   // frame bytes, frame, still layer, open sky, open water
  function put(x, y, col, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H || !col) return;
    const i = (y * W + x) * 4;
    if (a === undefined || a >= 1) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; return; }
    d[i] += (col[0] - d[i]) * a; d[i + 1] += (col[1] - d[i + 1]) * a; d[i + 2] += (col[2] - d[i + 2]) * a;
  }
  const get = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  function rect(x0, y0, x1, y1, col) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, col); }
  // ["..ww", ...] becomes a list of [x, y, key]. "." is transparent.
  function sprite(rows, faces = 1) {
    const s = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== ".") s.push([x, y, r[x]]); });
    s.w = Math.max(...rows.map(r => r.length)); s.h = rows.length; s.faces = faces;
    return s;
  }
  // o.flip mirrors the sprite, o.map recolors keys, o.mask keeps it inside open sky
  function blit(s, x, y, o = {}) {
    for (const [dx, dy, k] of s) {
      const px = Math.round(x + (o.flip ? s.w - 1 - dx : dx)), py = Math.round(y + dy);
      if (o.mask && (px < 0 || px >= W || py < 0 || py >= GY || !skyMask[py * W + px])) continue;
      put(px, py, (o.map && o.map[k]) || C[k], o.a);
    }
  }
  function rng(seed) {                    // mulberry32, so the city is the same on every visit
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const pick = (R, list) => list[Math.floor(R() * list.length)];

  /* ---------- 3x5 pixel font, only the characters the scene uses ---------- */
  const FONT = {
    A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."],
    C: [".##", "#..", "#..", "#..", ".##"], E: ["###", "#..", "##.", "#..", "###"],
    F: ["###", "#..", "##.", "#..", "#.."], G: [".##", "#..", "#.#", "#.#", ".##"],
    H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
    K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
    N: ["#..#", "##.#", "#.##", "#..#", "#..#"], O: ["###", "#.#", "#.#", "#.#", "###"],
    P: ["##.", "#.#", "##.", "#..", "#.."], R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."], 0: ["###", "#.#", "#.#", "#.#", "###"],
    3: ["###", "..#", ".##", "..#", "###"], 5: ["###", "#..", "##.", "..#", "##."],
    " ": ["..", "..", "..", "..", ".."],
  };
  // keys holds one palette key per character: text("GO FIU", "ww ooo")
  function text(str, keys) {
    const rows = ["", "", "", "", ""];
    [...str].forEach((ch, i) => {
      for (let y = 0; y < 5; y++) rows[y] += (i ? "." : "") + FONT[ch][y].replace(/#/g, keys[i]);
    });
    return sprite(rows);
  }

  /* ---------- sprites, facing right unless marked -1 ---------- */
  const PLANE = sprite([
    "..........P.",
    "...wwwww..PP",
    ".wbbwwwwwwwP",
    ".wwwwwwwwww.",
    "....k..k....",
  ], -1);
  const BANNERS = [text("VICE CITY", "PPPP TTTT"), text("305", "PPP")];
  const GULL = [sprite(["G.G", ".G."]), sprite(["...", "GGG"])];
  const CAR = sprite(["..wwwwwwww..", ".wbbwbbwbbw.", "wwwwwwwwwwww", "wBBBBBBBBBBw", ".kk......kk."]);
  const PALM = [
    sprite(["....LLL.LLL....", "..LLllLLLllLL..", ".LllL.lLl.LllL.", "Lll...cuc...llL", "Ll.....u.....lL", "L......u......L"]),
    sprite([".....LLL.LLL...", "...LLllLLLllLL.", "..LllL.lLl.LllL", ".Lll..cuc...llL", ".Ll....u.....lL", "..L....u......L"]),
  ];
  const PERSON = [
    sprite([".h.", ".s.", "ttt", ".t.", ".q.", "q.q"]),
    sprite([".h.", ".s.", "ttt", ".t.", ".q.", ".q."]),
  ];
  const DOG = [sprite(["...c", "cccc", "c..c"]), sprite(["...c", "cccc", ".cc."])];
  const ROBOT = [                         // sidewalk delivery robot flying an FIU gold flag
    sprite(["....o", "....G", "wwwwG", "wwwww", ".k.k."]),
    sprite(["....o", "....G", "wwwwG", "wwwww", "k.k.k"]),
  ];
  const FLAMINGO = [
    sprite([".ff...", "kff...", "..f...", "..f...", "..fff.", ".fFFFF", "..fffF", "...F..", "...F..", "...F.."], -1),
    sprite(["......", "......", "......", "..ff..", ".f.ff.", "kf.FFF", "..fffF", "...F..", "...F..", "...F.."], -1),
  ];
  const FLAG = [sprite(["yyyy", "rrr."]), sprite(["yyy.", "rrrr"])];
  const YACHT = sprite([
    "..............k...........",
    "...........wwwww..........",
    "........wwwbbbbbw.........",
    ".....wwwwwwwwwwwwwwww.....",
    "..wwbbbwbbbwbbbwbbbwwwwwww",
    ".wwwwwwwwwwwwwwwwwwwwwwwww",
    "..TTTTTTTTTTTTTTTTTTTTTTT.",
    "...ggggggggggggggggggggg..",
  ]);
  const SAILBOAT = sprite([
    ".......G.......",
    "......wG.......",
    "......wGW......",
    ".....wwGW......",
    ".....wwGWW.....",
    "....wwwGWW.....",
    "....wwwGWWW....",
    "...wwwwGWWW....",
    "...wwwwGWWWW...",
    "..wwwwwGWWWW...",
    "..gggggGgggg...",
    ".......G.......",
    ".ppppppppppppp.",
    "..PPPPPPPPPPP..",
  ]);
  const BARGE = sprite([                  // billboard boat, the panel is filled by the marquee
    "ggggggggggggggggggggggggg.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.....",
    "gnnnnnnnnnnnnnnnnnnnnnnng.ww..",
    "gnnnnnnnnnnnnnnnnnnnnnnngwbbw.",
    "ggggggggggggggggggggggggg.www.",
    "...G.................G...wwww.",
    "wwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ".BBBBBBBBBBBBBBBBBBBBBBBBBBBB.",
  ]);
  const MARQUEE = text("GO FIU PANTHERS", "ww ooo oooooooo");
  const SPEEDBOAT = sprite([
    "......kb.......",
    "..wwwwwwwwwwww.",
    "wwppppppppppwwk",
    ".wwttttttttttwk",
    "..ggggggggggg..",
  ], -1);
  const JETSKI = sprite(["...s....", "...pk...", ".wwwwww.", "yyyyyyyw"]);
  const CRUISE = sprite([
    "................................PP......",
    "................................pp......",
    "..........wwwwwwwwwwwwwwwwwwwwwwppwww...",
    "........wwbwbwbwbwbwbwbwbwbwbwbwbwbwbww.",
    "......wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ".....wbbwbbwbbwbbwbbwbbwbbwbbwbbwbbwbbww",
    "...wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ".wwwbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbww",
    "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
    ".BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "..BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.",
  ], -1);

  /* ---------- the city, in world x (0 is the banner's center) ---------- */
  // lays buildings outward from `from` until the edge of the world
  function row(seed, from, dir, make) {
    const R = rng(seed), out = [];
    for (let cur = from; Math.abs(cur) < REACH;) {
      const b = make(R, Math.abs(cur));
      b.x = dir > 0 ? cur : cur - b.w + 1;
      out.push(b);
      cur += dir * (b.w + b.gap);
    }
    return out;
  }
  const taper = (dist, k) => 1 - k * Math.min(1, dist / REACH);
  function generic(R, dist, hMin, hMax) {
    const pal = pick(R, COLORS), low = R() < 0.16;
    return {
      pal, gap: Math.floor(R() * 2.4),
      w: low ? 16 + Math.floor(R() * 8) : 9 + Math.floor(R() * 8),
      h: low ? 8 + Math.floor(R() * 6) : Math.round((hMin + R() * (hMax - hMin)) * taper(dist, 0.55)),
      style: pal === "glass" ? "glass" : pick(R, ["grid", "bands", "bands", "vertical"]),
      roof: pick(R, ["flat", "flat", "box", "step", "slant", "spire"]),
    };
  }
  const farMake = (R, dist) => ({ w: 5 + Math.floor(R() * 9), gap: R() < 0.3 ? 1 : 0, tone: R() < 0.5,
    h: Math.round((22 + R() * 22) * taper(dist, 0.5)), mast: R() < 0.25 });
  const FAR = [...row(21, 0, 1, farMake), ...row(22, -1, -1, farMake)];
  const BACK = [...row(11, 0, 1, (R, x) => generic(R, x, 18, 40)), ...row(12, -1, -1, (R, x) => generic(R, x, 18, 40))];
  const FRONT = [
    { x: -86, w: 15, h: 26, pal: "mint", style: "bands", roof: "flat" },
    { x: -70, w: 18, h: 30, kind: "atlantis" },
    { x: -51, w: 22, h: 19, kind: "fiu" },
    { x: -28, w: 14, h: 44, pal: "peach", style: "bands", roof: "box" },
    { x: -13, w: 14, h: 52, kind: "panorama" },
    { x: 2, w: 15, h: 38, pal: "glass", style: "glass", roof: "slant", glint: true },
    { x: 18, w: 15, h: 25, kind: "construction" },
    { x: 34, w: 18, h: 33, kind: "miamiTower" },
    { x: 53, w: 13, h: 31, pal: "lav", style: "grid", roof: "step" },
    { x: 67, w: 15, h: 23, pal: "pink", style: "bands", roof: "flat" },
    ...row(13, 83, 1, (R, x) => generic(R, x, 14, 30)),
    ...row(14, -87, -1, (R, x) => generic(R, x, 14, 30)),
  ];
  const STATION = { x: -18, w: 35 };      // Metromover stop
  const CAFE_X = 37;                      // ventanita on the bayfront
  const PALMS = (() => {
    const R = rng(31);
    return [-62, -31, 24, 64, -100, -137, -172, -208, -244, 97, 133, 169, 205, 241]
      .map(x => ({ x, h: 12 + Math.floor(R() * 6), lean: R() < 0.5 ? -1 : 1 }));
  })();
  let glints = [], crane = null;

  /* ---------- painting the still layer ---------- */
  function paintSky() {
    const n = SKY.length;
    for (let y = 0; y < GY; y++) {
      const f = y / (GY - 1) * (n - 1), i = Math.floor(f), fr = f - i;
      for (let x = 0; x < W; x++)
        put(x, y, SKY[Math.min(n - 1, fr > 0.62 || (fr > 0.38 && (x + y) % 2 === 0) ? i + 1 : i)]);
    }
    const sx = Math.min(36, Math.round(W * 0.12)), sy = 12;   // the sun, upper left
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
      const r = Math.hypot(x, y);
      if (r <= 4.5) put(sx + x, sy + y, N.sunCore);
      else if (r <= 6.2) put(sx + x, sy + y, N.sunRing);
      else if (r <= 8.8 && (x + y) % 2 === 0) put(sx + x, sy + y, N.sunGlow);
    }
  }

  function paintFar() {
    for (const b of FAR) {
      const x0 = b.x + c, col = b.tone ? N.haze : N.haze2;
      rect(x0, GY - b.h, x0 + b.w - 1, GY - 1, col);
      for (let y = GY - b.h + 2; y < GY - 2; y += 3)
        for (let x = x0 + 1; x < x0 + b.w - 1; x += 2) if ((x * 7 + y * 3) % 5 < 2) put(x, y, N.hazeWin);
      if (b.mast) for (let k = 1; k <= 3; k++) put(x0 + (b.w >> 1), GY - b.h - k, col);
    }
  }

  // a generic tower: shaded right side, sunlit parapet, a facade pattern and a roof
  function paintTower(b, haze = 0) {
    const P = PAL[b.pal].map(col => haze ? blend(col, N.haze, haze) : col);
    const [body, shade, win, hi] = P;
    const x0 = b.x + c, x1 = x0 + b.w - 1, top = GY - b.h;
    if (x1 < 0 || x0 >= W) return;
    const block = (a, z, y0, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = a; x <= z; x++) put(x, y, x >= z - 1 ? shade : body);
      for (let x = a; x < z - 1; x++) put(x, y0, hi);
    };
    if (b.roof === "box") { block(x0 + 3, x1 - 3, top - 2, top - 1); for (let k = 3; k <= 6; k++) put(x0 + 4, top - k, C.G); }
    else if (b.roof === "step") { block(x0 + 2, x1 - 2, top - 3, top - 1); block(x0 + 4, x1 - 4, top - 5, top - 4); }
    else if (b.roof === "spire") for (let k = 1; k <= 5; k++) put(x0 + (b.w >> 1), top - k, C.G);
    else if (b.roof === "slant")
      for (let k = 1; k <= Math.min(6, b.w >> 1); k++)
        for (let x = x0; x <= x1 - 2 * k; x++) put(x, top - k, x >= x1 - 2 * k - 1 ? shade : k === 6 ? hi : body);
    block(x0, x1, top, GY - 1);
    if (b.style === "grid")
      for (let y = top + 3; y < GY - 3; y += 3) for (let x = x0 + 2; x < x1 - 2; x += 2) { put(x, y, win); put(x, y + 1, win); }
    else if (b.style === "bands")
      for (let y = top + 2; y < GY - 3; y += 3) for (let x = x0 + 1; x < x1 - 1; x++) { put(x, y, win); put(x, y + 1, hi); }
    else if (b.style === "vertical")
      for (let x = x0 + 2; x < x1 - 2; x += 3) for (let y = top + 2; y < GY - 2; y++) put(x, y, win);
    else if (b.style === "glass")
      for (let y = top + 1; y < GY - 1; y++) for (let x = x0; x < x1 - 1; x++) {
        if ((x - x0) % 3 === 2) put(x, y, shade);
        else if ((x - x0 + y) % 13 < 2) put(x, y, hi);
      }
    for (let x = x0 + 1; x < x1 - 1; x++) put(x, GY - 1, shade);   // lobby
    if (b.glint) glints.push({ x0, x1: x1 - 2, top: top + 1 });
  }

  // Atlantis, the Brickell Avenue icon with a hole through the middle,
  // a palm tree and a red spiral stair in its sky court and a red triangle on top
  function paintAtlantis(b) {
    const x0 = b.x + c, x1 = x0 + b.w - 1, top = GY - b.h, hx = x0 + 6, hy = top + 8, hole = [];
    for (let y = hy; y < hy + 7; y++) for (let x = hx; x < hx + 7; x++) if (x >= 0 && x < W) hole.push([x, y, get(x, y)]);
    const glass = hex("#A6D5F3"), line = hex("#86BDE5"), hi = hex("#E2F4FF");
    for (let y = top; y < GY; y++) for (let x = x0; x <= x1; x++)
      put(x, y, x >= x1 - 1 ? line : y === top ? hi : (x - x0) % 3 === 0 || (y - top) % 3 === 0 ? line : glass);
    for (const [x, y, col] of hole) put(x, y, col);
    for (let y = hy + 3; y < hy + 7; y++) put(hx + 2, y, C.u);
    for (const [dx, dy] of [[1, 2], [2, 1], [3, 2], [0, 3], [4, 3], [2, 2]]) put(hx + dx, hy + dy, C.L);
    for (let y = hy; y < hy + 7; y++) put(hx + 5 + (y % 2), y, C.r);
    for (let k = 0; k < 4; k++) for (let x = x1 - 7 + k; x <= x1 - k; x++) put(x, top - 1 - k, C.r);
  }

  function paintPanorama(b) {               // the tallest in Brickell: white fins and blue glass
    const [body, shade, , hi] = PAL.white, x0 = b.x + c, x1 = x0 + b.w - 1, top = GY - b.h;
    for (let k = 4; k <= 9; k++) put(x0 + 6, top - k, C.G);
    rect(x0 + 3, top - 3, x1 - 3, top - 1, body); rect(x1 - 4, top - 3, x1 - 3, top - 1, shade);
    rect(x0, top, x1, GY - 1, body); rect(x1 - 1, top, x1, GY - 1, shade);
    for (let x = x0 + 3; x < x1 - 4; x++) put(x, top - 3, hi);
    for (const dx of [2, 3, 6, 7, 10, 11]) for (let y = top + 2; y < GY - 1; y++) put(x0 + dx, y, PAL.glass[(y - top) % 5 ? 0 : 1]);
    glints.push({ x0: x0 + 1, x1: x1 - 2, top: top + 1 });
  }

  function paintFIU(b) {                    // FIU Downtown on Brickell, with its rooftop sign
    paintTower({ ...b, pal: "white", style: "grid", roof: "flat" });
    const x0 = b.x + c, top = GY - b.h, sign = text("FIU", "ooo");
    put(x0 + 5, top - 1, C.G); put(x0 + 16, top - 1, C.G);
    rect(x0 + 3, top - 8, x0 + 17, top - 2, C.n);
    for (let x = x0 + 3; x <= x0 + 17; x++) put(x, top - 2, C.o);
    blit(sign, x0 + 5, top - 7);
  }

  function paintConstruction(b) {           // a tower going up, because Miami always has one
    const [body, shade, dark, hi] = PAL.concrete, x0 = b.x + c, x1 = x0 + b.w - 1, top = GY - b.h;
    for (let y = top; y < GY; y++) {
      const slab = (GY - y) % 3 === 0, open = y < top + 6;
      for (let x = x0; x <= x1; x++) {
        const column = (x - x0) % 4 === 0 || x === x1;
        if (slab || column) put(x, y, x >= x1 - 1 ? shade : slab ? hi : body);
        else if (!open) put(x, y, y >= GY - 10 ? PAL.glass[(x + y) % 7 ? 0 : 3] : dark);
      }
    }
    const mx = x0 + 9, jy = top - 16;
    for (let y = jy + 1; y < top; y++) { put(mx, y, N.crane); put(mx + 1, y, y % 2 ? N.craneDark : N.crane); }
    put(mx, jy - 1, N.crane); put(mx, jy - 2, N.crane);
    for (let x = mx - 7; x <= mx + 18; x++) { put(x, jy, N.crane); if (x % 2) put(x, jy + 1, N.craneDark); }
    rect(mx - 7, jy + 1, mx - 4, jy + 2, C.G);
    put(mx + 2, jy + 1, C.w); put(mx + 3, jy + 1, C.b); put(mx + 2, jy + 2, C.w); put(mx + 3, jy + 2, C.w);
    crane = { mx, jy };
  }

  function paintMiamiTower(b) {             // stepped, rounded crown, here lit in pastel bands
    paintTower({ ...b, pal: "white", style: "grid", roof: "flat" });
    const x0 = b.x + c, x1 = x0 + b.w - 1, top = GY - b.h;
    [["#F9B8CF", "#E99BB5"], ["#AEE9D2", "#8DD3B9"], ["#AFD8F5", "#8EC2EA"]].forEach(([col, sh], i) => {
      const a = x0 + 2 * i, z = x1 - 2 * i, y1 = top - 1 - 4 * i;
      for (let y = y1 - 3; y <= y1; y++) for (let x = a; x <= z; x++) {
        if (y === y1 - 3 && (x === a || x === z)) continue;
        put(x, y, y === y1 - 3 ? C.w : x >= z - 1 ? hex(sh) : hex(col));
      }
    });
  }

  function paintGuideway() {               // the Metromover track, its pillars and the Brickell stop
    for (let x = 0; x < W; x++) { put(x, 49, N.concrete); put(x, 50, N.concreteShade); }
    for (let wx = -REACH; wx < REACH; wx += 26)
      for (let y = 51; y < GY; y++) { put(wx + c, y, N.concrete); put(wx + c + 1, y, N.concreteShade); }
    const a = STATION.x + c, z = a + STATION.w - 1;
    for (let x = a; x <= z; x++) { put(x, 40, N.roofTeal); put(x, 41, N.roofTealShade); }
    for (let y = 42; y < 49; y++) { put(a + 1, y, N.concrete); put(z - 1, y, N.concreteShade); }
    rect(a + 1, 33, z - 1, 39, C.B);
    blit(text("BRICKELL", "wwwwwwww"), a + 2, 34);
  }

  function paintPromenade() {
    for (let x = 0; x < W; x++) {
      put(x, GY, N.walk); put(x, GY + 1, (x - c) % 6 ? N.walk : N.walkLine);
      put(x, GY + 2, N.wall); put(x, GY + 3, N.wallDark);
    }
    for (const p of PALMS) {                // trunks, crowns sway per frame
      for (let k = 0; k <= p.h; k++) put(p.x + c + Math.round(p.lean * (k / p.h) ** 2 * 2), GY - 1 - k, k % 2 ? C.c : C.u);
    }
    const a = CAFE_X + c;                   // ventanita: striped awning, cafecito sign
    for (let x = a; x < a + 17; x++) {
      put(x, 47, ((x - a) >> 1) % 2 ? C.w : C.p);
      if ((x - a) % 2 === 0) put(x, 48, ((x - a) >> 1) % 2 ? C.w : C.p);
    }
    rect(a, 49, a + 16, 56, C.W); rect(a + 15, 49, a + 16, 56, C.e);
    blit(text("CAFE", "PPPP"), a + 1, 50);
    for (let x = a; x < a + 17; x++) { put(x, 55, C.e); put(x, 57, C.c); }
  }

  function paintSea() {                     // banded turquoise, with the shore mirrored faintly
    const bands = [N.sea1, N.sea2, N.sea3, N.sea4];
    for (let y = SEA; y < SHORE; y++) {
      const f = (y - SEA) / (SHORE - SEA - 1) * 3, i = Math.floor(f), fr = f - i;
      const sy = SEA - 1 - Math.round((y - SEA) * 1.8);
      for (let x = 0; x < W; x++) {
        const col = bands[Math.min(3, fr > 0.62 || (fr > 0.38 && (x + y) % 2 === 0) ? i + 1 : i)];
        put(x, y, sy >= 0 ? blend(col, get(x, sy), 0.16) : col);
      }
    }
  }

  function paintBeach() {
    const R = rng(7);
    for (let y = SHORE; y < H; y++) for (let x = 0; x < W; x++)
      put(x, y, y === SHORE ? N.sandWet : R() < 0.08 ? N.sandShade : N.sand);
    const u = W - 78;                       // umbrella and towel
    for (let y = 70; y < H; y++) put(u, y, C.c);
    [[68, 7], [67, 6], [66, 4], [65, 2]].forEach(([y, r]) => {
      for (let x = u - r; x <= u + r; x++) put(x, y, ((x - u + 8) >> 1) % 2 ? C.w : C.t);
    });
    for (let x = u - 13; x < u - 5; x++) { put(x, 81, (x >> 1) % 2 ? C.p : C.w); put(x, 82, (x >> 1) % 2 ? C.p : C.w); }
    const g = W - 36;                       // lifeguard tower in Miami Beach pastels
    for (let y = 74; y < H; y++) { put(g + 2, y, C.g); put(g + 13, y, C.g); }
    for (let k = 0; k < 9; k++) { put(g + 3 + k, 75 + k, C.g); put(g + 12 - k, 75 + k, C.g); }
    rect(g - 1, 73, g + 16, 73, C.w);
    rect(g + 1, 66, g + 14, 72, C.t); rect(g + 13, 66, g + 14, 72, C.T);
    rect(g + 4, 68, g + 11, 70, C.b); put(g + 7, 68, C.w); put(g + 7, 69, C.w); put(g + 7, 70, C.w);
    rect(g, 65, g + 15, 65, C.P); rect(g + 1, 64, g + 14, 64, C.p); rect(g + 4, 63, g + 11, 63, C.p);
    for (let y = 55; y < 63; y++) put(g + 8, y, C.G);
    for (let k = 0; k < 10; k++) put(g + 16 + k * 0.6, 74 + k, C.w);
  }

  function build() {
    W = Math.max(60, Math.ceil(banner.clientWidth / S)); c = Math.floor(W / 2);
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * S + "px"; canvas.style.height = H * S + "px";
    frame = ctx.createImageData(W, H); d = frame.data;
    glints = []; crane = null;
    paintSky();
    const sky = d.slice();
    paintFar();
    for (const b of BACK) paintTower(b, 0.42);
    for (const b of FRONT) {
      if (b.kind === "atlantis") paintAtlantis(b);
      else if (b.kind === "panorama") paintPanorama(b);
      else if (b.kind === "fiu") paintFIU(b);
      else if (b.kind === "construction") paintConstruction(b);
      else if (b.kind === "miamiTower") paintMiamiTower(b);
      else paintTower(b);
    }
    paintGuideway();
    paintPromenade();
    paintSea();
    const water = d.slice();
    paintBeach();
    base = d.slice();
    seaMask = new Uint8Array(W * H);
    for (let i = W * SEA; i < W * SHORE; i++) seaMask[i] = base[i * 4] === water[i * 4] && base[i * 4 + 2] === water[i * 4 + 2];
    skyMask = new Uint8Array(W * GY);
    for (let i = 0; i < W * GY; i++)
      skyMask[i] = base[i * 4] === sky[i * 4] && base[i * 4 + 1] === sky[i * 4 + 1] && base[i * 4 + 2] === sky[i * 4 + 2];
  }

  /* ---------- moving parts ---------- */
  function cloudShape(R, w) {               // a flat base with round puffs, the biggest mid-cloud
    const h = Math.max(6, Math.min(11, Math.round(w * 0.36))), n = 2 + Math.floor(w / 10), circ = [];
    for (let i = 0; i < n; i++) {
      const mid = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.4, r = Math.max(2.4, (h - 1) * (0.32 + 0.3 * mid) + R() * 0.8 - 0.4);
      circ.push([2 + (i + 0.5) * (w - 4) / n, h - 1.5 - r * 0.55, r]);
    }
    const rows = [];
    for (let y = 0; y < h; y++) {
      let r = "";
      for (let x = 0; x < w; x++) {
        const inside = circ.some(([cx, cy, rad]) => (x + 0.5 - cx) ** 2 + ((y + 0.5 - cy) * 1.15) ** 2 <= rad * rad);
        r += !inside ? "." : y === h - 1 ? "D" : y >= h - 3 ? "E" : "w";
      }
      rows.push(r);
    }
    return sprite(rows);
  }
  const CLOUDS = (() => {
    const R = rng(5), out = [];
    for (let i = 0; i < 7; i++) out.push({ s: cloudShape(R, 14 + Math.floor(R() * 20)), x: R() * 600, y: 3 + Math.floor(R() * 22), v: 0.5 + R() * 1.1 });
    return out;
  })();
  function clouds(t) {
    for (const k of CLOUDS) blit(k.s, (k.x + t * k.v) % (W + 70) - 35, k.y, { mask: true });
  }

  function glint(t) {                       // sunlight sliding down the glass now and then
    glints.forEach((g, i) => {
      const p = (t + i * 3.5) % 8;
      if (p > 1.4) return;
      const pos = p / 1.4 * (g.x1 - g.x0 + 30) - 6;
      for (let y = g.top; y < GY - 1; y++) for (let x = g.x0; x <= g.x1; x++) {
        const k = (x - g.x0) + (y - g.top) * 0.5 - pos;
        if (k >= 0 && k < 2.5) put(x, y, C.w, 0.55);
      }
    });
  }

  function craneMoves(t) {
    if (!crane) return;
    const tx = crane.mx + 5 + Math.round((Math.sin(t * 0.3) + 1) * 6);
    const hy = crane.jy + 3 + Math.round((Math.sin(t * 0.45 + 1) + 1) * 5);
    put(tx, crane.jy + 1, C.k); put(tx + 1, crane.jy + 1, C.k);
    for (let y = crane.jy + 2; y < hy; y++) put(tx, y, C.G);
    for (let x = tx - 2; x <= tx + 2; x++) { put(x, hy, C.p); put(x, hy + 1, C.P); }
  }

  function birds(t) {
    for (let i = 0; i < 3; i++) {
      const x = (t * (5 + i) + i * 140) % (W + 40) - 20, y = 18 + i * 6 + Math.round(Math.sin(t * 0.7 + i * 2));
      blit(GULL[Math.floor(t * 3 + i) % 2], x, y);
    }
  }

  function plane(t) {                       // banner plane, alternating VICE CITY and 305
    const period = 60, lap = Math.floor((t + 8) / period), p = (t + 8) % period;
    const x = W + 2 - Math.round(p * 10), y = 7 + Math.round(Math.sin(t * 2.2) * 0.6);
    const msg = BANNERS[lap % 2], bw = msg.w + 4;
    if (x + 16 + bw < 0) return;
    blit(PLANE, x, y);
    const prop = Math.floor(t * FPS) % 2 ? C.g : C.G;
    put(x, y + 2, prop); put(x, y + 3, prop);
    for (let i = 12; i < 16; i++) put(x + i, y + 2, C.G);
    const bx = x + 16, by = 6 + Math.round(Math.sin(t * 2.2 - 0.9) * 0.6), flap = Math.floor(t * 8) % 2;
    for (let cx = 0; cx < bw; cx++) {
      const dy = cx >= bw - 3 ? flap * (cx - bw + 4) % 2 : 0;
      for (let r = 0; r < 7; r++) put(bx + cx, by + r + dy, r === 0 || r === 6 ? C.g : C.W);
    }
    blit(msg, bx + 2, by + 1);
  }

  function metromover(t) {                  // two cars, stopping at Brickell, alternating direction
    const v = 12, len = 25, run = W + len, stopX = STATION.x + c + (STATION.w >> 1) - 12;
    const period = run / v + 3 + 6, lap = Math.floor(t / period), p = t % period, dir = lap % 2 ? -1 : 1;
    const sStop = dir > 0 ? stopX + len : W - stopX, tStop = sStop / v;
    const s = p < tStop ? p * v : p < tStop + 3 ? sStop : sStop + (p - tStop - 3) * v;
    if (s > run) return;
    const x = dir > 0 ? s - len : W - s;
    blit(CAR, x, 44); blit(CAR, x + 13, 44);
  }

  function palms(t) {
    PALMS.forEach((p, i) => {
      const tx = p.x + c + p.lean * 2, ty = GY - 1 - p.h;
      blit(PALM[Math.sin(t * 1.3 + i * 1.7) > 0.2 ? 1 : 0], tx - 7, ty - 3);
    });
  }

  const WALKERS = [
    { x: 0, v: 3, dir: 1, map: { t: C.p, q: C.q, h: C.h, s: C.s } },
    { x: 150, v: 2.4, dir: -1, map: { t: C.t, q: C.W, h: C.y, s: C.e } },
    { x: 300, v: 5.5, dir: 1, map: { t: C.y, q: C.B, h: C.c, s: C.s } },
    { x: 70, v: 2.2, dir: -1, dog: true, map: { t: C.v, q: C.k, h: C.h, s: C.e } },
  ];
  function promenade(t) {
    for (const p of WALKERS) {
      const run = (p.x + t * p.v) % (W + 30), x = p.dir > 0 ? run - 15 : W + 15 - run, step = Math.floor(t * p.v * 1.5) % 2;
      blit(PERSON[step], x, GY - 6, { map: p.map });
      if (p.dog) blit(DOG[step], x + (p.dir > 0 ? 4 : -5), GY - 3, { flip: p.dir < 0 });
    }
    // delivery robot: from the ventanita to the Metromover stop and back
    const a = CAFE_X + c - 6, z = STATION.x + c + 6, v = 3, leg = (a - z) / v, p = t % (2 * leg + 8);
    let x = a, dir = -1, moving = false;
    if (p < 4) x = a;
    else if (p < 4 + leg) { x = a - (p - 4) * v; moving = true; }
    else if (p < 8 + leg) { x = z; dir = 1; }
    else { x = z + (p - 8 - leg) * v; dir = 1; moving = true; }
    blit(ROBOT[moving ? Math.floor(t * 6) % 2 : 0], x, GY - 5, { flip: dir > 0 });
  }

  let foam = [];
  function sea(t) {
    for (let y = SEA; y < SHORE; y++) {     // ripple the reflections
      const shift = Math.round(Math.sin(t * 1.6 + y * 0.8));
      if (!shift) continue;
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x + shift));
        if (!seaMask[y * W + x] || !seaMask[y * W + sx]) continue;
        const i = (y * W + x) * 4, j = (y * W + sx) * 4;
        d[i] = base[j]; d[i + 1] = base[j + 1]; d[i + 2] = base[j + 2];
      }
    }
    for (let k = 0; k < W / 6; k++) {       // sparkles
      const x = (k * 53 + 17) % W, y = SEA + 1 + (k * 7) % (SHORE - SEA - 2);
      if (Math.sin(t * 2.1 + k * 1.9) > 0.86) { put(x, y, N.spark); put(x + 1, y, N.spark, 0.6); }
    }
  }

  const BOATS = [                           // ordered back to front
    { s: CRUISE, y: 65, v: 6, dir: -1, gap: 70, off: 40, life: 3, n: 1 },
    { s: SAILBOAT, y: 68, v: 3.5, dir: 1, gap: 12, off: 60, life: 2, n: 1 },
    { s: YACHT, y: 70, v: 7, dir: -1, gap: 16, off: 22, life: 2.5, n: 1 },
    { s: BARGE, y: 73, v: 6, dir: 1, gap: 14, off: 10, life: 2, n: 1, marquee: true },
    { s: JETSKI, y: 75, v: 17, dir: 1, gap: 26, off: 3, life: 1.2, n: 2 },
    { s: SPEEDBOAT, y: 77, v: 28, dir: -1, gap: 18, off: 9, life: 1.6, n: 3 },
  ];
  function boats(t) {
    foam = foam.filter(f => t >= f.t0 && t - f.t0 < f.life);
    for (const f of foam) if (f.y >= SEA && f.y < SHORE) put(f.x, f.y, C.w, 0.8 * (1 - (t - f.t0) / f.life));
    for (const b of BOATS) {
      const dur = (W + b.s.w + 2) / b.v, p = (t + b.off) % (dur + b.gap);
      if (p > dur) continue;
      const x = Math.round(b.dir > 0 ? -b.s.w + p * b.v : W - p * b.v), top = b.y - b.s.h + 1;
      const stern = b.dir > 0 ? x : x + b.s.w - 1;
      for (let i = 0; i < b.n; i++)
        foam.push({ x: stern + Math.round(Math.random() * 2 - 1), y: b.y + (Math.random() < 0.5 ? 0 : 1), t0: t, life: b.life });
      blit(b.s, x, top, { flip: b.s.faces !== b.dir });
      if (b.marquee) {
        const scroll = Math.floor(t * 9) % (MARQUEE.w + 23);
        for (const [dx, dy, k] of MARQUEE) {
          const cx = 1 + dx + 23 - scroll;
          if (cx > 0 && cx < 24) put(x + cx, top + 1 + dy, C[k]);
        }
      }
    }
  }

  function beach(t) {
    for (let x = 0; x < W; x++) {           // waves running up the sand
      const wave = Math.sin(x * 0.21 + t * 1.4) + Math.sin(x * 0.07 - t * 0.9);
      if (wave > 0.8) put(x, SHORE - 1, C.w, 0.8);
      if (wave > 1.3) put(x, SHORE, C.w, 0.7);
    }
    [W - 52, W - 59].forEach((x, i) => blit(FLAMINGO[(t * 0.3 + i * 0.6) % 3 < 0.8 ? 1 : 0], x, 70));
    blit(FLAG[Math.floor(t * 5) % 2], W - 36 + 9, 55);
  }

  function draw(t) {
    d.set(base);
    clouds(t);
    glint(t);
    craneMoves(t);
    birds(t);
    plane(t);
    metromover(t);
    palms(t);
    promenade(t);
    sea(t);
    boats(t);
    beach(t);
    ctx.putImageData(frame, 0, 0);
  }

  /* ---------- loop: 12 fps, paused off screen and in background tabs ---------- */
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = 6, prev = null, shown = -1, onScreen = true, raf = 0, resizeTimer = 0;
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

  build();
  draw(still ? 14 : t);
  canvas.classList.add("is-live");
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.ceil(banner.clientWidth / S) !== W) { build(); draw(still ? 14 : Math.floor(t * FPS) / FPS); }
    }, 150);
  });
  if (still) return;
  document.addEventListener("visibilitychange", run);
  if ("IntersectionObserver" in window)
    new IntersectionObserver(es => { onScreen = es[0].isIntersecting; run(); }).observe(canvas);
  run();
})();
