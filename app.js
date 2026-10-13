/* Smart monitoring project site — all motion and numbers are an in-browser simulation. */
(() => {
"use strict";

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad2 = n => String(n).padStart(2, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clock = d => d.toLocaleTimeString("en-GB", { hour12: false });
const icon = id => `<svg><use href="#${id}"/></svg>`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
};

function highlight(code, lang = "py") {
  const kw = lang === "py"
    ? "import|from|if|not|raise|while|True|False|break|print|for|in|try|finally|def|return|as|with|None|and|or|else|elif"
    : "true|false|null";
  const re = new RegExp(`(${lang === "py" ? "#" : "//"}[^\\n]*)|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')|\\b(${kw})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`, "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : "n";
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
const json = o => highlight(JSON.stringify(o, null, 2).replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (_, x) => "[" + x.replace(/\s*\n\s*/g, " ") + "]"), "json");

function onVisible(el, cb) {
  if (!("IntersectionObserver" in window)) { cb(true); return; }
  new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold: 0.05 }).observe(el);
}

/* ================= nav ================= */
const menuBtn = $("#menuBtn"), links = $("#navLinks");
menuBtn.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
$$("a", links).forEach(a => a.addEventListener("click", () => { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }));
if ("IntersectionObserver" in window) {
  const map = new Map($$("a", links).map(a => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { $$("a", links).forEach(a => a.classList.remove("on")); map.get(e.target.id)?.classList.add("on"); }
  }), { rootMargin: "-45% 0px -50% 0px" });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

/* ================= monitoring rules (pure) ================= */
const Rules = {
  dist(p, a, b) { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L; },
  withinSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y; const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / ((dx * dx + dy * dy) || 1); return t >= -0.02 && t <= 1.02; },
  inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
};
const BAND = 10, COOLDOWN = 1.5, DEBOUNCE = 3;
function ruleState() { return { side: new Map(), last: new Map(), zIn: new Map(), zCnt: new Map(), ver: -1 }; }
/** Evaluate line + zone rules for one tracked object; returns new events. */
function evalRules(st, id, p, t, cfg) {
  if (st.ver !== cfg.version) { st.side.clear(); st.zIn.clear(); st.zCnt.clear(); st.ver = cfg.version; }
  const ev = [];
  if (cfg.line.on) {
    const d = Rules.dist(p, cfg.line.a, cfg.line.b);
    if (Math.abs(d) > BAND) {
      const side = d > 0 ? 1 : -1, prev = st.side.get(id);
      st.side.set(id, side);
      if (prev !== undefined && prev !== side && Rules.withinSeg(p, cfg.line.a, cfg.line.b) && t - (st.last.get(id) ?? -1e9) >= COOLDOWN) {
        st.last.set(id, t);
        ev.push({ type: "line", dir: prev === 1 ? "in" : "out" });
      }
    }
  }
  if (cfg.zone.on) {
    const inside = Rules.inPoly(p, cfg.zone.pts), was = st.zIn.get(id) || false;
    const c = inside !== was ? (st.zCnt.get(id) || 0) + 1 : 0;
    st.zCnt.set(id, c);
    if (c >= DEBOUNCE) { st.zIn.set(id, inside); st.zCnt.set(id, 0); ev.push({ type: inside ? "zone_enter" : "zone_exit" }); }
  }
  return ev;
}

/* ================= shared monitoring config ================= */
const W = 1280, H = 720;
const ZONE_PRESETS = {
  gate: { name: "مستطيل البوابة", pts: [[880, 130], [1170, 130], [1170, 390], [880, 390]] },
  corner: { name: "مثلث الركن", pts: [[1250, 80], [1250, 470], [860, 80]] },
  store: { name: "مضلع المخزن", pts: [[840, 120], [1070, 86], [1210, 230], [1130, 420], [890, 400]] },
  narrow: { name: "ممر ضيق", pts: [[960, 60], [1060, 60], [1060, 640], [960, 640]] }
};
const DEFAULT_LINE = () => ({ a: { x: 560, y: 90 }, b: { x: 610, y: 680 } });
const cfg = {
  version: 0,
  line: { ...DEFAULT_LINE(), on: true },
  zone: { preset: "gate", pts: ZONE_PRESETS.gate.pts.map(p => [...p]), on: true },
  boxes: true, ids: true
};
const cfgListeners = new Set();
function cfgChanged(geometry = false) { if (geometry) cfg.version++; cfgListeners.forEach(f => f()); }

/* ================= scene drawing ================= */
const bgCache = new Map();
function sceneBg(w, h) {
  const key = w + "x" + h;
  if (bgCache.has(key)) return bgCache.get(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0a1426"); sky.addColorStop(0.45, "#0b1729"); sky.addColorStop(1, "#060c18");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // building / gate block in the back
  g.fillStyle = "#0f1d33"; g.fillRect(w * 0.05, h * 0.06, w * 0.28, h * 0.3);
  g.fillStyle = "#0d1a2e"; g.fillRect(w * 0.66, h * 0.03, w * 0.32, h * 0.34);
  g.fillStyle = "rgba(120,170,230,.07)";
  for (let i = 0; i < 6; i++) g.fillRect(w * (0.08 + i * 0.04), h * 0.12, w * 0.022, h * 0.05);
  for (let i = 0; i < 6; i++) g.fillRect(w * (0.69 + i * 0.045), h * 0.09, w * 0.025, h * 0.06);
  // ground
  g.fillStyle = "#0a1323"; g.fillRect(0, h * 0.37, w, h * 0.63);
  // road
  g.fillStyle = "#0d1628"; g.fillRect(0, h * 0.6, w, h * 0.28);
  g.strokeStyle = "rgba(160,190,230,.18)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, h * 0.6); g.lineTo(w, h * 0.6); g.moveTo(0, h * 0.88); g.lineTo(w, h * 0.88); g.stroke();
  g.setLineDash([w * 0.04, w * 0.03]); g.strokeStyle = "rgba(230,200,120,.22)";
  g.beginPath(); g.moveTo(0, h * 0.74); g.lineTo(w, h * 0.74); g.stroke(); g.setLineDash([]);
  // sensor noise + scanlines
  g.fillStyle = "rgba(255,255,255,.018)";
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.45)");
  g.fillStyle = vig; g.fillRect(0, 0, w, h);
  bgCache.set(key, c);
  return c;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawBody(g, o) {
  const { x, y, w, h } = o;
  if (o.kind === "vehicle") {
    g.fillStyle = "#2a3a55"; roundRect(g, x - w / 2, y - h * 0.15, w, h * 0.55, h * 0.14); g.fill();
    g.fillStyle = "#33476a"; roundRect(g, x - w * 0.3, y - h * 0.5, w * 0.6, h * 0.42, h * 0.14); g.fill();
    g.fillStyle = "#5d7aa6"; g.fillRect(x - w * 0.25, y - h * 0.43, w * 0.22, h * 0.26); g.fillRect(x + w * 0.03, y - h * 0.43, w * 0.22, h * 0.26);
    g.fillStyle = "#0b0f18";
    g.beginPath(); g.arc(x - w * 0.3, y + h * 0.4, h * 0.13, 0, 7); g.arc(x + w * 0.3, y + h * 0.4, h * 0.13, 0, 7); g.fill();
    g.fillStyle = o.vx > 0 ? "#ffe6a3" : "#ff6b6b"; g.fillRect(o.vx > 0 ? x + w / 2 - 6 : x - w / 2, y, 6, h * 0.12);
  } else {
    const sw = Math.sin(o.phase) * w * 0.18;
    g.strokeStyle = "#3a4d6e"; g.lineWidth = w * 0.22; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y + h * 0.1); g.lineTo(x - sw, y + h * 0.46); g.moveTo(x, y + h * 0.1); g.lineTo(x + sw, y + h * 0.46); g.stroke();
    g.fillStyle = "#43597e"; roundRect(g, x - w * 0.32, y - h * 0.28, w * 0.64, h * 0.42, w * 0.25); g.fill();
    g.fillStyle = "#566d94"; g.beginPath(); g.arc(x, y - h * 0.37, w * 0.24, 0, 7); g.fill();
  }
}
function drawLabel(g, txt, x, y, color, scale) {
  g.font = `600 ${Math.round(15 * scale)}px "JetBrains Mono", ui-monospace, monospace`;
  g.direction = "ltr";
  const tw = g.measureText(txt).width + 12 * scale, th = 22 * scale;
  const lx = clamp(x, 2, g.canvas.width - tw - 2), ly = Math.max(2, y - th);
  g.fillStyle = color; g.fillRect(lx, ly, tw, th);
  g.fillStyle = "#03101f"; g.textBaseline = "middle"; g.fillText(txt, lx + 6 * scale, ly + th / 2 + 1);
}
const COLORS = { person: "#00D9FF", vehicle: "#3d9bff", alert: "#EF4444" };
function drawTrack(g, o, opts, scale = 1) {
  if (opts.ids && o.trail.length > 1) {
    g.strokeStyle = o.inZone ? "rgba(239,68,68,.55)" : "rgba(0,217,255,.35)"; g.lineWidth = 2 * scale; g.setLineDash([4 * scale, 5 * scale]);
    g.beginPath(); o.trail.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.setLineDash([]);
  }
  if (!opts.boxes && !opts.ids) return;
  const col = o.inZone ? COLORS.alert : COLORS[o.kind];
  const bx = o.x - o.w / 2 - 6, by = o.y - o.h / 2 - 8, bw = o.w + 12, bh = o.h + 14;
  if (o.missed) {
    g.strokeStyle = "rgba(160,180,210,.5)"; g.setLineDash([6, 6]); g.lineWidth = 1.5 * scale; g.strokeRect(bx, by, bw, bh); g.setLineDash([]);
    if (opts.ids) drawLabel(g, `${o.label} · predicted`, bx, by, "rgba(160,180,210,.85)", scale);
    return;
  }
  if (opts.boxes) {
    g.strokeStyle = col; g.lineWidth = (o.flash > 0 ? 4 : 2.2) * scale; g.strokeRect(bx, by, bw, bh);
    const c = 12 * scale; g.lineWidth = 4 * scale; g.beginPath();
    g.moveTo(bx, by + c); g.lineTo(bx, by); g.lineTo(bx + c, by);
    g.moveTo(bx + bw - c, by + bh); g.lineTo(bx + bw, by + bh); g.lineTo(bx + bw, by + bh - c); g.stroke();
  }
  const txt = opts.ids ? `${o.label} ${o.conf.toFixed(2)}` : `${o.kind === "person" ? "person" : "vehicle"} ${o.conf.toFixed(2)}`;
  drawLabel(g, txt, bx, by, col, scale);
}
function drawRulesOverlay(g, c, live) {
  if (c.zone.on) {
    g.beginPath(); c.zone.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = live ? "rgba(239,68,68,.16)" : "rgba(239,68,68,.08)"; g.fill();
    g.strokeStyle = "rgba(239,68,68,.85)"; g.lineWidth = 2; g.setLineDash([10, 7]); g.stroke(); g.setLineDash([]);
    const [zx, zy] = c.zone.pts[0];
    g.font = '600 14px "JetBrains Mono", monospace'; g.direction = "ltr"; g.fillStyle = "rgba(255,160,160,.95)"; g.textBaseline = "alphabetic";
    g.fillText("RESTRICTED ZONE", Math.min(zx, W - 170) + 4, zy + 22);
  }
  if (c.line.on) {
    const { a, b } = c.line;
    g.strokeStyle = "rgba(245,158,11,.25)"; g.lineWidth = BAND * 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = "#F59E0B"; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.font = '600 14px "JetBrains Mono", monospace'; g.direction = "ltr"; g.fillStyle = "#ffcc6e"; g.textBaseline = "alphabetic";
    g.fillText("COUNT LINE", a.x + 10, a.y + 18);
  }
}

/* ================= world (object motion + fake detector + tracker) ================= */
class World {
  constructor(w, h, opts = {}) {
    this.w = w; this.h = h; this.opts = Object.assign({ max: 5, spawnEvery: 1.5, rules: true }, opts);
    this.reset();
  }
  reset() { this.objs = []; this.nextId = 1; this.t = 0; this.spawnT = 0.2; this.rs = ruleState(); }
  label(kind, id) { return `${kind === "person" ? "Person" : "Vehicle"} #${pad2(id)}`; }
  spawn(kind = Math.random() < 0.45 ? "vehicle" : "person", forced) {
    const { w, h } = this, id = this.nextId++;
    let o;
    if (kind === "vehicle") {
      const dir = Math.random() < 0.5 ? 1 : -1, y = h * rand(0.67, 0.81), s = 0.75 + 0.5 * y / h;
      o = { kind, x: dir > 0 ? -120 : w + 120, y, vx: dir * rand(110, 170) * (w / 1280), vy: 0, w: 165 * s * w / 1280, h: 84 * s * w / 1280 };
    } else {
      const fromLeft = Math.random() < 0.7, sx = fromLeft ? -40 : w * rand(0.1, 0.4), sy = fromLeft ? h * rand(0.3, 0.55) : h + 60;
      const zc = this.opts.zoneTarget ? this.opts.zoneTarget() : null;
      const goZone = zc && Math.random() < 0.6;
      const tx = goZone ? zc[0] + rand(-60, 60) : w + 80, ty = goZone ? zc[1] + rand(-40, 60) : h * rand(0.2, 0.55);
      const L = Math.hypot(tx - sx, ty - sy), sp = rand(55, 85) * (w / 1280);
      o = { kind, x: sx, y: sy, vx: (tx - sx) / L * sp, vy: (ty - sy) / L * sp, w: 0, h: 0, goal: goZone ? { x: tx, y: ty, wait: rand(1.5, 3) } : null };
    }
    Object.assign(o, { id, label: this.label(kind, id), base: rand(0.74, 0.94), conf: 0.8, phase: 0, trail: [], trailT: 0, missed: false, missT: 0, inZone: false, flash: 0 }, forced || {});
    this.size(o);
    this.objs.push(o);
    return o;
  }
  size(o) {
    if (o.kind === "person") { const s = (0.7 + 0.55 * o.y / this.h) * this.w / 1280; o.w = 44 * s; o.h = 108 * s; }
  }
  anchor(o) { return { x: o.x, y: o.y + o.h / 2 }; }
  /** dt in seconds of simulated time; returns events raised this step */
  step(dt, ruleCfg) {
    this.t += dt;
    const ev = [];
    if (this.opts.spawnEvery && (this.spawnT -= dt) <= 0 && this.objs.length < this.opts.max) { this.spawn(); this.spawnT = this.opts.spawnEvery * rand(0.7, 1.4); }
    for (const o of this.objs) {
      if (o.goal) {
        const dx = o.goal.x - o.x, dy = o.goal.y - o.y;
        if (Math.hypot(dx, dy) < 8) { o.goal.wait -= dt; if (o.goal.wait <= 0) { o.goal = null; const sp = Math.hypot(o.vx, o.vy); o.vx = sp; o.vy = -sp * 0.25; } }
        else { o.x += o.vx * dt; o.y += o.vy * dt; o.phase += dt * 9; }
      } else { o.x += o.vx * dt; o.y += o.vy * dt; o.phase += dt * 9; }
      this.size(o);
      // fake detector: confidence jitter + rare missed frame
      o.conf = clamp(o.base + Math.sin(this.t * 3 + o.id) * 0.035 + rand(-0.015, 0.015), 0.3, 0.99);
      if (o.missed) { if ((o.missT -= dt) <= 0) o.missed = false; }
      else if (Math.random() < dt * 0.25) { o.missed = true; o.missT = 0.35; }
      o.flash = Math.max(0, o.flash - dt);
      if ((o.trailT -= dt) <= 0) { o.trail.push(this.anchor(o)); if (o.trail.length > 28) o.trail.shift(); o.trailT = 0.12; }
      if (this.opts.rules && ruleCfg && !o.missed) {
        for (const e of evalRules(this.rs, o.id, this.anchor(o), this.t, ruleCfg)) {
          if (e.type === "zone_enter") o.inZone = true;
          if (e.type === "zone_exit") o.inZone = false;
          o.flash = 0.4;
          ev.push({ ...e, obj: o });
        }
      }
    }
    if (ruleCfg && !ruleCfg.zone.on) this.objs.forEach(o => (o.inZone = false));
    const { w, h } = this;
    this.objs = this.objs.filter(o => o.x > -260 && o.x < w + 260 && o.y > -220 && o.y < h + 220);
    return ev;
  }
  draw(g, opts, ruleCfg, live) {
    g.drawImage(sceneBg(this.w, this.h), 0, 0);
    if (ruleCfg) drawRulesOverlay(g, ruleCfg, live);
    const sorted = [...this.objs].sort((a, b) => a.y - b.y);
    for (const o of sorted) drawBody(g, o);
    const sc = this.w / 1280;
    for (const o of sorted) drawTrack(g, o, opts, sc * (opts.ls || 1));
    if (ruleCfg && (ruleCfg.line.on || ruleCfg.zone.on)) for (const o of sorted) {
      if (o.missed) continue;
      const p = this.anchor(o); g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
    }
  }
}
const labelScale = cv => clamp(cv.width / (cv.clientWidth || cv.width) * 0.6, 1, 2.4);
const zoneCentroid = () => { const p = cfg.zone.pts; return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]; };

