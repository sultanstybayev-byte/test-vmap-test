/* =====================================================================
   3D-книга (three.js): осмотр, свет, открытие обложки.
   Модель: "Book" by James.Moore (sketchfab.com/James.Moore), CC-BY-4.0.
   mountBook(container, { portrait, name, title, leather, metal }) → { open(), reset(), dispose() }
   ===================================================================== */
import * as THREE from "./three.module.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { RoomEnvironment } from "./RoomEnvironment.js";

const BASE = new URL("../models/book/", import.meta.url).href;
/* передняя обложка в UV-развёртке: u = .471 + (x + .06) * 2.433, v = .076 + (z - .02) * 2.488 */
const FRONT = { u0: .432, u1: .803, v0: .028, v1: .530 };
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = no; i.src = src; });
const hex = c => { const n = parseInt(String(c || "#000").slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/* текстура обложки: перекрашенная кожа + портрет в золотой рамке + имя */
async function coverTexture(o) {
  const base = await loadImg(BASE + "base.jpg"), S = 1024, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d"); g.drawImage(base, 0, 0, S, S);
  if (o.leather) {
    const L = hex(o.leather), d = g.getImageData(0, 0, S, Math.round(S * .54)), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], gg = a[i + 1], b = a[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx > 120 && mx - mn > 40) continue; /* золото не трогаем */
      const l = (r * .3 + gg * .59 + b * .11) / 255, k = .55 + l * 2.6;
      a[i] = Math.min(255, L[0] * k); a[i + 1] = Math.min(255, L[1] * k); a[i + 2] = Math.min(255, L[2] * k);
    }
    g.putImageData(d, 0, 0);
  }
  const X = u => u * S, Y = v => v * S, metal = o.metal || "#e2bf68";
  /* убираем эмблему и надписи модели: кладём гладкую кожу с задней крышки */
  g.drawImage(cv, X(.10), Y(.12), X(.24), Y(.30), X(.47), Y(.11), X(.30), Y(.32));
  g.drawImage(cv, X(.10), Y(.20), X(.24), Y(.10), X(.46), Y(.42), X(.32), Y(.10));
  /* рисунок обложки делаем отдельно и кладём с вертикальным отражением (так устроена развёртка модели) */
  const ow = Math.round(X(FRONT.u1 - FRONT.u0)), oh = Math.round(Y(FRONT.v1 - FRONT.v0)), ov = document.createElement("canvas"); ov.width = ow; ov.height = oh;
  const c = ov.getContext("2d"), cx = ow / 2 + 4, pw = ow * .66, ph = pw * 1.28, px = cx - pw / 2, py = oh * .1;
  if (o.portrait) {
    try { const im = await loadImg(o.portrait), k = Math.max(pw / im.width, ph / im.height), w = im.width * k, h = im.height * k;
      c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip(); c.drawImage(im, px + (pw - w) / 2, py + (ph - h) / 2, w, h); c.restore(); } catch (_) {}
  } else { c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(px, py, pw, ph); }
  c.strokeStyle = metal; c.lineWidth = 4; c.strokeRect(px - 5, py - 5, pw + 10, ph + 10); c.lineWidth = 1.5; c.strokeRect(px - 12, py - 12, pw + 24, ph + 24);
  const dia = (x, y, r) => { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); };
  c.fillStyle = metal; dia(cx, py - 12, 9); dia(cx, py + ph + 12, 9); dia(px - 12, py + ph / 2, 7); dia(px + pw + 12, py + ph / 2, 7);
  c.textAlign = "center"; c.textBaseline = "middle"; c.shadowColor = "rgba(0,0,0,.75)"; c.shadowOffsetY = 2; c.shadowBlur = 2;
  let fs = 44; const F = n => `700 ${n}px "Cormorant SC", "Cormorant Garamond", Georgia, serif`; c.font = F(fs); while (c.measureText(o.name || "").width > ow * .82 && fs > 22) c.font = F(fs -= 2);
  c.fillText(o.name || "", cx, py + ph + 54);
  if (o.title) { c.font = `italic 400 23px "Cormorant Garamond", Georgia, serif`; c.globalAlpha = .85; c.fillText(o.title, cx, py + ph + 90, ow * .86); c.globalAlpha = 1; }
  g.save(); g.translate(X(FRONT.u0), Y(FRONT.v1)); g.scale(1, -1); g.drawImage(ov, 0, 0); g.restore();
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* лист пергамента: 0 — форзац, 1..3 — страницы с имитацией текста */
function pageCanvas(n, o) {
  const W = 512, H = 738, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d"), metal = "#a07c34";
  const gr = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .8); gr.addColorStop(0, "#f6ebcd"); gr.addColorStop(1, "#dcc595"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,80,30,${Math.random() * .05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  if (n === 0) { /* форзац: тёмная кожа-«мрамор» под цвет книги с золотой рамкой */
    g.fillStyle = o.leather || "#3a2010"; g.globalAlpha = .9; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(255,230,170,${.03 + Math.random() * .05})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let j = 0; j < 6; j++) g.quadraticCurveTo(x += (Math.random() - .5) * 120, y += (Math.random() - .5) * 120, x += (Math.random() - .5) * 120, y += (Math.random() - .5) * 120); g.stroke(); }
    g.strokeStyle = o.metal || "#e2bf68"; g.lineWidth = 3; g.strokeRect(26, 26, W - 52, H - 52); g.lineWidth = 1; g.strokeRect(36, 36, W - 72, H - 72); return cv; }
  g.strokeStyle = "rgba(138,106,42,.6)"; g.lineWidth = 2; g.strokeRect(30, 30, W - 60, H - 60); g.lineWidth = 1; g.strokeRect(38, 38, W - 76, H - 76);
  let y = 80; g.fillStyle = "rgba(60,38,16,.55)";
  if (n === 1) { g.textAlign = "center"; g.fillStyle = "#2a1a0c"; g.font = `700 40px "Cormorant SC", Georgia, serif`; g.fillText(o.name || "", W / 2, 120, W - 100); if (o.title) { g.font = `italic 22px Georgia, serif`; g.fillStyle = "#6a4a22"; g.fillText(o.title, W / 2, 156, W - 100); } y = 210; g.fillStyle = "rgba(60,38,16,.55)"; }
  else { g.fillStyle = "#8a2414"; g.fillRect(64, y, 34, 40); y += 6; g.fillStyle = "rgba(60,38,16,.55)"; }
  while (y < H - 80) { const para = 4 + (Math.random() * 5 | 0); for (let l = 0; l < para && y < H - 80; l++, y += 22) { let x = l || n === 1 ? 64 : 110; const end = l === para - 1 ? 64 + (W - 128) * (.35 + Math.random() * .5) : W - 64; while (x < end - 10) { const w = 14 + Math.random() * 46; g.fillRect(x, y, Math.min(w, end - x), 6); x += w + 8; } } y += 16; }
  g.textAlign = "center"; g.font = `italic 18px Georgia, serif`; g.fillStyle = "#8a6a3a"; g.fillText(String(n), W / 2, H - 46); return cv;
}

