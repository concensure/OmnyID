// One-off render script: exports the crystallised final frame of the
// genesis logo particle animation (see public/logo-animation.html and
// src/components/GenesisLogoAnimation.tsx) as static PNG (transparent) and
// JPG (white background) images. Not part of the app build — run manually
// with `node render-genesis-mark.js` from solid-ui/, then delete if unneeded.
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const SIZE = 1024;
const OUT_DIR = path.join(__dirname, "..", "docs", "logo");

const P_RGB = [49, 86, 142]; // #31568e primary blue
const E_RGB = [217, 107, 57]; // #d96b39 ember orange

const B = 0.24;
const T_MIN = 0.45;
const T_MAX = Math.PI * 3.05;
const R_MIN_RAW = Math.exp(B * T_MIN);
const R_MAX_RAW = Math.exp(B * T_MAX);

function render(canvas, scale) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;

  function spiralR(t) {
    return (18 + ((Math.exp(B * t) - R_MIN_RAW) / (R_MAX_RAW - R_MIN_RAW)) * 177) * scale;
  }

  function waveOffset(t, frac) {
    const amp = 4.2 * scale * (1 - frac * 0.68);
    return (
      Math.sin(t * 4.1) * amp +
      Math.sin(t * 9.7) * amp * 0.32 +
      Math.sin(t * 21.3) * amp * 0.11 +
      Math.sin(t * 46.1) * amp * 0.04
    );
  }

  function spiralPoint(t, armOffset) {
    const frac = (t - T_MIN) / (T_MAX - T_MIN);
    const r = spiralR(t);
    const angle = t + armOffset;
    const wave = waveOffset(t, frac);
    const perp = angle + Math.PI / 2;
    return {
      x: CX + r * Math.cos(angle) + Math.cos(perp) * wave,
      y: CY + r * Math.sin(angle) + Math.sin(perp) * wave,
      frac,
    };
  }

  function drawVectorArm(armOffset, rgb, baseWidth) {
    const STEPS = 700;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const frac = i / STEPS;
      const t = T_MIN + frac * (T_MAX - T_MIN);
      const sp = spiralPoint(t, armOffset);
      pts.push({ x: sp.x, y: sp.y, frac });
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const [r, g, b] = rgb;

    for (let i = 0; i < pts.length - 1; i++) {
      const f = pts[i].frac;
      const lw = baseWidth * (1 - f * 0.72);
      const alp = 0.92 - f * 0.68;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alp})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }

    for (let i = 0; i < pts.length - 1; i += 4) {
      const f = pts[i].frac;
      const glw = baseWidth * 8 * (1 - f * 0.58);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.06)`;
      ctx.lineWidth = glw;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawNucleusGlow(t) {
    const pulse = 0.85;
    const radius = 18 * pulse * scale;
    const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, radius);
    cg.addColorStop(0, `rgba(255,228,200,${0.95 * pulse})`);
    cg.addColorStop(0.3, `rgba(217,107,57,${0.75 * pulse})`);
    cg.addColorStop(0.62, `rgba(49,86,142,${0.4 * pulse})`);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(CX, CY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawVectorArm(0, P_RGB, 6.0 * scale);
  drawVectorArm(Math.PI, E_RGB, 6.0 * scale);
  drawNucleusGlow(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Transparent PNG
const pngCanvas = createCanvas(SIZE, SIZE);
render(pngCanvas, SIZE / 600);
const pngBuffer = pngCanvas.toBuffer("image/png");
const pngPath = path.join(OUT_DIR, "omnyid-genesis-mark-transparent.png");
fs.writeFileSync(pngPath, pngBuffer);
console.log("Wrote", pngPath, pngBuffer.length, "bytes");

// White-background JPG
const jpgCanvas = createCanvas(SIZE, SIZE);
const jpgCtx = jpgCanvas.getContext("2d");
jpgCtx.fillStyle = "#ffffff";
jpgCtx.fillRect(0, 0, SIZE, SIZE);
render(jpgCanvas, SIZE / 600);
const jpgBuffer = jpgCanvas.toBuffer("image/jpeg", 92);
const jpgPath = path.join(OUT_DIR, "omnyid-genesis-mark-white-bg.jpg");
fs.writeFileSync(jpgPath, jpgBuffer);
console.log("Wrote", jpgPath, jpgBuffer.length, "bytes");