/* ================= A — hero feed ================= */
(function hero() {
  const cv = $("#heroCanvas"), g = cv.getContext("2d");
  const world = new World(cv.width, cv.height, { max: 4, spawnEvery: 1.6, rules: false });
  for (let i = 0; i < 3; i++) { const o = world.spawn(i === 1 ? "vehicle" : "person"); o.x = cv.width * (0.2 + i * 0.25); o.y = i === 1 ? cv.height * 0.72 : cv.height * (0.38 + i * 0.06); }
  let frame = 0, last = 0, visible = true, raf = 0, sweep = 0;
  const fEl = $("#heroFrame");
  function render() {
    world.draw(g, { boxes: true, ids: true, ls: labelScale(cv) }, null, false);
    // scanning sweep
    const y = (sweep % 1) * cv.height;
    const gr = g.createLinearGradient(0, y - 60, 0, y);
    gr.addColorStop(0, "rgba(0,217,255,0)"); gr.addColorStop(1, "rgba(0,217,255,.14)");
    g.fillStyle = gr; g.fillRect(0, y - 60, cv.width, 60);
    g.fillStyle = "rgba(0,217,255,.5)"; g.fillRect(0, y, cv.width, 1.5);
    g.font = '500 13px "JetBrains Mono", monospace'; g.direction = "ltr"; g.fillStyle = "rgba(220,235,255,.75)"; g.textBaseline = "alphabetic";
    g.fillText(new Date().toISOString().slice(0, 19).replace("T", " "), 14, cv.height - 16);
  }
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    world.step(dt); sweep += dt * 0.25; frame++;
    if (frame % 3 === 0) fEl.textContent = "frame " + String(frame).padStart(6, "0");
    render();
    raf = visible ? requestAnimationFrame(loop) : 0;
  }
  if (RM) { world.step(0.01); render(); return; }
  onVisible(cv, v => { visible = v; if (v && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } });
})();

/* ================= B — concepts ================= */
(function concepts() {
  const data = [
    { ic: "i-cam", t: "التقاط الفيديو", s: "Video capture", d: "قراءة الإطارات من كاميرا USB أو كاميرا IP أو ملف مسجّل باستخدام OpenCV. الإطار صورة واحدة من الفيديو، والفيديو تتابع إطارات.", i: "كاميرا / ملف", o: "إطارات صور" },
    { ic: "i-scan", t: "اكتشاف الأجسام", s: "Object detection", d: "نموذج YOLO يحدد في كل إطار مكان الأجسام بصندوق إحاطة، ونوعها (شخص، سيارة…)، ودرجة ثقته في كل كشف.", i: "إطار", o: "صندوق + فئة + ثقة" },
    { ic: "i-route", t: "تتبع الأجسام", s: "Object tracking", d: "الكشف يرى كل إطار وحده. التتبع بـ ByteTrack يربط الكشوفات بين الإطارات ليعطي الجسم نفسه معرّفاً ثابتاً مؤقتاً، مثل Person #03.", i: "كشوفات متتالية", o: "مسارات بمعرّفات" },
    { ic: "i-zone", t: "مراقبة المناطق", s: "Zone monitoring", d: "فحص موضع كل جسم متتبَّع: هل عبر الخط الافتراضي؟ هل دخل المنطقة المحظورة؟ القواعد تعمل على الإحداثيات وليس على الصورة.", i: "مواضع المسارات", o: "تحقّق القاعدة" },
    { ic: "i-bell", t: "توليد الأحداث", s: "Event generation", d: "عندما تتحقق قاعدة يُنشأ حدث منظم: نوعه، ووقته، والكاميرا، ومعرّف الجسم، وفئته. لا يُعدّ الحدث نفسه مرتين.", i: "قاعدة متحققة", o: "سجل حدث JSON" },
    { ic: "i-dash", t: "عرض لوحة التحكم", s: "Dashboard", d: "الأحداث تُحفظ في قاعدة البيانات عبر Laravel، وتعرضها لوحة React كإحصائيات ورسوم بيانية وسجل قابل للفلترة.", i: "أحداث محفوظة", o: "إحصائيات ورسوم" }
  ];
  const wrap = $("#concepts"), det = $("#conceptDetail");
  let cur = 0, timer = 0, userPicked = false;
  wrap.innerHTML = data.map((c, i) => `<button class="concept" data-i="${i}" aria-pressed="false"><span class="n">${pad2(i + 1)}</span><span class="ic">${icon(c.ic)}</span><h3>${c.t}</h3><p class="ltr" style="font-family:var(--f-mono);font-size:11.5px;color:var(--muted)">${c.s}</p></button>`).join("");
  function show(i) {
    cur = i;
    $$(".concept", wrap).forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-pressed", j === i); });
    const c = data[i];
    det.innerHTML = `<div><h3>${pad2(i + 1)} · ${c.t}</h3><p>${c.d}</p><div class="io"><span class="chip">المدخل: ${c.i}</span><span class="chip">المخرج: ${c.o}</span></div></div>
      <div class="ctrl-row"><button class="btn sm" data-a="-1" aria-label="المرحلة السابقة">${icon("i-prev")}</button><button class="btn sm" data-a="1" aria-label="المرحلة التالية">${icon("i-next")}</button></div>`;
  }
  wrap.addEventListener("click", e => { const b = e.target.closest(".concept"); if (b) { userPicked = true; show(+b.dataset.i); } });
  det.addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b) { userPicked = true; show((cur + +b.dataset.a + data.length) % data.length); } });
  show(0);
  if (!RM) onVisible(wrap, v => {
    clearInterval(timer);
    if (v && !userPicked) timer = setInterval(() => { if (userPicked) clearInterval(timer); else show((cur + 1) % data.length); }, 3200);
  });
})();