export async function mountBook(box, o = {}) {
  const W = () => box.clientWidth, H = () => box.clientHeight;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(W(), H());
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  box.appendChild(r.domElement); r.domElement.style.touchAction = "none";
  const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  const cam = new THREE.PerspectiveCamera(30, W() / H(), .01, 50);
  const key = new THREE.DirectionalLight(0xffe7c4, 2.4); key.position.set(-1.2, 2, 2.5); sc.add(key);
  sc.add(new THREE.HemisphereLight(0xfff2dd, 0x2a1a0c, .35));
  const gltf = await new GLTFLoader().loadAsync(BASE + "book.gltf"), mesh = gltf.scene.getObjectByProperty("type", "Mesh");
  const mat = mesh.material; mat.map = await coverTexture(o); mat.needsUpdate = true;
  /* режем: передняя крышка (y < -0.0164, правее корешка) — отдельная деталь на шарнире */
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index.array, front = [], rest = [];
  for (let i = 0; i < idx.length; i += 3) { const t = [idx[i], idx[i + 1], idx[i + 2]]; (t.every(v => pos.getY(v) < -.0164 && pos.getX(v) > -.0668) ? front : rest).push(...t); }
  const g1 = geo.clone(); g1.setIndex(rest); const g2 = geo.clone(); g2.setIndex(front);
  const HX = -.0668, HY = -.0225; g2.translate(-HX, -HY, 0);
  const body = new THREE.Mesh(g1, mat), board = new THREE.Mesh(g2, mat), hinge = new THREE.Group(); hinge.position.set(HX, HY, 0); hinge.add(board);
  /* страницы: пергамент с «строками текста», форзац на изнанке обложки и лист для перелистывания */
  const PW = .136, PH = .196, paper = n => { const t = new THREE.CanvasTexture(pageCanvas(n, o)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const pmat = (map, side) => new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .42, roughness: .95, side: side || THREE.FrontSide });
  const plane = (m, rx) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), m); p.rotation.x = rx; return p; };
  const page = plane(pmat(paper(1)), Math.PI / 2); page.position.set(.003, -.0168, .1015); page.visible = false;
  const lining = plane(pmat(paper(0)), -Math.PI / 2); lining.position.set(.003 - HX, .0059, .1015); board.add(lining); lining.visible = false;
  const leafG = new THREE.Group(); leafG.position.set(HX, -.0171, 0); leafG.visible = false;
  const leafA = plane(pmat(paper(2)), Math.PI / 2), leafB = plane(pmat(paper(3)), -Math.PI / 2); leafB.rotation.z = Math.PI;
  leafA.position.set(.003 - HX, 0, .1015); leafB.position.set(.003 - HX, .00005, .1015); leafG.add(leafA, leafB);
  const holder = mesh.parent; holder.remove(mesh); holder.add(body, hinge, page, leafG);
  /* поворачиваем книгу лицом к камере: нормаль обложки → +Z, высота → +Y */
  gltf.scene.updateMatrixWorld(true);
  const mw = holder.matrixWorld, Fw = new THREE.Vector3(0, -1, 0).transformDirection(mw), Uw = new THREE.Vector3(0, 0, 1).transformDirection(mw), Xw = new THREE.Vector3().crossVectors(Uw, Fw);
  const M = new THREE.Matrix4().makeBasis(Xw, Uw, Fw).invert(), base = new THREE.Group(), pivot = new THREE.Group();
  base.add(gltf.scene); base.quaternion.setFromRotationMatrix(M); pivot.add(base); sc.add(pivot);
  const bb = new THREE.Box3().setFromObject(base), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()); base.position.sub(c);
  const R0 = sz.y * 2.25; let dist = R0; cam.near = R0 * .02; cam.far = R0 * 6; cam.updateProjectionMatrix();
  /* мягкая тень под книгой */
  const sh = document.createElement("canvas"); sh.width = sh.height = 128; const sg = sh.getContext("2d"), gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(sz.x * 1.6, sz.z * 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -sz.y * .56; sc.add(shadow);
  const REST = { rx: .16, ry: -.42 }; let rx = REST.rx + .2, ry = REST.ry - 1.2, vx = 0, vy = 0, drag = null, last = 0, idle = performance.now(), intro = performance.now(), busy = false, raf = 0, zoom = 1;
  const pts = new Map(); let pinch0 = 0, z0 = 1, tapT = 0, moved = 0;
  const resize = () => { r.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(box);
  function frame(now) {
    if (intro) { const k = Math.min(1, (now - intro) / 1000), e = 1 - Math.pow(1 - k, 3); rx = REST.rx + .2 * (1 - e); ry = REST.ry - 1.2 * (1 - e); if (k >= 1) { intro = 0; idle = now; } }
    else if (!drag && !pts.size && !busy && (Math.abs(vx) > .0004 || Math.abs(vy) > .0004)) { ry += vx; rx = Math.max(-1.3, Math.min(1.3, rx + vy)); vx *= .93; vy *= .93; idle = now; }
    const sway = drag || pts.size || busy || intro ? 0 : Math.sin((now - idle) / 1400) * .035 * Math.min(1, (now - idle) / 2500);
    pivot.rotation.set(rx, ry + sway, 0); cam.position.set(0, sz.y * .04, dist / zoom); cam.lookAt(0, 0, 0);
    r.render(sc, cam); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const el = r.domElement;
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); intro = 0; moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = zoom; drag = null; } else { drag = [e.clientX, e.clientY]; vx = vy = 0; last = performance.now(); } });
  el.addEventListener("pointermove", e => { if (!pts.has(e.pointerId) || busy) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; zoom = Math.max(.7, Math.min(2.2, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch0 || 1))); moved = 99; return; }
    if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; moved += Math.abs(dx) + Math.abs(dy); drag = [e.clientX, e.clientY];
    ry += dx * .009; rx = Math.max(-1.3, Math.min(1.3, rx + dy * .009)); const now = performance.now(), dt = Math.max(8, now - last); last = now; vx = dx * .009 * 16 / dt; vy = dy * .009 * 16 / dt; });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) { drag = null; idle = performance.now();
      if (moved < 6) { const now = performance.now(); if (now - tapT < 320) { tapT = 0; box.dispatchEvent(new CustomEvent("i3dopen", { bubbles: true })); } else tapT = now; } } };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.max(.7, Math.min(2.2, zoom * Math.exp(-e.deltaY * .0015))); }, { passive: false });
  const SP = o.speed || 1, tween = (ms, fn) => new Promise(ok => { ms *= SP; const s = performance.now(); (function st() { const k = Math.min(1, (performance.now() - s) / ms); fn(k); if (k < 1) requestAnimationFrame(st); else ok(); })(); });
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const norm = a => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
  async function reset() { const fx = rx, fy = norm(ry), z1 = zoom; vx = vy = 0; await tween(600, k => { const e = ease(k); rx = fx + (REST.rx - fx) * e; ry = fy + (REST.ry - fy) * e; zoom = z1 + (1 - z1) * e; }); idle = performance.now(); }
  /* открытие: книга разворачивается лицом и ложится чуть наклонно, обложка откидывается, камера подлетает */
  async function open() {
    if (busy) return; busy = true; vx = vy = 0; const fx = rx, fy = norm(ry), z1 = zoom, d1 = dist, px0 = pivot.position.x;
    /* 1. книга поворачивается лицом к читателю */
    await tween(480, k => { const e = ease(k); rx = fx + (.3 - fx) * e; ry = fy + (0 - fy) * e; zoom = z1 + (1 - z1) * e; });
    /* 2. обложка откидывается, книга ложится, камера отъезжает, чтобы был виден весь разворот */
    page.visible = lining.visible = true;
    const need = sz.x * 1.07 / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect) + sz.z, d2 = Math.max(d1 * 1.5, need);
    await tween(1000, k => { const e = ease(k); hinge.rotation.z = -e * 3.06; rx = .3 + e * .55; pivot.position.x = px0 + e * sz.x * .5; dist = d1 + (d2 - d1) * e; });
    /* 3. пара перелистываний — «книгу читают» */
    for (let i = 0; i < 2; i++) { const n = 1 + i * 2; leafA.material.map = leafA.material.emissiveMap = paper(n); leafB.material.map = leafB.material.emissiveMap = paper(n + 1);
      leafA.material.needsUpdate = leafB.material.needsUpdate = true; leafG.rotation.z = 0; leafG.visible = true; page.material.map = page.material.emissiveMap = paper(n + 2); page.material.needsUpdate = true;
      await tween(620, k => { const e = ease(k); leafG.rotation.z = -e * 3.03; leafG.position.y = -.0171 - e * .0135 - Math.sin(k * Math.PI) * .006; }); }
    busy = false;
  }
  function close() { hinge.rotation.z = 0; pivot.position.x = 0; dist = R0; page.visible = lining.visible = leafG.visible = false; rx = REST.rx; ry = REST.ry; zoom = 1; idle = performance.now(); }
  function dispose() { cancelAnimationFrame(raf); r.dispose(); el.remove(); }
  return { open, close, reset, dispose, renderer: r, _p: { leafG, hinge }, _s: () => ({ dist, zoom, rx, ry, busy, asp: cam.aspect }) };
}