/* ================= C — architecture ================= */
(function architecture() {
  const TYPES = {
    frame: { c: "#00D9FF", n: "إطارات الفيديو" },
    det: { c: "#3d9bff", n: "نتائج الكشف والتتبع" },
    event: { c: "#F59E0B", n: "بيانات الأحداث" },
    api: { c: "#A78BFA", n: "طلبات API" },
    db: { c: "#22C55E", n: "عمليات قاعدة البيانات" }
  };
  const N = [
    { id: "cam", t: "الكاميرا / فيديو مسجّل", en: "Camera / Video", p: "مصدر الصورة: كاميرا USB، أو كاميرا IP عبر RTSP، أو مسجّل DVR/NVR، أو ملف فيديو.", i: "المشهد الحقيقي", o: "بث فيديو أو ملف", tech: "USB · RTSP · MP4", r: "نقطة البداية؛ النظام لا يتحكم في الكاميرا، بل يقرأ منها." },
    { id: "cap", t: "التقاط الفيديو", en: "Video Capture", p: "فتح المصدر وقراءة الإطارات واحداً تلو الآخر، مع إعادة الاتصال عند الانقطاع.", i: "بث فيديو", o: "إطارات (مصفوفات صور)", tech: "cv2.VideoCapture", r: "يعزل باقي النظام عن نوع المصدر." },
    { id: "py", t: "خدمة المعالجة", en: "Python Service", p: "تنسّق خطوات المعالجة: أخذ عينات الإطارات، وتشغيل النموذج، وتطبيق القواعد، وإرسال النتائج.", i: "إطارات", o: "نتائج منظمة", tech: "Python · FastAPI", r: "منفصلة عن Laravel حتى لا تعطل المعالجة الثقيلة طلبات الويب." },
    { id: "cv", t: "تجهيز الإطار", en: "OpenCV", p: "تغيير حجم الإطار وتحويل ألوانه وتجهيزه بالشكل الذي يتوقعه النموذج.", i: "إطار خام", o: "إطار جاهز للنموذج", tech: "OpenCV · NumPy", r: "يضمن أن كل إطار بالحجم والصيغة الصحيحين." },
    { id: "yolo", t: "اكتشاف الأجسام", en: "YOLO Detection", p: "يحدد مكان كل جسم ونوعه ودرجة الثقة في تمريرة واحدة على الإطار.", i: "إطار جاهز", o: "صناديق + فئات + ثقة", tech: "Ultralytics YOLO", r: "عين النظام؛ لكنه لا يعرف أن الجسم في الإطار التالي هو نفسه." },
    { id: "bt", t: "تتبع الأجسام", en: "ByteTrack", p: "يربط كشوفات كل إطار بالمسارات الموجودة، ويعطي كل جسم معرّفاً مؤقتاً ثابتاً قدر الإمكان.", i: "كشوفات الإطار", o: "مسارات بمعرّفات", tech: "ByteTrack · Kalman", r: "بدونه لا يمكن عدّ جسم مرة واحدة ولا معرفة اتجاه حركته." },
    { id: "rules", t: "قواعد المناطق والخطوط", en: "Zone & Line Rules", p: "يفحص موضع كل مسار مقابل الخطوط والمناطق المحددة، ويمنع العدّ المكرر.", i: "مسارات + إعدادات المناطق", o: "أحداث (عبور، دخول، خروج)", tech: "Python (منطق هندسي)", r: "يحوّل الحركة إلى معنى: «سيارة عبرت البوابة»." },
    { id: "api", t: "واجهة الخادم", en: "Laravel REST API", p: "يستقبل الأحداث، ويتحقق منها، ويطبّق الصلاحيات، ويحفظها، ويقدمها للوحة.", i: "JSON من خدمة Python", o: "استجابات JSON للوحة", tech: "Laravel · Sanctum", r: "المكان الوحيد الذي يكتب في قاعدة البيانات." },
    { id: "db", t: "قاعدة البيانات", en: "MySQL", p: "تخزين الكاميرات والمناطق والأحداث والمستخدمين بشكل دائم.", i: "استعلامات Laravel", o: "سجلات محفوظة", tech: "MySQL 8", r: "تحفظ بيانات صغيرة منظمة، وليس الفيديو الخام." },
    { id: "ui", t: "لوحة التحكم", en: "React Dashboard", p: "تعرض الإحصائيات والأحداث وحالة الكاميرات، وتسمح بتعريف المناطق.", i: "JSON من الـ API", o: "واجهة للمشغّل", tech: "React · TypeScript", r: "ما يراه المستخدم؛ لا تحتوي منطق أعمال." }
  ];
  const E = [
    ["cam", "cap", "frame", "الكاميرا ترسل الإطارات إلى وحدة الالتقاط."],
    ["cap", "py", "frame", "الإطارات تدخل خدمة المعالجة بلغة Python، ولا تخرج منها."],
    ["py", "cv", "frame", "OpenCV يجهّز كل إطار: الحجم وترتيب الألوان."],
    ["cv", "yolo", "frame", "الإطار الجاهز يدخل نموذج YOLO."],
    ["yolo", "bt", "det", "YOLO يُخرج الكشوفات: صندوق + فئة + ثقة."],
    ["bt", "rules", "det", "ByteTrack يحوّل الكشوفات إلى مسارات بمعرّفات ثابتة."],
    ["rules", "api", "event", "عند تحقق قاعدة يُرسل حدث JSON صغير إلى Laravel عبر POST /api/events."],
    ["api", "db", "db", "Laravel يتحقق من الحدث ويحفظه في MySQL."],
    ["api", "ui", "api", "اللوحة تطلب الأحداث والإحصائيات من الـ API وتعرضها."]
  ];
  const svg = $("#archSvg"), cap = $("#archCaption"), panel = $("#archPanel"), counter = $("#archCounter");
  $("#archLegend").innerHTML = Object.values(TYPES).map(t => `<span><i style="background:${t.c}"></i>${t.n}</span>`).join("") + `<span><i style="background:none;border-top:1.5px dashed var(--blue);height:0"></i>حدود خدمة Python</span>`;
  const byId = Object.fromEntries(N.map(n => [n.id, n]));
  let mode = "", L = null, idx = 0, prog = 0, playing = false, stepOnce = false, sel = null, userSel = false, raf = 0, last = 0;
  const lit = new Set();

  function layout(narrow) {
    if (!narrow) return {
      vb: "0 0 1000 470", w: 150, h: 60, fs: 13,
      pos: { cam: [900, 80], cap: [700, 80], py: [500, 80], cv: [300, 80], yolo: [100, 80], bt: [100, 255], rules: [300, 255], api: [580, 255], db: [580, 405], ui: [870, 255] },
      group: "M790 26 H12 V310 H392 V156 H790 Z", gl: [786, 18, "end"]
    };
    const ys = { cam: 46, cap: 156, py: 252, cv: 348, yolo: 444, bt: 540, rules: 636, api: 770, db: 880, ui: 990 };
    return { vb: "0 0 360 1040", w: 240, h: 56, fs: 14, pos: Object.fromEntries(Object.entries(ys).map(([k, y]) => [k, [180, y]])), group: "M18 112 H342 V680 H18 Z", gl: [336, 104, "end"], narrow: true };
  }
  function edgePath(a, b) {
    const [ax, ay] = L.pos[a], [bx, by] = L.pos[b], hw = L.w / 2, hh = L.h / 2;
    if (L.narrow && a === "api" && b === "ui") return `M${ax + hw} ${ay} C ${ax + hw + 46} ${ay}, ${bx + hw + 46} ${by}, ${bx + hw} ${by}`;
    if (Math.abs(bx - ax) > Math.abs(by - ay)) { const s = Math.sign(bx - ax); return `M${ax + s * hw} ${ay} L${bx - s * hw} ${by}`; }
    const s = Math.sign(by - ay); return `M${ax} ${ay + s * hh} L${bx} ${by - s * hh}`;
  }
  function render() {
    const narrow = svg.parentElement.clientWidth < 620;
    const m = narrow ? "n" : "w";
    if (m === mode) return; mode = m; L = layout(narrow);
    svg.setAttribute("viewBox", L.vb);
    const defs = `<defs>${Object.entries(TYPES).map(([k, t]) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="${t.c}"/></marker>`).join("")}</defs>`;
    const group = `<path class="group-box" d="${L.group}"/><text class="group-label" x="${L.gl[0]}" y="${L.gl[1]}" text-anchor="${L.gl[2]}" direction="ltr">Python Processing Service</text>`;
    const edges = E.map(([a, b, t], i) => `<path class="edge" id="edge${i}" d="${edgePath(a, b)}" stroke="${TYPES[t].c}" marker-end="url(#ar-${t})"/>`).join("");
    const nodes = N.map(n => { const [x, y] = L.pos[n.id]; return `<g class="node" data-id="${n.id}" tabindex="0" role="button" aria-label="${n.t}"><rect x="${x - L.w / 2}" y="${y - L.h / 2}" width="${L.w}" height="${L.h}" rx="11"/><text x="${x}" y="${y - 3}" text-anchor="middle" font-size="${L.fs}">${n.t}</text><text class="en" x="${x}" y="${y + 16}" text-anchor="middle" direction="ltr">${n.en}</text></g>`; }).join("");
    svg.innerHTML = defs + group + edges + `<g id="parts"></g>` + nodes;
    paint();
  }
  function paint() {
    $$(".node", svg).forEach(g => { g.classList.toggle("lit", lit.has(g.dataset.id)); g.classList.toggle("sel", g.dataset.id === sel); });
    E.forEach((_, i) => $("#edge" + i, svg)?.classList.toggle("on", i < idx || (i === idx && (playing || prog > 0))));
    counter.textContent = `${Math.min(idx, E.length)} / ${E.length}`;
    const pb = $("#archPlay"); pb.querySelector("span").textContent = playing ? "إيقاف مؤقت" : idx >= E.length ? "أعد التشغيل" : idx > 0 || prog > 0 ? "استئناف" : "تشغيل";
    pb.querySelector("use").setAttribute("href", playing ? "#i-pause" : "#i-play");
  }
  function showPanel(id) {
    const n = byId[id];
    if (!n) { panel.innerHTML = `<h3>اختر مكوّناً</h3><p class="empty">اضغط على أي مربع في المخطط لترى غرضه ومدخلاته ومخرجاته والتقنيات المستخدمة فيه.</p>`; return; }
    panel.innerHTML = `<div><div class="en">${n.en}</div><h3>${n.t}</h3></div>
      <dl><div><dt>الغرض</dt><dd>${n.p}</dd></div><div><dt>المدخلات</dt><dd>${n.i}</dd></div><div><dt>المخرجات</dt><dd>${n.o}</dd></div>
      <div><dt>التقنيات</dt><dd class="ltr" style="font-family:var(--f-mono);font-size:13px;text-align:right">${n.tech}</dd></div><div><dt>الدور في المشروع</dt><dd>${n.r}</dd></div></dl>`;
  }
  function caption(i) {
    if (i >= E.length) { cap.innerHTML = `<span class="k">اكتمل</span><span>وصلت البيانات إلى لوحة التحكم. لاحظ أن الفيديو لم يغادر خدمة Python، وما وصل إلى Laravel هو أحداث JSON فقط.</span>`; return; }
    const [, , t, d] = E[i]; cap.innerHTML = `<span class="k" style="color:${TYPES[t].c}">${pad2(i + 1)} · ${TYPES[t].n}</span><span>${d}</span>`;
  }
  function select(id, manual) { sel = id; if (manual) userSel = true; showPanel(id); paint(); }
  svg.addEventListener("click", e => { const g = e.target.closest(".node"); if (g) select(g.dataset.id, true); });
  svg.addEventListener("keydown", e => { const g = e.target.closest(".node"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.id, true); } });

  function drawParticles() {
    const holder = $("#parts", svg); if (!holder) return;
    if (idx >= E.length || (!playing && prog === 0)) { holder.innerHTML = ""; return; }
    const path = $("#edge" + idx, svg), len = path.getTotalLength(), col = TYPES[E[idx][2]].c;
    const n = E[idx][2] === "frame" ? 3 : 1;
    let s = "";
    for (let k = 0; k < n; k++) {
      const q = prog - k * 0.16; if (q < 0 || q > 1) continue;
      const p = path.getPointAtLength(q * len);
      s += E[idx][2] === "frame" ? `<rect x="${p.x - 7}" y="${p.y - 5}" width="14" height="10" rx="2" fill="${col}" opacity="${1 - k * 0.25}"/>` : `<circle cx="${p.x}" cy="${p.y}" r="6.5" fill="${col}"/><circle cx="${p.x}" cy="${p.y}" r="12" fill="${col}" opacity=".22"/>`;
    }
    holder.innerHTML = s;
  }
  function arrive() {
    const to = E[idx][1]; lit.add(to);
    if (!userSel) { sel = to; showPanel(to); }
    idx++; prog = 0;
    if (idx >= E.length) { playing = false; caption(idx); }
    else { caption(idx); if (stepOnce) { playing = false; stepOnce = false; } }
  }
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (playing) { prog += dt / (RM ? 0.3 : 1.15); if (prog >= 1) arrive(); }
    drawParticles(); paint();
    raf = playing ? requestAnimationFrame(loop) : 0;
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function restart() { idx = 0; prog = 0; lit.clear(); lit.add("cam"); userSel = false; sel = "cam"; showPanel("cam"); caption(0); }
  $("#archPlay").addEventListener("click", () => {
    if (playing) { playing = false; paint(); return; }
    if (idx >= E.length) restart();
    if (idx === 0 && prog === 0) { lit.add("cam"); if (!userSel) { sel = "cam"; showPanel("cam"); } caption(0); }
    stepOnce = false; playing = true; start();
  });
  $("#archStep").addEventListener("click", () => {
    if (idx >= E.length) restart();
    if (idx === 0 && prog === 0) { lit.add("cam"); caption(0); }
    stepOnce = true; playing = true; start();
  });
  $("#archRestart").addEventListener("click", () => { playing = false; restart(); drawParticles(); paint(); });
  showPanel(null);
  render();
  new ResizeObserver(() => { const before = mode; render(); if (before !== mode) drawParticles(); }).observe(svg.parentElement);
})();

/* ================= D — pipeline stepper ================= */
(function pipeline() {
  const A = (s) => RM ? "" : s; // animation snippets dropped when reduced motion
  const frame = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0a1426" stroke="rgba(130,170,230,.3)"/>`;
  const person = (x, y, s = 1, c = "#566d94") => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-30" r="8" fill="${c}"/><rect x="-10" y="-20" width="20" height="30" rx="7" fill="${c}"/><rect x="-8" y="8" width="5" height="20" rx="2" fill="${c}"/><rect x="3" y="8" width="5" height="20" rx="2" fill="${c}"/></g>`;
  const car = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-45" y="-8" width="90" height="26" rx="7" fill="#2a3a55"/><rect x="-26" y="-26" width="52" height="22" rx="7" fill="#33476a"/><circle cx="-26" cy="20" r="7" fill="#0b0f18"/><circle cx="26" cy="20" r="7" fill="#0b0f18"/></g>`;
  const lbl = (x, y, t, c) => `<rect x="${x}" y="${y - 16}" width="${t.length * 7.4 + 12}" height="17" fill="${c}"/><text x="${x + 6}" y="${y - 4}" font-family="JetBrains Mono" font-size="11" font-weight="600" fill="#03101f">${t}</text>`;
  const T = (x, y, t, c = "#9AAAC2", s = 12, a = "middle") => `<text x="${x}" y="${y}" fill="${c}" font-family="JetBrains Mono" font-size="${s}" text-anchor="${a}">${t}</text>`;
  const steps = [
    { t: "مدخل الفيديو", en: "Video Input", d: "الكاميرا أو ملف الفيديو يزوّد النظام بتتابع من الإطارات، بمعدل يتراوح عادةً بين 15 و 30 إطاراً في الثانية حسب المصدر.",
      vis: () => `<g transform="translate(560 130)"><rect x="-50" y="-34" width="80" height="58" rx="10" fill="#13305a" stroke="#00D9FF"/><circle cx="-10" cy="-5" r="17" fill="none" stroke="#00D9FF" stroke-width="3"/><rect x="30" y="-18" width="26" height="26" rx="4" fill="#13305a" stroke="#00D9FF"/></g>
        <g>${A(`<animateTransform attributeName="transform" type="translate" from="0 0" to="-120 0" dur="2.4s" repeatCount="indefinite"/>`)}${[0, 1, 2, 3, 4].map(i => `<g transform="translate(${380 - i * 120} 80)">${frame(0, 0, 100, 100)}${person(40, 70, 0.8)}${T(50, 120, "f" + (1204 + i))}</g>`).join("")}</g>`,
      i: { source: "cv2.VideoCapture(0)", type: "USB webcam" }, o: { frame_index: 1204, shape: [1080, 1920, 3], timestamp_ms: 40133 } },
    { t: "معالجة الإطار", en: "Frame Processing", d: "OpenCV يقرأ الإطار ثم يجهّزه للنموذج: يغيّر حجمه، ويحوّل ترتيب الألوان من BGR إلى RGB، ويضبط القيم.",
      vis: () => `${frame(370, 40, 220, 160)}${person(470, 150, 1.2)}${T(480, 225, "1920×1080 · BGR")}
        <path d="M350 120 H260" stroke="#00D9FF" stroke-width="2" marker-end="url(#pa)"/>${T(305, 108, "resize", "#00D9FF", 11)}
        <g>${frame(90, 60, 140, 140)}${Array.from({ length: 8 }, (_, i) => `<line x1="${90 + i * 17.5}" y1="60" x2="${90 + i * 17.5}" y2="200" stroke="rgba(0,217,255,.12)"/><line x1="90" y1="${60 + i * 17.5}" x2="230" y2="${60 + i * 17.5}" stroke="rgba(0,217,255,.12)"/>`).join("")}${person(160, 160, 0.9)}${A(`<animate attributeName="opacity" values=".4;1;.4" dur="1.6s" repeatCount="indefinite"/>`)}</g>${T(160, 225, "640×640 · RGB", "#00D9FF")}`,
      i: { frame_index: 1204, shape: [1080, 1920, 3], color: "BGR" }, o: { tensor_shape: [1, 3, 640, 640], color: "RGB", normalized: true } },
    { t: "اكتشاف الأجسام", en: "Object Detection", d: "YOLO يحلل الإطار في تمريرة واحدة ويقدّر لكل جسم صندوق إحاطة وفئة ودرجة ثقة. الكشوفات تحت عتبة الثقة تُستبعد.",
      vis: () => `${frame(70, 30, 500, 200)}${person(200, 160, 1.3)}${car(420, 170, 1.2)}
        <rect x="170" y="88" width="62" height="118" fill="none" stroke="#00D9FF" stroke-width="2.5" stroke-dasharray="360" stroke-dashoffset="${RM ? 0 : 360}">${A(`<animate attributeName="stroke-dashoffset" from="360" to="0" dur="1s" fill="freeze" begin="0.2s"/>`)}</rect>${lbl(170, 88, "person 0.91", "#00D9FF")}
        <rect x="358" y="130" width="124" height="76" fill="none" stroke="#3d9bff" stroke-width="2.5" stroke-dasharray="420" stroke-dashoffset="${RM ? 0 : 420}">${A(`<animate attributeName="stroke-dashoffset" from="420" to="0" dur="1s" fill="freeze" begin="0.7s"/>`)}</rect>${lbl(358, 130, "car 0.87", "#3d9bff")}`,
      i: { tensor_shape: [1, 3, 640, 640], conf_threshold: 0.35 }, o: [{ class: "person", conf: 0.91, bbox: [412, 220, 530, 455] }, { class: "car", conf: 0.87, bbox: [690, 300, 930, 450] }] },
    { t: "تتبع الأجسام", en: "Object Tracking", d: "ByteTrack يطابق كشوفات الإطار الحالي مع المسارات السابقة بناءً على الموضع المتوقع والتداخل، فيبقى المعرّف نفسه للجسم نفسه حيثما أمكن.",
      vis: () => `${frame(70, 30, 500, 200)}${[0, 1, 2].map(k => `<g opacity="${0.35 + k * 0.32}">${person(180 + k * 90, 170 - k * 18, 1.05)}<rect x="${154 + k * 90}" y="${104 - k * 18}" width="52" height="98" fill="none" stroke="#00D9FF" stroke-width="2"/></g>`).join("")}
        <path d="M180 200 L270 182 L360 164" stroke="#00D9FF" stroke-dasharray="5 5" fill="none" stroke-width="2"/>${lbl(334, 68, "Person #03", "#00D9FF")}
        ${T(180, 222, "t-2", "#64748B")}${T(270, 222, "t-1", "#64748B")}${T(360, 222, "t", "#E8EDF3")}
        <circle r="5" fill="#fff">${A(`<animateMotion dur="1.8s" repeatCount="indefinite" path="M180 200 L270 182 L360 164"/>`)}</circle>`,
      i: [{ class: "person", conf: 0.91, bbox: [412, 220, 530, 455] }], o: [{ track_id: 3, class: "person", bbox: [412, 220, 530, 455], age_frames: 48 }] },
    { t: "تقييم القواعد", en: "Rule Evaluation", d: "النظام يأخذ النقطة المرجعية لكل مسار (منتصف أسفل الصندوق) ويفحص: هل عبرت الخط؟ هل دخلت المنطقة؟ مع هامش حول الخط حتى لا يُعدّ التذبذب عبوراً.",
      vis: () => `${frame(70, 30, 500, 200)}<polygon points="400,50 550,50 550,210 400,210" fill="rgba(239,68,68,.12)" stroke="#EF4444" stroke-dasharray="8 6"/>${T(475, 70, "zone A", "#ff9d9d", 11)}
        <line x1="300" y1="40" x2="300" y2="220" stroke="rgba(245,158,11,.25)" stroke-width="18"/><line x1="300" y1="40" x2="300" y2="220" stroke="#F59E0B" stroke-width="3"/>${T(300, 238, "count line", "#ffcc6e", 11)}
        <g>${A(`<animateTransform attributeName="transform" type="translate" values="0 0;300 -10;300 -10" keyTimes="0;.8;1" dur="3.2s" repeatCount="indefinite"/>`)}${person(160, 170, 1)}<circle cx="160" cy="198" r="5" fill="#fff"/></g>`,
      i: { track_id: 3, anchor: [471, 455], line: [[600, 40], [600, 700]], zone: "zone A" }, o: { line_cross: { crossed: true, direction: "in" }, zone_A: { inside: true, confirmed_frames: 3 } } },
    { t: "توليد الحدث", en: "Event Generation", d: "تحقق القاعدة يُنتج حدثاً منظماً واحداً. فترة تهدئة لكل معرّف تمنع تسجيل الحدث نفسه مرات متكررة.",
      vis: () => `<g transform="translate(320 130)">${A(`<animateTransform attributeName="transform" type="scale" values="0.6;1.04;1" dur=".6s" fill="freeze" additive="sum"/>`)}<rect x="-190" y="-80" width="380" height="160" rx="14" fill="#0d2a4f" stroke="#EF4444"/>
        ${T(-166, -46, "EVENT · zone_enter", "#ff9d9d", 15, "start")}${T(-166, -14, "track   Person #03", "#E8EDF3", 13, "start")}${T(-166, 12, "camera  CAM-01", "#E8EDF3", 13, "start")}${T(-166, 38, "zone    zone A", "#E8EDF3", 13, "start")}${T(-166, 62, "time    14:32:07.412", "#9AAAC2", 13, "start")}</g>`,
      i: { rule: "zone A", track_id: 3, inside: true }, o: { type: "zone_enter", camera_id: 1, zone_id: 2, track_id: 3, class: "person", occurred_at: "2026-10-13T14:32:07.412Z" } },
    { t: "التواصل مع الخادم", en: "Backend Communication", d: "خدمة Python ترسل الحدث كـ JSON صغير إلى Laravel API، مع مفتاح خدمة للمصادقة. الفيديو لا يُرسل هنا.",
      vis: () => `<g transform="translate(470 130)"><rect x="-80" y="-45" width="160" height="90" rx="12" fill="#13305a" stroke="#00D9FF"/>${T(0, -5, "Python", "#E8EDF3", 15)}${T(0, 18, "AI service", "#9AAAC2", 11)}</g>
        <g transform="translate(150 130)"><rect x="-80" y="-45" width="160" height="90" rx="12" fill="#13305a" stroke="#A78BFA"/>${T(0, -5, "Laravel", "#E8EDF3", 15)}${T(0, 18, "REST API", "#9AAAC2", 11)}</g>
        <path d="M388 120 H234" stroke="#F59E0B" stroke-width="2" marker-end="url(#pa)"/><path d="M234 145 H388" stroke="#22C55E" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#pa)"/>
        ${T(310, 108, "POST /api/events", "#ffcc6e", 11)}${T(310, 166, "201 Created", "#7ee2a2", 11)}
        <rect x="380" y="113" width="18" height="14" rx="3" fill="#F59E0B">${A(`<animate attributeName="x" from="380" to="230" dur="1.4s" repeatCount="indefinite"/>`)}</rect>`,
      i: { method: "POST", url: "/api/events", headers: { "X-Service-Token": "••••••" }, body: { type: "zone_enter", track_id: 3, camera_id: 1 } }, o: { status: 201, data: { id: 5821, type: "zone_enter", stored: true } } },
    { t: "التخزين والعرض", en: "Storage & Visualization", d: "Laravel يحفظ السجل في MySQL، ولوحة React تجلب الأحداث والإحصائيات وتعرضها كأرقام ورسوم بيانية.",
      vis: () => `<g transform="translate(520 130)"><ellipse cx="0" cy="-48" rx="58" ry="16" fill="#0d2a4f" stroke="#22C55E"/><path d="M-58 -48 V48 A58 16 0 0 0 58 48 V-48" fill="#0d2a4f" stroke="#22C55E"/><ellipse cx="0" cy="0" rx="58" ry="16" fill="none" stroke="rgba(34,197,94,.4)"/>${T(0, 82, "MySQL", "#7ee2a2", 12)}</g>
        <path d="M450 130 H330" stroke="#A78BFA" stroke-width="2" marker-end="url(#pa)"/>${T(390, 118, "GET /api/statistics", "#cdbcff", 10)}
        ${frame(70, 50, 240, 160)}${[40, 75, 55, 100, 85, 120].map((h, i) => `<rect x="${92 + i * 34}" y="${190 - h}" width="22" height="${h}" rx="3" fill="${i === 5 ? "#00D9FF" : "#087FF5"}">${A(`<animate attributeName="height" from="0" to="${h}" dur=".8s" begin="${i * 0.08}s" fill="freeze"/><animate attributeName="y" from="190" to="${190 - h}" dur=".8s" begin="${i * 0.08}s" fill="freeze"/>`)}</rect>`).join("")}`,
      i: { query: "events WHERE occurred_at >= today GROUP BY hour" }, o: { events_today: 128, zone_alerts: 9, line_crossings: 87, by_hour: [4, 9, 15, 22] } }
  ];
  const list = $("#pipeSteps");
  list.innerHTML = steps.map((s, i) => `<button role="tab" data-i="${i}" aria-selected="false"><span class="n">${i + 1}</span><span class="t">${s.t}</span></button>`).join("");
  let cur = 0;
  function show(i) {
    cur = clamp(i, 0, steps.length - 1);
    const s = steps[cur];
    $$("button", list).forEach((b, j) => { b.classList.toggle("on", j === cur); b.classList.toggle("done", j < cur); b.setAttribute("aria-selected", j === cur); });
    $("#pipeTitle").innerHTML = `${cur + 1}. ${s.t} <span class="mono" style="font-size:12px;color:var(--muted);font-weight:400">${s.en}</span>`;
    $("#pipeDesc").textContent = s.d;
    $("#pipeVis").innerHTML = `<svg viewBox="0 0 640 260" direction="ltr" role="img" aria-label="${s.t}"><defs><marker id="pa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="#9AAAC2"/></marker></defs><rect width="640" height="260" fill="#03070f"/>${s.vis()}</svg>`;
    $("#pipeIn").innerHTML = json(s.i);
    $("#pipeOut").innerHTML = json(s.o);
    $("#pipeProg").style.width = ((cur + 1) / steps.length * 100) + "%";
    $("#pipePrev").disabled = cur === 0;
    $("#pipeNext").disabled = cur === steps.length - 1;
  }
  list.addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  $("#pipePrev").addEventListener("click", () => show(cur - 1));
  $("#pipeNext").addEventListener("click", () => show(cur + 1));
  show(0);
})();

/* ================= E — simulator ================= */
const Sim = (function simulator() {
  const cv = $("#simCanvas"), g = cv.getContext("2d");
  const world = new World(W, H, { max: 5, spawnEvery: 1.4, rules: true, zoneTarget: zoneCentroid });
  const S = { state: "stopped", speed: 1, log: [], lineIn: 0, lineOut: 0, zoneAlerts: 0, detections: 0, ticks: 0, fps: 0, history: [], secDet: 0, secTicks: 0, secStart: 0, visible: true };
  const listeners = new Set();
  let raf = 0, last = 0, tickAcc = 0, lastUi = 0;
  const TICK = 1 / 15; // simulated inference rate

  function addLog(cls, text) {
    S.log.unshift({ time: new Date(), cls, text });
    if (S.log.length > 80) S.log.pop();
    renderLog();
  }
  function toast(text, cls) {
    const box = $("#simToasts"); if (box.children.length > 2) box.firstElementChild.remove();
    const el = document.createElement("div"); el.className = "toast " + cls; el.textContent = text; box.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  function handle(ev) {
    for (const e of ev) {
      const o = e.obj;
      if (e.type === "line") { e.dir === "in" ? S.lineIn++ : S.lineOut++; addLog("line", `${o.label} عبر الخط — ${e.dir === "in" ? "دخول" : "خروج"}`); toast(`${o.label} عبر الخط`, "line"); }
      else if (e.type === "zone_enter") { S.zoneAlerts++; addLog("zone", `${o.label} دخل المنطقة المحظورة`); toast(`تنبيه: ${o.label} في المنطقة المحظورة`, "zone"); }
      else addLog("exit", `${o.label} خرج من المنطقة`);
    }
  }
  function draw() {
    world.draw(g, { boxes: cfg.boxes, ids: cfg.ids, ls: labelScale(cv) }, cfg, S.state === "running");
    g.font = '500 15px "JetBrains Mono", monospace'; g.direction = "ltr"; g.fillStyle = "rgba(220,235,255,.8)"; g.textBaseline = "alphabetic";
    g.fillText("SIM-CAM · " + new Date().toLocaleString("en-GB", { hour12: false }), 18, H - 20);
    g.fillText(`tracked: ${world.objs.length}   fps: ${S.fps}`, W - 290, H - 20);
  }
  function loop(ts) {
    const real = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (S.state === "running") {
      const dt = real * S.speed;
      handle(world.step(dt, cfg));
      tickAcc += real;
      while (tickAcc >= TICK) { tickAcc -= TICK; S.ticks++; S.secTicks++; const d = world.objs.filter(o => !o.missed).length; S.detections += d; S.secDet += d; }
      if (ts - S.secStart >= 1000) {
        S.fps = S.secTicks; S.history.push(S.secDet); if (S.history.length > 60) S.history.shift();
        S.secDet = 0; S.secTicks = 0; S.secStart = ts;
      }
    }
    if (S.visible) draw();
    if (ts - lastUi > 150) { lastUi = ts; renderStats(); listeners.forEach(f => f()); }
    raf = S.state === "running" ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function setState(st) {
    S.state = st;
    $("#simState").textContent = st.toUpperCase();
    $("#simState").style.color = st === "running" ? "var(--ok)" : st === "paused" ? "var(--warn)" : "var(--soft)";
    $("#simIdle").hidden = st !== "stopped";
    const sb = $("#simStart"); sb.querySelector("span").textContent = st === "stopped" ? "ابدأ" : "إيقاف";
    sb.querySelector("use").setAttribute("href", st === "stopped" ? "#i-play" : "#i-stop");
    sb.classList.toggle("primary", st === "stopped");
    const pb = $("#simPause"); pb.disabled = st === "stopped";
    pb.querySelector("span").textContent = st === "paused" ? "استئناف" : "إيقاف مؤقت";
    pb.querySelector("use").setAttribute("href", st === "paused" ? "#i-play" : "#i-pause");
    listeners.forEach(f => f());
  }
  function start() {
    if (S.state !== "stopped") return;
    S.secStart = performance.now();
    if (!world.objs.length) { world.spawn("person"); world.spawn("vehicle"); }
    setState("running"); addLog("info", "بدأت المحاكاة"); kick();
  }
  function stop() { setState("stopped"); world.objs = []; world.rs = ruleState(); S.fps = 0; addLog("info", "توقفت المحاكاة"); draw(); renderStats(); }
  function pause() { if (S.state === "running") { setState("paused"); renderStats(); } else if (S.state === "paused") { setState("running"); kick(); } draw(); }
  function reset() {
    const wasRunning = S.state === "running";
    world.reset(); Object.assign(S, { log: [], lineIn: 0, lineOut: 0, zoneAlerts: 0, detections: 0, ticks: 0, fps: 0, history: [], secDet: 0, secTicks: 0, secStart: performance.now() });
    renderLog(); renderStats();
    if (wasRunning || S.state === "paused") { setState("stopped"); }
    draw(); listeners.forEach(f => f());
  }
  $("#simStart").addEventListener("click", () => S.state === "stopped" ? start() : stop());
  $("#simStartBig").addEventListener("click", start);
  $("#simPause").addEventListener("click", pause);
  $("#simReset").addEventListener("click", reset);
  $("#simSpeed").addEventListener("input", e => { S.speed = +e.target.value; $("#simSpeedV").textContent = S.speed + "×"; });
  const tog = (id, key, sub) => $(id).addEventListener("click", e => {
    const b = e.currentTarget, v = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", v);
    if (sub) cfg[key][sub] = v; else cfg[key] = v;
    cfgChanged(false);
  });
  tog("#tBoxes", "boxes"); tog("#tIds", "ids"); tog("#tLine", "line", "on"); tog("#tZone", "zone", "on");
  const sel = $("#zonePreset");
  sel.innerHTML = Object.entries(ZONE_PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("") + `<option value="custom" disabled>مخصص (من المحرر)</option>`;
  sel.addEventListener("change", () => setPreset(sel.value));
  $("#logClear").addEventListener("click", () => { S.log = []; renderLog(); listeners.forEach(f => f()); });

  function renderStats() {
    const ids = world.objs.filter(o => !o.missed);
    const avg = ids.length ? ids.reduce((s, o) => s + o.conf, 0) / ids.length : 0;
    $("#simStats").innerHTML = `
      <div class="stat"><div class="v">${world.objs.length}</div><div class="l">أجسام في المشهد</div></div>
      <div class="stat"><div class="v">${ids.length ? avg.toFixed(2) : "—"}</div><div class="l">متوسط الثقة</div></div>
      <div class="stat line"><div class="v">${S.lineIn + S.lineOut}</div><div class="l">عبور الخط (${S.lineIn} دخول · ${S.lineOut} خروج)</div></div>
      <div class="stat crit"><div class="v">${S.zoneAlerts}</div><div class="l">تنبيهات المنطقة</div></div>
      <div class="stat"><div class="v">${S.detections.toLocaleString("en")}</div><div class="l">إجمالي الكشوفات</div></div>
      <div class="stat"><div class="v">${S.state === "running" ? S.fps : 0}</div><div class="l">إطار/ثانية (محاكاة)</div></div>`;
    $("#simIds").innerHTML = world.objs.length
      ? world.objs.map(o => `<span class="chip ltr" style="border-color:${o.inZone ? "rgba(239,68,68,.6)" : o.missed ? "var(--line2)" : "rgba(0,217,255,.35)"}"><i style="background:${o.inZone ? "var(--crit)" : o.missed ? "var(--muted)" : COLORS[o.kind]}"></i>${o.label} ${o.missed ? "lost" : o.conf.toFixed(2)}</span>`).join("")
      : `<span class="empty">لا توجد أجسام متتبَّعة الآن.</span>`;
  }
  function renderLog() {
    $("#simLog").innerHTML = S.log.length
      ? S.log.slice(0, 40).map(l => `<li class="${l.cls}"><time>${clock(l.time)}</time><span>${esc(l.text)}</span></li>`).join("")
      : `<li class="empty" style="background:none;border:none;display:block">السجل فارغ. الأحداث تظهر هنا عند عبور الخط أو دخول المنطقة.</li>`;
  }
  onVisible(cv, v => { S.visible = v; if (v) { draw(); if (S.state === "running") kick(); } });
  cfgListeners.add(() => { sel.value = cfg.zone.preset; if (S.state !== "running") draw(); });
  renderStats(); renderLog(); draw();
  return { S, world, start, onUpdate: f => listeners.add(f), eventsOnly: () => S.log.filter(l => l.cls !== "info") };
})();

function setPreset(key) {
  const p = ZONE_PRESETS[key]; if (!p) return;
  cfg.zone.preset = key; cfg.zone.pts = p.pts.map(q => [...q]);
  cfgChanged(true);
}

/* ================= F — camera guide ================= */
(function cameraGuide() {
  const usbCode = `import cv2

camera = cv2.VideoCapture(0)

if not camera.isOpened():
    raise RuntimeError("Could not open camera")

while True:
    success, frame = camera.read()

    if not success:
        print("Failed to read frame")
        break

    cv2.imshow("Camera Test", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()`;
  const rtspCode = `import os
import cv2

# The stream URL comes from an environment variable — never hardcode credentials.
# Generic format only: rtsp://USERNAME:PASSWORD@CAMERA_IP:554/STREAM_PATH
stream_url = os.environ["CAMERA_RTSP_URL"]

# Prefer TCP for RTSP to reduce corrupted frames on unstable networks
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

camera = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
if not camera.isOpened():
    raise RuntimeError("Could not open stream: check IP, path, credentials, network")

try:
    while True:
        success, frame = camera.read()
        if not success:
            print("Stream read failed (timeout or disconnect)")
            break
        cv2.imshow("IP Camera Test", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
finally:
    camera.release()
    cv2.destroyAllWindows()`;
  const nvrCode = `import os
import cv2

# One recorder channel = one stream. The exact path depends on the device model.
# Generic placeholder: rtsp://USERNAME:PASSWORD@RECORDER_IP:554/CHANNEL_PATH
channel_url = os.environ["NVR_CHANNEL_URL"]
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

camera = cv2.VideoCapture(channel_url, cv2.CAP_FFMPEG)
if not camera.isOpened():
    raise RuntimeError("Could not open recorder channel")

success, frame = camera.read()
print("frame received:", success, None if frame is None else frame.shape)
camera.release()`;
  const fileCode = `import cv2

video = cv2.VideoCapture("sample_video.mp4")
if not video.isOpened():
    raise RuntimeError("Could not open video file: check the path and codec")

fps = video.get(cv2.CAP_PROP_FPS)
frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"FPS: {fps:.1f}  frames: {frames}  duration: {frames / fps:.1f}s")

try:
    while True:
        success, frame = video.read()
        if not success:  # end of file
            break
        cv2.imshow("Recorded Video", frame)
        if cv2.waitKey(int(1000 / fps)) & 0xFF == ord("q"):
            break
finally:
    video.release()
    cv2.destroyAllWindows()`;
  const tail = [
    { ic: "i-cpu", t: "Python + OpenCV", s: "capture", i: "خدمة Python تفتح المصدر بـ cv2.VideoCapture وتقرأ الإطارات في حلقة مستمرة." },
    { ic: "i-scan", t: "معالجة AI", s: "YOLO + ByteTrack", i: "كل إطار (أو كل إطار ثانٍ لتوفير المعالجة) يمر على الكشف ثم التتبع ثم القواعد." },
    { ic: "i-server", t: "الخادم", s: "Laravel API", i: "تصل الأحداث فقط كـ JSON إلى Laravel، فيتحقق منها ويحفظها في MySQL." },
    { ic: "i-dash", t: "لوحة التحكم", s: "React", i: "اللوحة تعرض الأحداث والإحصائيات. الفيديو المباشر يحتاج بوابة WebRTC أو HLS منفصلة." }
  ];
  const tabs = [
    { k: "usb", t: "كاميرا USB", flow: [{ ic: "i-cam", t: "الكاميرا", s: "USB webcam", i: "كاميرا ويب عادية أو مدمجة في اللابتوب. لا تحتاج شبكة." }, { ic: "i-usb", t: "منفذ USB", s: "device index", i: "نظام التشغيل يعطي كل كاميرا رقماً: 0 للأولى، و1 للثانية، وهكذا." }, ...tail],
      steps: ["وصّل الكاميرا بالكمبيوتر الذي ستعمل عليه خدمة Python، وليس جهاز المتصفح.", "تأكد أن نظام التشغيل يتعرف عليها: «إدارة الأجهزة» في Windows، أو <code class=\"ltr\">ls /dev/video*</code> في Linux.", "اسمح للتطبيقات باستخدام الكاميرا من إعدادات الخصوصية، وأغلق أي برنامج آخر يستخدمها.", "جرّب رقم الكاميرا 0 في OpenCV، وإذا لم تعمل جرّب 1 ثم 2.", "شغّل كود الاختبار قبل تفعيل الذكاء الاصطناعي، وتأكد أن الصورة تظهر.", "اطبع أبعاد الإطار ومعدل FPS للتأكد من الدقة المتوقعة."],
      code: usbCode, explain: ["<code class=\"ltr\">VideoCapture(0)</code> يفتح أول كاميرا متصلة.", "<code class=\"ltr\">isOpened()</code> يتأكد أن الكاميرا فُتحت فعلاً قبل القراءة.", "<code class=\"ltr\">read()</code> يرجع نجاح القراءة والإطار نفسه كمصفوفة صورة.", "الضغط على <code class=\"ltr\">q</code> يوقف الحلقة، و<code class=\"ltr\">release()</code> يحرر الكاميرا لباقي البرامج."],
      trouble: [["Could not open camera", "الرقم غير صحيح أو كاميرا أخرى تستخدمها. جرّب 1 أو 2، وأغلق Zoom أو Teams وأي برنامج تصوير."], ["الصورة سوداء", "صلاحيات الخصوصية تمنع الوصول، أو غطاء العدسة مغلق. في Windows فعّل «السماح للتطبيقات بالوصول للكاميرا»."], ["Failed to read frame", "الكاميرا انفصلت أو الكابل ضعيف. جرّب منفذاً آخر، وتجنب موزعات USB بدون طاقة."], ["FPS أقل من المتوقع", "الإضاءة الضعيفة تقلل FPS في كاميرات كثيرة. حسّن الإضاءة أو حدد دقة أقل."]] },
    { k: "ip", t: "كاميرا IP", flow: [{ ic: "i-cam", t: "كاميرا IP", s: "RTSP stream", i: "كاميرا شبكة تبث فيديو مضغوطاً (H.264 أو H.265 غالباً) عبر بروتوكول RTSP." }, { ic: "i-net", t: "الشبكة", s: "LAN · port 554", i: "الكاميرا وجهاز خدمة Python يجب أن يكونا على شبكة يصل فيها أحدهما للآخر." }, ...tail],
      steps: ["وصّل الكاميرا والكمبيوتر بشبكة واحدة يمكن الوصول عبرها، سلكية أو لاسلكية.", "اعرف عنوان IP للكاميرا من تطبيقها الرسمي أو من قائمة الأجهزة في الراوتر.", "ادخل إعدادات الكاميرا الرسمية، وفعّل RTSP، وأنشئ حساب «مشاهدة فقط».", "ابحث في دليل الشركة المصنعة عن مسار بث RTSP الصحيح لطرازك.", "اختبر الرابط أولاً في VLC أو ffprobe، ثم في OpenCV.", "تأكد من المنفذ (غالباً 554)، وتوافق الترميز، وأن البث متاح وغير مستخدم بعدد كبير من الاتصالات.", "لا تفتح الكاميرا على الإنترنت بدون حماية؛ استخدم شبكة داخلية أو VPN."],
      url: "rtsp://USERNAME:PASSWORD@CAMERA_IP:554/STREAM_PATH",
      urlNote: "صيغة عامة للتوضيح فقط. المسار الفعلي والمنفذ يختلفان حسب الشركة المصنعة وإعدادات الكاميرا.",
      code: rtspCode, explain: ["الرابط يُقرأ من متغير بيئة، فلا تظهر كلمة المرور في الكود أو في المستودع.", "<code class=\"ltr\">rtsp_transport;tcp</code> يجعل البث أكثر استقراراً على الشبكات غير المستقرة.", "<code class=\"ltr\">try / finally</code> يضمن تحرير الاتصال حتى لو حدث خطأ.", "لا تطبع الرابط في السجلات؛ إن احتجت، أخفِ <code class=\"ltr\">user:pass@</code> أولاً."],
      trouble: [["عنوان IP خاطئ", "تأكد من العنوان بـ ping. الكاميرات قد تأخذ عنواناً جديداً من الراوتر؛ ثبّت لها عنواناً (Static IP)."], ["بيانات الدخول خاطئة", "تحقق من الحساب في إعدادات الكاميرا. الحروف الخاصة في كلمة المرور (@ : /) يجب ترميزها في الرابط."], ["مسار RTSP خاطئ", "كل شركة لها مسار مختلف، وأحياناً لكل جودة مسار. ارجع لدليل الطراز نفسه."], ["عزل الشبكة", "شبكات الضيوف أو VLAN مختلفة تمنع الأجهزة من رؤية بعضها. ضع الجهازين على الشبكة نفسها."], ["جدار الحماية", "اسمح باتصالات المنفذ 554 في جدار حماية الجهاز والراوتر."], ["ترميز غير مدعوم", "بعض كاميرات H.265 تحتاج إصدار FFmpeg يدعمه. جرّب البث الثانوي بترميز H.264."], ["انتهاء المهلة", "الكاميرا مشغولة أو بعيدة أو الشبكة مزدحمة. استخدم TCP، وأعد المحاولة بتأخير متزايد."], ["تأخير كبير", "استخدم البث الثانوي بدقة أقل، واقرأ أحدث إطار فقط بدل تجميع الإطارات القديمة."]] },
    { k: "nvr", t: "مسجّل DVR / NVR", flow: [{ ic: "i-cam", t: "كاميرات CCTV", s: "analog / IP", i: "كاميرات موصولة بمسجّل مراقبة موجود مسبقاً." }, { ic: "i-rec", t: "المسجّل", s: "DVR / NVR", i: "المسجّل يتيح كل كاميرا كقناة بث RTSP خاصة بها عبر الشبكة." }, ...tail],
      steps: ["اعرف عنوان المسجّل على الشبكة من شاشته أو من الراوتر.", "من إعدادات المسجّل الرسمية، فعّل الوصول للبث، واستخدم حساباً بصلاحيات مشاهدة فقط.", "حدد رقم القناة المطلوبة (الكاميرا التي تريد تحليلها).", "احصل على مسار RTSP الصحيح من دليل الشركة المصنعة للمسجّل وطرازه.", "اختبر القناة وحدها في VLC أو OpenCV قبل دمجها في مسار الذكاء الاصطناعي."],
      url: "rtsp://USERNAME:PASSWORD@RECORDER_IP:554/CHANNEL_PATH",
      urlNote: "لا يوجد مسار RTSP واحد يعمل مع كل المسجّلات. الصيغة الدقيقة ورقم القناة يعتمدان على الجهاز.",
      code: nvrCode, explain: ["كل قناة في المسجّل بث مستقل له مساره.", "الكود يقرأ إطاراً واحداً ويطبع أبعاده كاختبار سريع للقناة.", "المسجّلات تحدّ عدد الاتصالات المتزامنة؛ أغلق الاتصال بعد الاختبار."],
      trouble: [["القناة لا تفتح", "رقم القناة أو المسار غير صحيح. بعض الأجهزة تبدأ العد من 1 وبعضها من 101 أو صيغة مختلفة."], ["رفض الاتصال", "الوصول للبث غير مفعّل في المسجّل، أو الحساب بدون صلاحية مشاهدة."], ["صورة متقطعة", "المسجّل يرسل البث الرئيسي بدقة عالية. استخدم البث الفرعي للتحليل."]] },
    { k: "file", t: "فيديو مسجّل", flow: [{ ic: "i-file", t: "ملف فيديو", s: "MP4 · AVI · MKV", i: "أسهل طريقة للتطوير والاختبار: نتيجة قابلة للتكرار على نفس الفيديو." }, { ic: "i-film", t: "القرص", s: "file path", i: "مسار الملف نسبي لمكان تشغيل السكربت أو مسار كامل." }, ...tail],
      steps: ["ضع ملف الفيديو في مجلد المشروع أو حدد مساره الكامل.", "استخدم صيغة شائعة مثل MP4 بترميز H.264 لتجنب مشاكل الترميز.", "اقرأ FPS وعدد الإطارات لحساب مدة الفيديو وتقدم المعالجة.", "عالج الإطارات بالتسلسل حتى نهاية الملف.", "حرر الملف بعد الانتهاء بـ release()."],
      code: fileCode, explain: ["<code class=\"ltr\">VideoCapture(\"sample_video.mp4\")</code> يفتح الملف بدل الكاميرا.", "<code class=\"ltr\">CAP_PROP_FPS</code> و <code class=\"ltr\">CAP_PROP_FRAME_COUNT</code> يعطيان المعدل وعدد الإطارات.", "انتهاء القراءة بدون نجاح يعني الوصول لنهاية الملف.", "الانتظار بمقدار <code class=\"ltr\">1000 / fps</code> يعرض الفيديو بسرعته الطبيعية."],
      trouble: [["Could not open video file", "المسار غير صحيح نسبةً لمكان تشغيل السكربت، أو اسم الملف به خطأ."], ["الملف يفتح لكن لا توجد إطارات", "الترميز غير مدعوم في إصدار OpenCV المثبت. حوّل الملف إلى MP4 H.264 بـ ffmpeg."], ["FPS يظهر 0", "بعض الملفات لا تحفظ المعدل. استخدم قيمة افتراضية مثل 25 واحسب الوقت من رقم الإطار."]] }
  ];
  const tabsEl = $("#camTabs"), body = $("#camBody");
  tabsEl.innerHTML = tabs.map((t, i) => `<button role="tab" id="camTab-${t.k}" aria-selected="${i === 0}" data-i="${i}">${t.t}</button>`).join("");
  function show(i) {
    const t = tabs[i];
    $$("button", tabsEl).forEach((b, j) => b.setAttribute("aria-selected", j === i));
    body.innerHTML = `
      <div class="glass flow" role="tabpanel" aria-labelledby="camTab-${t.k}">
        <div class="flow-row">${t.flow.map((f, j) => `${j ? '<span class="flow-link" aria-hidden="true"></span>' : ""}<button class="flow-step${j === 0 ? " on" : ""}" data-j="${j}"><span class="ic">${icon(f.ic)}</span>${f.t}<small class="ltr">${f.s}</small></button>`).join("")}</div>
        <div class="flow-info" id="flowInfo">${t.flow[0].i}</div>
      </div>
      <div class="cam-grid">
        <div class="glass card"><h3>خطوات التوصيل</h3><ol class="steps-list">${t.steps.map(s => `<li><span>${s}</span></li>`).join("")}</ol>
          ${t.url ? `<div style="margin-top:14px"><pre class="code">${esc(t.url)}</pre><p style="font-size:12.5px;color:var(--warn);margin-top:6px">${t.urlNote}</p></div>` : ""}</div>
        <div class="glass card"><h3>كود الاختبار <span class="tag">Python · OpenCV</span></h3>
          <div class="code-box"><button class="btn sm copy" data-copy>نسخ</button><pre class="code" id="camCode">${highlight(t.code)}</pre></div>
          <ul class="clean explain">${t.explain.map(e => `<li>${e}</li>`).join("")}</ul></div>
      </div>
      <div class="glass card"><h3>حل المشاكل الشائعة</h3>${t.trouble.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`;
    body.dataset.code = t.code;
    $$(".flow-step", body).forEach(b => b.addEventListener("click", () => {
      $$(".flow-step", body).forEach(x => x.classList.remove("on")); b.classList.add("on");
      $("#flowInfo").textContent = t.flow[+b.dataset.j].i;
    }));
    $("[data-copy]", body).addEventListener("click", e => copy(body.dataset.code, e.currentTarget, $("#camCode")));
  }
  tabsEl.addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  tabsEl.addEventListener("keydown", e => {
    const cur = $$("button", tabsEl).findIndex(b => b.getAttribute("aria-selected") === "true");
    const d = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (d) { const n = (cur + d + tabs.length) % tabs.length; show(n); $$("button", tabsEl)[n].focus(); }
  });
  show(0);
})();
function copy(text, btn, pre) {
  const done = ok => { btn.textContent = ok ? "تم النسخ" : "حدّد النص يدوياً"; setTimeout(() => (btn.textContent = "نسخ"), 1600); };
  try {
    navigator.clipboard.writeText(text).then(() => done(true), () => { selectText(pre); done(false); });
  } catch { selectText(pre); done(false); }
}
function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

/* ================= G — dashboard ================= */
(function dashboard() {
  const S = Sim.S;
  const demoCams = [
    { id: "cam2", n: "بوابة المخزن", src: "rtsp · CAM_IP:554", st: "unknown" },
    { id: "cam3", n: "مدخل المكتب", src: "usb · index 1", st: "unknown" }
  ];
  $("#dashRun").addEventListener("click", () => { if (S.state === "stopped") Sim.start(); else $("#simPause").click(); });
  $("#dashCams").addEventListener("click", e => {
    const b = e.target.closest("[data-test]"); if (!b) return;
    const c = demoCams.find(x => x.id === b.dataset.test); c.st = "testing"; renderCams();
    setTimeout(() => { c.st = "fail"; renderCams(); }, 1300);
  });
  function renderCams() {
    const live = S.state === "running";
    const simRow = `<div class="cam-item"><span class="dot ${live ? "ok" : S.state === "paused" ? "warn" : ""}"></span><div>المحاكي<small class="ltr" style="text-align:right">SIM-CAM · browser</small></div><span class="badge ${live ? "line" : ""}" style="${live ? "" : "color:var(--muted)"}">${live ? "متصل" : S.state === "paused" ? "متوقف مؤقتاً" : "متوقف"}</span></div>`;
    $("#dashCams").innerHTML = simRow + demoCams.map(c => `<div class="cam-item"><span class="dot ${c.st === "fail" ? "crit" : c.st === "testing" ? "warn" : ""}"></span><div>${c.n}<small class="ltr" style="text-align:right">${c.src}</small>${c.st === "fail" ? `<small style="color:#ff9d9d;font-family:var(--f-body)">لا يمكن الاختبار من المتصفح: يحتاج خدمة Python متصلة بالكاميرا.</small>` : ""}</div><button class="btn sm" data-test="${c.id}" ${c.st === "testing" ? "disabled" : ""}>${c.st === "testing" ? "جاري الاختبار…" : "اختبار الاتصال"}</button></div>`).join("");
  }
  function chart() {
    const data = S.history.slice(-60), w = 600, h = 200, pl = 36, pb = 22, pt = 10;
    if (data.length < 2) { $("#dashChart").innerHTML = `<div style="height:200px;display:grid;place-items:center;color:var(--muted);font-size:13.5px;text-align:center">لا توجد بيانات بعد.<br>شغّل المحاكي وسيظهر الرسم خلال ثوانٍ.</div>`; return; }
    const max = Math.max(10, ...data), step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
    const top = Math.ceil(max / step) * step;
    const x = i => pl + (i / 59) * (w - pl - 8), y = v => pt + (1 - v / top) * (h - pt - pb);
    const off = 60 - data.length;
    const pts = data.map((v, i) => [x(i + off), y(v)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${h - pb} L${pts[0][0].toFixed(1)} ${h - pb} Z`;
    let grid = "";
    for (let v = 0; v <= top; v += step) grid += `<line x1="${pl}" x2="${w - 8}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(130,170,230,.1)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#64748B" font-family="JetBrains Mono">${v}</text>`;
    const lp = pts[pts.length - 1];
    $("#dashChart").innerHTML = `<svg viewBox="0 0 ${w} ${h}" direction="ltr" role="img" aria-label="رسم الكشوفات لكل ثانية"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00D9FF" stop-opacity=".3"/><stop offset="1" stop-color="#00D9FF" stop-opacity="0"/></linearGradient></defs>${grid}
      <text x="${pl}" y="${h - 5}" font-size="10" fill="#64748B" font-family="JetBrains Mono">-60s</text><text x="${w - 8}" y="${h - 5}" text-anchor="end" font-size="10" fill="#64748B" font-family="JetBrains Mono">now</text>
      <path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="#00D9FF" stroke-width="2"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="#00D9FF"/><text x="${lp[0] - 8}" y="${lp[1] - 9}" text-anchor="end" font-size="11" fill="#E8EDF3" font-family="JetBrains Mono">${data[data.length - 1]}/s</text></svg>`;
  }
  let lastRender = 0, pending = 0;
  function render(force) {
    const now = performance.now();
    if (!force && now - lastRender < 500) { if (!pending) pending = setTimeout(() => { pending = 0; render(true); }, 520 - (now - lastRender)); return; }
    lastRender = now;
    const live = S.state === "running", ev = Sim.eventsOnly();
    const today = new Date().toDateString();
    const evToday = ev.filter(e => e.time.toDateString() === today).length;
    const proc = $("#dashProc"); proc.innerHTML = `<i style="background:${live ? "var(--ok)" : S.state === "paused" ? "var(--warn)" : "var(--muted)"}"></i>${live ? "المعالجة تعمل" : S.state === "paused" ? "المعالجة متوقفة مؤقتاً" : "المعالجة متوقفة"}`;
    const rb = $("#dashRun"); rb.querySelector("span").textContent = S.state === "stopped" ? "تشغيل المحاكي" : S.state === "paused" ? "استئناف" : "إيقاف مؤقت";
    rb.querySelector("use").setAttribute("href", live ? "#i-pause" : "#i-play");
    const k = (l, v, s, dot) => `<div class="kpi"><span class="l">${dot ? `<span class="dot ${dot}"></span>` : ""}${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    $("#dashKpis").innerHTML =
      k("حالة الكاميرا", live ? "متصلة" : "—", "SIM-CAM", live ? "ok" : "") +
      k("حالة المعالجة", live ? "تعمل" : S.state === "paused" ? "مؤقت" : "متوقفة", "خدمة محاكاة", live ? "ok" : S.state === "paused" ? "warn" : "") +
      k("FPS", live ? S.fps : 0, "إطارات معالجة/ثانية") +
      k("الكشوفات", S.detections.toLocaleString("en"), "منذ بدء الجلسة") +
      k("المتتبَّعة الآن", Sim.world.objs.length, "أجسام بمعرّف") +
      k("أحداث اليوم", evToday, "من سجل المحاكي") +
      k("تنبيهات المنطقة", S.zoneAlerts, "دخول المنطقة المحظورة", S.zoneAlerts ? "crit" : "") +
      k("عبور الخط", S.lineIn + S.lineOut, `${S.lineIn} دخول · ${S.lineOut} خروج`);
    chart(); renderCams();
    $("#dashRecent").innerHTML = ev.length ? ev.slice(0, 6).map(e => `<div class="row"><span class="badge ${e.cls}">${e.cls === "zone" ? "منطقة" : e.cls === "line" ? "خط" : "خروج"}</span><span>${esc(e.text)}</span><time>${clock(e.time)}</time></div>`).join("")
      : `<div style="color:var(--muted);font-size:13px;padding:6px 2px">لا توجد أحداث بعد. شغّل المحاكي وانتظر عبور جسم للخط أو دخوله المنطقة.</div>`;
  }
  Sim.onUpdate(() => render(false));
  render(true);
})();

/* ================= H — zone editor ================= */
(function zoneEditor() {
  const cv = $("#zedCanvas"), g = cv.getContext("2d");
  const world = new World(W, H, { max: 1, spawnEvery: 0, rules: true });
  let drag = null, testing = false, raf = 0, last = 0;
  const logEl = $("#zedLog");
  const log = (t, c = "") => { logEl.insertAdjacentHTML("afterbegin", `<div style="${c}"><span class="mono" style="color:var(--muted);font-size:11px">${clock(new Date())}</span> ${esc(t)}</div>`); };
  logEl.innerHTML = `<div style="color:var(--muted)">اضغط «أرسل جسم اختبار» ليمر شخص عبر الخط ثم داخل المنطقة.</div>`;
  $("#zedPresets").innerHTML = Object.entries(ZONE_PRESETS).map(([k, p]) => `<button class="btn sm" data-p="${k}" aria-pressed="${k === cfg.zone.preset}">${p.name}</button>`).join("");
  $("#zedPresets").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) setPreset(b.dataset.p); });
  function handles() {
    const hs = [];
    if (cfg.line.on) { hs.push({ t: "line", k: "a", x: cfg.line.a.x, y: cfg.line.a.y }, { t: "line", k: "b", x: cfg.line.b.x, y: cfg.line.b.y }); }
    if (cfg.zone.on) cfg.zone.pts.forEach(([x, y], i) => hs.push({ t: "zone", k: i, x, y }));
    return hs;
  }
  function draw() {
    world.draw(g, { boxes: true, ids: true, ls: labelScale(cv) }, cfg, true);
    for (const h of handles()) {
      const active = drag && drag.t === h.t && drag.k === h.k;
      g.fillStyle = active ? "#00D9FF" : "#fff"; g.strokeStyle = h.t === "line" ? "#F59E0B" : "#EF4444"; g.lineWidth = 3;
      g.beginPath(); g.arc(h.x, h.y, active ? 13 : 10, 0, 7); g.fill(); g.stroke();
    }
    g.font = '500 15px "JetBrains Mono", monospace'; g.direction = "ltr"; g.fillStyle = "rgba(220,235,255,.75)"; g.textBaseline = "alphabetic";
    g.fillText("EDIT MODE · drag the white handles", 18, H - 20);
  }
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  cv.addEventListener("pointerdown", e => {
    const p = pos(e), r = cv.getBoundingClientRect(), tol = 26 * W / r.width;
    const h = handles().find(q => Math.hypot(q.x - p.x, q.y - p.y) < tol);
    if (h) { drag = h; cv.setPointerCapture(e.pointerId); e.preventDefault(); draw(); }
  });
  cv.addEventListener("pointermove", e => {
    if (!drag) { const p = pos(e), r = cv.getBoundingClientRect(); cv.style.cursor = handles().some(q => Math.hypot(q.x - p.x, q.y - p.y) < 26 * W / r.width) ? "grab" : "crosshair"; return; }
    const p = pos(e), x = clamp(p.x, 4, W - 4), y = clamp(p.y, 4, H - 4);
    if (drag.t === "line") cfg.line[drag.k] = { x, y };
    else { cfg.zone.pts[drag.k] = [x, y]; cfg.zone.preset = "custom"; }
    cfgChanged(true);
  });
  const end = () => { if (drag) { drag = null; draw(); } };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  const syncBtns = () => {
    $("#zLine").setAttribute("aria-pressed", cfg.line.on); $("#zZone").setAttribute("aria-pressed", cfg.zone.on);
    $("#tLine").setAttribute("aria-pressed", cfg.line.on); $("#tZone").setAttribute("aria-pressed", cfg.zone.on);
    $$("#zedPresets [data-p]").forEach(b => b.setAttribute("aria-pressed", b.dataset.p === cfg.zone.preset));
  };
  $("#zLine").addEventListener("click", () => { cfg.line.on = !cfg.line.on; cfgChanged(false); });
  $("#zZone").addEventListener("click", () => { cfg.zone.on = !cfg.zone.on; cfgChanged(false); });
  $("#zReset").addEventListener("click", () => { Object.assign(cfg.line, DEFAULT_LINE(), { on: true }); cfg.zone.on = true; setPreset("gate"); log("أُعيد الخط والمنطقة إلى الوضع الافتراضي."); });
  $("#zTest").addEventListener("click", () => {
    world.reset();
    const [cx, cy] = zoneCentroid();
    const sx = -40, sy = clamp(cy + 40, 120, H - 120), L = Math.hypot(cx - sx, cy - sy), sp = 170;
    const o = world.spawn("person", { x: sx, y: sy, vx: (cx - sx) / L * sp, vy: (cy - 40 - sy) / L * sp * 0.6, goal: { x: cx, y: cy - 40, wait: 1 }, base: 0.9 });
    o.missed = false;
    world.objs.forEach(q => (q.missT = 0));
    testing = true; $("#zTest").disabled = true;
    log(`بدأ الاختبار: ${o.label} يتحرك نحو المنطقة.`);
    if (!cfg.line.on && !cfg.zone.on) log("الخط والمنطقة معطّلان، لن يُسجّل أي حدث.", "color:var(--warn)");
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  });
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    // keep the test deterministic: no random missed frames
    world.objs.forEach(o => { o.missed = false; });
    for (const e of world.step(dt, cfg)) {
      const o = e.obj;
      if (e.type === "line") log(`حدث: ${o.label} عبر الخط (${e.dir === "in" ? "دخول" : "خروج"}) — سُجّل مرة واحدة.`, "border-inline-start:3px solid var(--blue)");
      if (e.type === "zone_enter") log(`حدث: ${o.label} دخل المنطقة بعد تأكيد ${DEBOUNCE} إطارات.`, "border-inline-start:3px solid var(--crit)");
      if (e.type === "zone_exit") log(`حدث: ${o.label} خرج من المنطقة.`, "border-inline-start:3px solid var(--warn)");
    }
    world.objs.forEach(o => (o.missed = false));
    draw();
    if (testing && !world.objs.length) { testing = false; $("#zTest").disabled = false; log("انتهى الاختبار: خرج الجسم من المشهد."); }
    raf = testing ? requestAnimationFrame(loop) : 0;
  }
  cfgListeners.add(() => { syncBtns(); if (!testing) draw(); });
  syncBtns(); draw();
})();

/* ================= I — technologies ================= */
(function techs() {
  const T = [
    { n: "Python", c: "#3d9bff", r: "معالجة الذكاء الاصطناعي والرؤية الحاسوبية", why: "أغنى بيئة لمكتبات الرؤية الحاسوبية والتعلم العميق.", i: "إطارات من الكاميرا", o: "أحداث وكشوفات منظمة" },
    { n: "OpenCV", c: "#00D9FF", r: "الوصول للكاميرا وقراءة الفيديو ومعالجة الإطارات", why: "يدعم USB و RTSP والملفات بواجهة واحدة، وسريع في معالجة الصور.", i: "كاميرا / ملف / رابط RTSP", o: "إطارات جاهزة وصور معلَّمة" },
    { n: "YOLO", c: "#F59E0B", r: "اكتشاف الأجسام", why: "يكشف عدة أجسام في تمريرة واحدة بسرعة مناسبة للبث المباشر.", i: "إطار صورة", o: "صناديق + فئات + درجات ثقة" },
    { n: "ByteTrack", c: "#22C55E", r: "تتبع الأجسام عبر الإطارات", why: "سريع ولا يحتاج نموذج مظهر إضافي، ويستفيد من الكشوفات منخفضة الثقة.", i: "كشوفات كل إطار", o: "مسارات بمعرّفات مؤقتة" },
    { n: "Laravel", c: "#EF4444", r: "الخادم والمصادقة وقواعد العمل وإدارة الأحداث", why: "يوفر التحقق والصلاحيات والطوابير وقاعدة البيانات بشكل منظم.", i: "طلبات JSON", o: "سجلات محفوظة واستجابات API" },
    { n: "MySQL", c: "#5b8ff9", r: "التخزين الدائم", why: "قاعدة علاقات موثوقة مع فهارس للبحث السريع بالتاريخ والكاميرا.", i: "استعلامات من Laravel", o: "بيانات محفوظة قابلة للاستعلام" },
    { n: "React", c: "#00D9FF", r: "واجهة الويب التفاعلية", why: "مكونات قابلة لإعادة الاستخدام وتحديث سريع للواجهة مع البيانات.", i: "استجابات API", o: "لوحة تحكم وصفحات" },
    { n: "TypeScript", c: "#087FF5", r: "تطوير أكثر أماناً للواجهة", why: "الأنواع تكشف أخطاء البيانات قبل التشغيل، خاصة في شكل استجابات الـ API.", i: "كود الواجهة", o: "كود JavaScript موثوق" }
  ];
  const el = $("#techs");
  el.innerHTML = T.map((t, i) => `<button class="tech" aria-expanded="false" data-i="${i}">
    <div class="top"><span class="name">${t.n}</span><span class="mark" style="background:${t.c}">${t.n.slice(0, 2)}</span></div>
    <span class="role">${t.r}</span>
    <span class="more" hidden><span><b>WHY</b>${t.why}</span><span><b>INPUT</b>${t.i}</span><span><b>OUTPUT</b>${t.o}</span></span>
    <span class="hint">اضغط للتفاصيل</span></button>`).join("");
  el.addEventListener("click", e => {
    const b = e.target.closest(".tech"); if (!b) return;
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", open); $(".more", b).hidden = !open; $(".hint", b).textContent = open ? "اضغط للإغلاق" : "اضغط للتفاصيل";
  });
})();

/* ================= J — database ================= */
(function database() {
  const tables = {
    users: { x: 50, y: 30, d: "حسابات من يستخدم اللوحة وأدوارهم.", f: [["id", "bigint PK"], ["name", "varchar"], ["email", "varchar UQ"], ["password", "hash"], ["role", "admin|operator"]] },
    line_crossings: { x: 50, y: 210, d: "كل عبور لخط افتراضي مع اتجاهه.", f: [["id", "bigint PK"], ["camera_id", "FK"], ["tracked_object_id", "FK"], ["line_name", "varchar"], ["direction", "in|out"], ["crossed_at", "datetime"]] },
    system_settings: { x: 50, y: 400, d: "إعدادات عامة مثل عتبة الثقة ومدة الاحتفاظ.", f: [["key", "varchar PK"], ["value", "json"], ["updated_by", "FK users"]] },
    cameras: { x: 390, y: 30, d: "مصادر الفيديو المسجلة في النظام.", f: [["id", "bigint PK"], ["name", "varchar"], ["source_type", "usb|rtsp|file"], ["source_config", "encrypted"], ["status", "online|offline"], ["created_by", "FK users"]] },
    tracked_objects: { x: 390, y: 300, d: "كل جسم تتبّعه النظام داخل جلسة، بمعرّف مؤقت.", f: [["id", "bigint PK"], ["camera_id", "FK"], ["track_id", "int"], ["class_name", "varchar"], ["first_seen", "datetime"], ["last_seen", "datetime"]] },
    monitoring_zones: { x: 750, y: 30, d: "المناطق المحظورة والخطوط المعرّفة لكل كاميرا.", f: [["id", "bigint PK"], ["camera_id", "FK"], ["name", "varchar"], ["type", "polygon|line"], ["points", "json"]] },
    detection_events: { x: 750, y: 250, d: "الأحداث المهمة: دخول منطقة، خروج، تنبيهات.", f: [["id", "bigint PK"], ["camera_id", "FK"], ["zone_id", "FK null"], ["tracked_object_id", "FK"], ["event_type", "varchar"], ["confidence", "decimal"], ["occurred_at", "datetime"], ["acknowledged_by", "FK users"]] }
  };
  const rels = [
    ["users", "cameras", "مستخدم يضيف عدة كاميرات"], ["users", "system_settings", "مستخدم يعدّل الإعدادات"], ["users", "detection_events", "مستخدم يؤكد اطلاعه على الأحداث"],
    ["cameras", "monitoring_zones", "كاميرا لها عدة مناطق"], ["cameras", "tracked_objects", "كاميرا تتبع عدة أجسام"], ["cameras", "detection_events", "كاميرا تولّد عدة أحداث"], ["cameras", "line_crossings", "كاميرا تسجل عدة عبورات"],
    ["tracked_objects", "detection_events", "جسم متتبَّع قد يسبب عدة أحداث"], ["tracked_objects", "line_crossings", "جسم قد يعبر الخط أكثر من مرة"], ["monitoring_zones", "detection_events", "منطقة تُسجَّل فيها أحداث"]
  ];
  const TW = 220, RH = 19, HH = 30;
  const box = k => { const t = tables[k]; return { x: t.x, y: t.y, w: TW, h: HH + t.f.length * RH + 8 }; };
  function link(a, b) {
    const A = box(a), B = box(b);
    const ac = { x: A.x + A.w / 2, y: A.y + A.h / 2 }, bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
    if (Math.abs(ac.x - bc.x) < 20) return `M${A.x} ${ac.y} C ${A.x - 42} ${ac.y}, ${B.x - 42} ${bc.y}, ${B.x} ${bc.y}`;
    const right = bc.x > ac.x; const x1 = right ? A.x + A.w : A.x, x2 = right ? B.x : B.x + B.w;
    const mx = (x1 + x2) / 2; return `M${x1} ${ac.y} C ${mx} ${ac.y}, ${mx} ${bc.y}, ${x2} ${bc.y}`;
  }
  const svg = $("#dbSvg"), panel = $("#dbPanel");
  svg.setAttribute("direction", "ltr");
  svg.innerHTML = rels.map(([a, b], i) => `<path class="rel-line" data-i="${i}" d="${link(a, b)}"/>`).join("") +
    Object.entries(tables).map(([k, t]) => { const b = box(k); return `<g class="tbl" data-k="${k}" tabindex="0" role="button" aria-label="${k}"><rect class="b" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="9"/><rect class="h" x="${b.x + 1}" y="${b.y + 1}" width="${b.w - 2}" height="${HH - 2}" rx="8"/><text class="t" x="${b.x + 12}" y="${b.y + 20}">${k}</text>${t.f.map(([n, ty], i) => `<text x="${b.x + 12}" y="${b.y + HH + 14 + i * RH}">${n}</text><text x="${b.x + b.w - 12}" y="${b.y + HH + 14 + i * RH}" text-anchor="end" style="fill:#5d7394">${ty}</text>`).join("")}</g>`; }).join("");
  function select(k) {
    const related = new Set([k]); const relIdx = new Set();
    rels.forEach(([a, b], i) => { if (a === k || b === k) { related.add(a); related.add(b); relIdx.add(i); } });
    $$(".tbl", svg).forEach(g => { const kk = g.dataset.k; g.classList.toggle("sel", kk === k); g.classList.toggle("rel", kk !== k && related.has(kk)); g.classList.toggle("dim", !related.has(kk)); });
    $$(".rel-line", svg).forEach(p => { const on = relIdx.has(+p.dataset.i); p.classList.toggle("on", on); p.classList.toggle("dim", !on); });
    const t = tables[k];
    panel.innerHTML = `<span class="tag" style="justify-self:start">جدول مقترح</span><h3 class="ltr" style="text-align:right">${k}</h3><p style="color:var(--fg2);font-size:14px">${t.d}</p>
      <div class="fields">${t.f.map(([n, ty]) => `<div><b style="font-weight:500;color:var(--fg2)">${n}</b><span>${ty}</span></div>`).join("")}</div>
      <div><h4 style="font-size:13.5px;margin-bottom:6px">العلاقات</h4><ul class="clean" style="font-size:13.5px">${rels.filter(([a, b]) => a === k || b === k).map(r => `<li>${r[2]} <span class="mono ltr" style="color:var(--muted);font-size:11.5px">1:N</span></li>`).join("")}</ul></div>`;
  }
  svg.addEventListener("click", e => { const g = e.target.closest(".tbl"); if (g) select(g.dataset.k); });
  svg.addEventListener("keydown", e => { const g = e.target.closest(".tbl"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.k); } });
  select("cameras");
})();

/* ================= K — API flow ================= */
(function apiFlow() {
  const EP = [
    { m: "POST", p: "/api/events", from: "py", d: "خدمة Python ترسل حدثاً جديداً", auth: "X-Service-Token", db: "INSERT INTO detection_events",
      req: { headers: { "X-Service-Token": "<from env>", "Content-Type": "application/json" }, body: { event_type: "zone_enter", camera_id: 1, zone_id: 2, track_id: 3, class_name: "person", confidence: 0.91, occurred_at: "2026-10-13T14:32:07Z" } },
      res: { status: 201, data: { id: 5821, event_type: "zone_enter", stored: true } }, err: { status: 422, message: "The given data was invalid.", errors: { confidence: ["must be between 0 and 1"] } } },
    { m: "GET", p: "/api/events", from: "ui", d: "اللوحة تجلب الأحداث مع الفلاتر", auth: "Bearer token", db: "SELECT … WHERE occurred_at BETWEEN …",
      req: { headers: { Authorization: "Bearer <user token>" }, query: { from: "2026-10-13", camera_id: 1, type: "zone_enter", page: 1 } },
      res: { status: 200, data: [{ id: 5821, event_type: "zone_enter", camera: "CAM-01", track_id: 3, occurred_at: "14:32:07" }], meta: { current_page: 1, per_page: 25, total: 1 } }, err: { status: 401, message: "Unauthenticated." } },
    { m: "GET", p: "/api/cameras", from: "ui", d: "قائمة الكاميرات وحالتها", auth: "Bearer token", db: "SELECT id, name, status FROM cameras",
      req: { headers: { Authorization: "Bearer <user token>" } },
      res: { status: 200, data: [{ id: 1, name: "CAM-01", source_type: "rtsp", source_display: "rtsp://***:***@CAMERA_IP:554/…", status: "online" }] }, err: { status: 403, message: "This action is unauthorized." } },
    { m: "GET", p: "/api/statistics", from: "ui", d: "أرقام لوحة التحكم والرسوم", auth: "Bearer token", db: "SELECT COUNT(*) … GROUP BY hour",
      req: { headers: { Authorization: "Bearer <user token>" }, query: { range: "today" } },
      res: { status: 200, data: { events_today: 128, zone_alerts: 9, line_crossings: 87, by_hour: [4, 9, 15, 22] }, note: "example values" }, err: { status: 503, message: "Database unavailable.", code: "DB_UNAVAILABLE" } },
    { m: "GET", p: "/api/zones", from: "ui", d: "المناطق والخطوط لكاميرا معينة", auth: "Bearer token", db: "SELECT * FROM monitoring_zones",
      req: { headers: { Authorization: "Bearer <user token>" }, query: { camera_id: 1 } },
      res: { status: 200, data: [{ id: 2, name: "zone A", type: "polygon", points: [[880, 130], [1170, 130], [1170, 390], [880, 390]] }] }, err: { status: 404, message: "Camera not found." } }
  ];
  const nodes = { py: [640, 60, "Python AI"], api: [380, 60, "Laravel API"], ui: [120, 60, "React UI"], db: [380, 130, "MySQL"] };
  const svg = $("#apiSvg");
  svg.setAttribute("direction", "ltr");
  svg.innerHTML = `<path id="apA" d="M570 52 H450" stroke="rgba(130,170,230,.3)" stroke-width="1.5" fill="none"/><path id="apB" d="M190 52 H310" stroke="rgba(130,170,230,.3)" stroke-width="1.5" fill="none"/><path id="apD" d="M380 82 V112" stroke="rgba(130,170,230,.3)" stroke-width="1.5" fill="none"/>` +
    Object.entries(nodes).map(([k, [x, y, t]]) => `<g class="api-node" data-n="${k}"><rect x="${x - 70}" y="${y - (k === "db" ? 16 : 24)}" width="140" height="${k === "db" ? 32 : 48}" rx="10"/><text x="${x}" y="${y + 4}" text-anchor="middle">${t}</text></g>`).join("") +
    `<circle id="pkt" r="7" fill="#F59E0B" opacity="0"/><text id="pktLbl" font-family="JetBrains Mono" font-size="10.5" fill="#E8EDF3" text-anchor="middle" opacity="0"></text>`;
  const list = $("#epList");
  list.innerHTML = EP.map((e, i) => `<button class="ep" role="tab" data-i="${i}" aria-selected="false"><span class="m ${e.m === "POST" ? "post" : ""}">${e.m}</span><span class="p">${e.p}</span><small>${e.d}</small></button>`).join("");
  let anim = 0;
  function run(e) {
    cancelAnimationFrame(anim);
    const pkt = $("#pkt", svg), lbl = $("#pktLbl", svg);
    const fromX = e.from === "py" ? 570 : 190, toX = e.from === "py" ? 450 : 310;
    const phases = [
      { t: 0.9, f: q => [fromX + (toX - fromX) * q, 52], c: e.m === "POST" ? "#F59E0B" : "#A78BFA", l: e.m, lit: e.from },
      { t: 0.6, f: q => [380, 82 + 30 * q], c: "#22C55E", l: "SQL", lit: "api" },
      { t: 0.6, f: q => [380, 112 - 30 * q], c: "#22C55E", l: "rows", lit: "db" },
      { t: 0.9, f: q => [toX + (fromX - toX) * q, 64], c: "#22C55E", l: String(e.res.status), lit: "api" }
    ];
    if (RM) { pkt.setAttribute("opacity", 0); lbl.setAttribute("opacity", 0); return; }
    let ph = 0, start = performance.now();
    $$(".api-node", svg).forEach(n => n.classList.remove("lit"));
    const step = ts => {
      const P = phases[ph], q = Math.min(1, (ts - start) / 1000 / P.t), [x, y] = P.f(q);
      $$(".api-node", svg).forEach(n => n.classList.toggle("lit", n.dataset.n === P.lit));
      pkt.setAttribute("cx", x); pkt.setAttribute("cy", y); pkt.setAttribute("fill", P.c); pkt.setAttribute("opacity", 1);
      lbl.setAttribute("x", x); lbl.setAttribute("y", y - 13); lbl.textContent = P.l; lbl.setAttribute("opacity", 1);
      if (q >= 1) { ph++; start = ts; }
      if (ph < phases.length) anim = requestAnimationFrame(step);
      else { pkt.setAttribute("opacity", 0); lbl.setAttribute("opacity", 0); $$(".api-node", svg).forEach(n => n.classList.toggle("lit", n.dataset.n === e.from)); }
    };
    anim = requestAnimationFrame(step);
  }
  function show(i) {
    const e = EP[i];
    $$(".ep", list).forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-selected", j === i); });
    $("#apiMeta").innerHTML = `<span class="tag">مقترح — غير منفّذ</span><span class="chip ltr">${e.m} ${e.p}</span><span class="chip">المرسل: ${e.from === "py" ? "خدمة Python" : "لوحة React"}</span><span class="chip ltr">auth: ${e.auth}</span><span class="chip ltr">db: ${esc(e.db)}</span><button class="btn sm" id="apiReplay">${icon("i-reset")}أعد الحركة</button>`;
    $("#apiReq").innerHTML = json(e.req);
    $("#apiRes").innerHTML = json(e.res) + "\n\n" + highlight("// example error response", "json") + "\n" + json(e.err);
    $("#apiReplay").addEventListener("click", () => run(e));
    run(e);
  }
  list.addEventListener("click", ev => { const b = ev.target.closest(".ep"); if (b) show(+b.dataset.i); });
  show(0);
})();

/* ================= L — testing checklist ================= */
(function testing() {
  const items = [
    ["اتصال الكاميرا", "الكاميرا تفتح وتظهر الصورة في كود الاختبار خلال المهلة المحددة."],
    ["تشغيل فيديو مسجّل", "الملف يُقرأ حتى نهايته، والتقدم يصل 100%."],
    ["اكتشاف الأجسام", "الكشوفات تحتوي الفئة والثقة والصندوق ورقم الإطار."],
    ["ثبات معرّف التتبع", "الجسم نفسه يحتفظ بمعرّفه أثناء حركته في المشهد."],
    ["دخول المنطقة", "دخول جسم للمنطقة يولّد حدثاً واحداً بعد التأكيد."],
    ["عبور الخط", "العبور يُعدّ مرة واحدة مع الاتجاه الصحيح."],
    ["عدم تكرار الأحداث", "التذبذب حول الخط أو حافة المنطقة لا يولّد أحداثاً مكررة."],
    ["تحقق الـ API", "بيانات ناقصة أو خاطئة ترجع 422 مع وصف الخطأ."],
    ["الحفظ في قاعدة البيانات", "الأحداث تظهر في MySQL بعد الإرسال، وتبقى بعد إعادة التشغيل."],
    ["تحديث اللوحة", "الحدث الجديد يظهر في اللوحة خلال ثوانٍ."],
    ["انقطاع الشبكة", "قطع الشبكة يظهر رسالة واضحة ولا يوقف النظام بالكامل."],
    ["إعادة اتصال الكاميرا", "بعد عودة الكاميرا يستأنف النظام القراءة تلقائياً."],
    ["المصادقة", "المستخدم غير المسجل لا يصل لأي بيانات، والمشغّل لا يصل لصفحات المدير."],
    ["التصميم المتجاوب", "اللوحة تعمل على الموبايل والتابلت وسطح المكتب."]
  ];
  let done = new Set(store.get("aimon-checks", []));
  const el = $("#checklist");
  el.innerHTML = items.map(([t, d], i) => `<label class="check" for="chk${i}"><input type="checkbox" id="chk${i}" data-i="${i}"><span><b>${t}</b><span>${d}</span></span></label>`).join("");
  function render() {
    $$("input", el).forEach(c => { c.checked = done.has(+c.dataset.i); c.closest(".check").classList.toggle("done", c.checked); });
    const pct = Math.round(done.size / items.length * 100);
    $("#ringArc").setAttribute("stroke-dashoffset", (314.16 * (1 - done.size / items.length)).toFixed(2));
    $("#ringPct").textContent = pct + "%";
    $("#ringTxt").textContent = `${done.size} من ${items.length} حالة`;
  }
  el.addEventListener("change", e => { const i = +e.target.dataset.i; e.target.checked ? done.add(i) : done.delete(i); store.set("aimon-checks", [...done]); render(); });
  $("#checkReset").addEventListener("click", () => { done.clear(); store.set("aimon-checks", []); render(); });
  render();
})();

/* ================= M — limits ================= */
(function limits() {
  const L = [["تغيّر الإضاءة", "الليل والظلال والانعكاسات تقلل دقة الكشف."], ["الحجب", "جسم خلف آخر قد يختفي، فيأخذ معرّفاً جديداً عند ظهوره."], ["زاوية الكاميرا", "الزوايا المائلة جداً تشوّه شكل الأجسام وتصعّب رسم الخطوط."], ["جودة الفيديو", "الدقة المنخفضة والضغط العالي يضيّعان الأجسام الصغيرة."], ["انقطاع الشبكة", "كاميرات IP تتأثر بازدحام الشبكة وانقطاعها."], ["كشوفات خاطئة", "النموذج قد يخطئ في فئة جسم أو يرى جسماً غير موجود."], ["حدود العتاد", "المعالجة بدون GPU أبطأ، وقد تحتاج تقليل الدقة أو عدد الإطارات."], ["زمن المعالجة", "كل مرحلة تضيف تأخيراً بين الحدث الحقيقي وظهوره في اللوحة."], ["أخطاء التتبع", "تبديل المعرّفات بين جسمين متقاربين قد يسبب عدّاً غير دقيق."]];
  const F = [["كاميرات متعددة", "تشغيل عدة جلسات معالجة متوازية بإدارة موارد."], ["مقاطع للأحداث", "حفظ ثوانٍ من الفيديو حول كل حدث مهم."], ["تتبع أفضل", "تجربة متتبعات بميزات مظهرية لتقليل تبديل المعرّفات."], ["مراقبة صحة الكاميرات", "تنبيه عند انقطاع كاميرا أو انخفاض جودتها."], ["الإشعارات", "تنبيهات فورية بالبريد أو تطبيقات المراسلة."], ["تقارير قابلة للتصدير", "تقارير CSV و PDF بفترات زمنية."], ["صلاحيات حسب الدور", "صلاحيات أدق لكل مستخدم وكاميرا."], ["تسريع الاستدلال", "تحويل النموذج لصيغ أسرع مثل ONNX أو TensorRT."], ["بث آمن مباشر", "بوابة WebRTC مع مصادقة لعرض الفيديو في اللوحة."]];
  $("#limitsList").innerHTML = L.map(([a, b]) => `<li><span class="sev"></span><span><b>${a}</b><span>${b}</span></span></li>`).join("");
  $("#futureList").innerHTML = F.map(([a, b]) => `<li><span class="fut"></span><span><b>${a}</b><span>${b}</span></span></li>`).join("");
})();

/* ================= N — presentation mode ================= */
(function presentation() {
  const slides = [
    { k: "المشكلة", t: "فيديو كثير ومعلومات قليلة", go: "about", b: ["كاميرات المراقبة تسجّل ساعات من الفيديو لا يراجعها أحد إلا بعد وقوع مشكلة.", "المراجعة اليدوية مكلفة ومرهقة وعرضة للخطأ.", "الأنظمة التجارية الذكية مغلقة ومكلفة ومرتبطة بعتاد معين."] },
    { k: "الحل المقترح", t: "نظام برمجي يحوّل الفيديو إلى أحداث", go: "about", b: ["يكتشف الأجسام ويتتبعها ويطبّق قواعد مناطق وخطوط.", "يسجّل الأحداث المهمة ويعرضها في لوحة تحكم.", "بدون تعرّف على الوجوه أو تحديد هوية الأشخاص."] },
    { k: "المعمارية", t: "ثلاث طبقات منفصلة", go: "arch", b: ["خدمة Python للمعالجة: OpenCV و YOLO و ByteTrack والقواعد.", "Laravel API للتحقق والصلاحيات والحفظ في MySQL.", "لوحة React للعرض. الفيديو لا يمر عبر Laravel، فقط أحداث JSON."] },
    { k: "مدخل الكاميرا", t: "أربعة أنواع من المصادر", go: "camera", b: ["كاميرا USB برقم الجهاز، أو كاميرا IP عبر RTSP.", "مسجّل DVR/NVR بقناة لكل كاميرا، أو ملف فيديو مسجّل.", "بيانات الدخول في متغيرات بيئة في الخادم، ولا تصل للمتصفح."] },
    { k: "الكشف", t: "YOLO يرى ما في الإطار", go: "pipeline", b: ["تمريرة واحدة تعطي لكل جسم صندوقاً وفئة ودرجة ثقة.", "عتبة الثقة تستبعد الكشوفات الضعيفة.", "الإطار يُجهّز أولاً بـ OpenCV: الحجم وترتيب الألوان."] },
    { k: "التتبع", t: "ByteTrack يربط الإطارات ببعضها", go: "sim", b: ["يعطي كل جسم معرّفاً مؤقتاً ثابتاً قدر الإمكان.", "يستخدم الكشوفات منخفضة الثقة لاسترجاع الأجسام المحجوبة جزئياً.", "المعرّف مؤقت داخل الجلسة، وليس هوية حقيقية."] },
    { k: "مراقبة المناطق", t: "قواعد على الإحداثيات", go: "zones", b: ["عبور الخط يُحدّد من جانب النقطة المرجعية، مع اتجاه العبور.", "هامش حول الخط وفترة تهدئة يمنعان العدّ المكرر.", "دخول المنطقة يُؤكَّد بعد عدة إطارات متتالية."] },
    { k: "الخادم والبيانات", t: "Laravel و MySQL", go: "db", b: ["الأحداث تصل عبر POST /api/events بمفتاح خدمة.", "Laravel يتحقق ويحفظ؛ هو المالك الوحيد لقاعدة البيانات.", "الجداول: الكاميرات، المناطق، الأجسام المتتبَّعة، الأحداث، العبورات، المستخدمين."] },
    { k: "لوحة التحكم", t: "ما يراه المشغّل", go: "dashboard", b: ["حالة الكاميرات والمعالجة، والكشوفات، والتنبيهات، وعدد العبورات.", "رسم الكشوفات عبر الزمن، وسجل الأحداث الأخيرة.", "التحديث بالاستعلام الدوري أو WebSocket."] },
    { k: "الاختبار والمستقبل", t: "ما اختبرناه وما بعده", go: "testing", b: ["قائمة اختبار تغطي الكاميرا والكشف والتتبع والقواعد والـ API والمصادقة.", "نذكر فقط الأرقام المقاسة فعلاً مع شروط القياس.", "المستقبل: كاميرات متعددة، إشعارات، تقارير، وبث آمن مباشر."] }
  ];
  const ov = $("#pres"), slideEl = $("#presSlide"), dots = $("#presDots");
  let cur = 0, opener = null;
  dots.innerHTML = slides.map((_, i) => `<button aria-label="شريحة ${i + 1}" data-i="${i}"></button>`).join("");
  function show(i) {
    cur = clamp(i, 0, slides.length - 1); const s = slides[cur];
    slideEl.innerHTML = `<span class="k">${pad2(cur + 1)} · ${s.k}</span><h2>${s.t}</h2><ul>${s.b.map(b => `<li><span>${b}</span></li>`).join("")}</ul>`;
    $("#presCount").textContent = `${cur + 1} / ${slides.length}`;
    $$("button", dots).forEach((d, j) => d.classList.toggle("on", j === cur));
    $("#presPrev").disabled = cur === 0;
    $("#presNext").innerHTML = cur === slides.length - 1 ? "إنهاء" : `التالي${icon("i-next")}`;
    $("#presGo").setAttribute("href", "#" + s.go);
  }
  function open() { opener = document.activeElement; ov.hidden = false; document.body.style.overflow = "hidden"; show(0); $("#presNext").focus(); }
  function close() { ov.hidden = true; document.body.style.overflow = ""; opener?.focus?.(); }
  $("#presOpen").addEventListener("click", open);
  $("#presExit").addEventListener("click", close);
  $("#presPrev").addEventListener("click", () => show(cur - 1));
  $("#presNext").addEventListener("click", () => cur === slides.length - 1 ? close() : show(cur + 1));
  $("#presGo").addEventListener("click", () => close());
  dots.addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  document.addEventListener("keydown", e => {
    if (ov.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") cur === slides.length - 1 ? close() : show(cur + 1);
    else if (e.key === "ArrowRight") show(cur - 1);
  });
})();

})();
