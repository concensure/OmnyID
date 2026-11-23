// @locs-version: 1.0
import { onCleanup, onMount } from "solid-js";

/**
 * "Genesis" animation: particles condense from a singularity into the
 * OmnyID spiral mark, then idle with wandering sparks. Ported from
 * public/logo-animation.html, parameterised by `size` so it can be embedded
 * at any scale instead of only as a fixed 600×600 standalone page.
 *
 * `mode="full"` (default) plays the ~10s condensation sequence once, then
 * idles — reserve this for rare, meaningful, one-time waits (identity/
 * workspace creation, a multi-minute provisioning step). `mode="idle"`
 * skips straight to the crystallised mark with its wandering-spark loop —
 * use this for short or frequent waits (buffering, a quick save) where a
 * 10s intro would be an annoyance rather than a delight.
 */
export function GenesisLogoAnimation(props: { size?: number; class?: string; mode?: "full" | "idle" }) {
  let canvasRef: HTMLCanvasElement | undefined;

  onMount(() => {
    const canvas = canvasRef;
    if (!canvas) return;

    const size = props.size ?? 600;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    // Rebind to a non-nullable const so nested function declarations below
    // (which TS otherwise re-widens to `CanvasRenderingContext2D | null`)
    // see a plain non-null type.
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const W = size;
    const H = size;
    canvas.width = W;
    canvas.height = H;
    const CX = W / 2;
    const CY = H / 2;
    const SCALE = size / 600;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const P_RGB = [49, 86, 142] as const; // #31568e — primary blue
    const E_RGB = [217, 107, 57] as const; // #d96b39 — ember orange

    const B = 0.24;
    const T_MIN = 0.45;
    const T_MAX = Math.PI * 3.05;
    const R_MIN_RAW = Math.exp(B * T_MIN);
    const R_MAX_RAW = Math.exp(B * T_MAX);

    function spiralR(t: number) {
      return (18 + ((Math.exp(B * t) - R_MIN_RAW) / (R_MAX_RAW - R_MIN_RAW)) * 177) * SCALE;
    }

    function waveOffset(t: number, frac: number) {
      const amp = 4.2 * SCALE * (1 - frac * 0.68);
      return (
        Math.sin(t * 4.1) * amp +
        Math.sin(t * 9.7) * amp * 0.32 +
        Math.sin(t * 21.3) * amp * 0.11 +
        Math.sin(t * 46.1) * amp * 0.04
      );
    }

    function spiralPoint(t: number, armOffset: number) {
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

    type LogoPoint = { x: number; y: number; rgb: readonly number[]; frac: number };

    function buildLogoPoints(): LogoPoint[] {
      const pts: LogoPoint[] = [];

      const NUCLEUS_N = 32;
      for (let i = 0; i < NUCLEUS_N; i++) {
        const a = (i / NUCLEUS_N) * Math.PI * 2;
        const r = (1.2 + (i % 3) * 0.9) * SCALE;
        const mix = i / NUCLEUS_N;
        pts.push({
          x: CX + r * Math.cos(a),
          y: CY + r * Math.sin(a),
          rgb: [
            P_RGB[0] * (1 - mix) + E_RGB[0] * mix,
            P_RGB[1] * (1 - mix) + E_RGB[1] * mix,
            P_RGB[2] * (1 - mix) + E_RGB[2] * mix,
          ],
          frac: 0,
        });
      }

      const ARM_N = 132;
      for (let arm = 0; arm < 2; arm++) {
        const offset = arm === 0 ? 0 : Math.PI;
        const rgb = arm === 0 ? P_RGB : E_RGB;
        for (let i = 0; i < ARM_N; i++) {
          const t = T_MIN + (i / (ARM_N - 1)) * (T_MAX - T_MIN);
          const sp = spiralPoint(t, offset);
          pts.push({ x: sp.x, y: sp.y, rgb, frac: sp.frac });
        }
      }

      return pts;
    }

    const LOGO_PTS = buildLogoPoints();
    const N = LOGO_PTS.length;

    class Particle {
      i: number;
      tgt: LogoPoint;
      sz: number;
      x = 0;
      y = 0;
      vx = 0;
      vy = 0;
      bvx = 0;
      bvy = 0;
      exploded = false;

      constructor(i: number) {
        this.i = i;
        this.tgt = LOGO_PTS[i];
        this.sz = (0.85 + Math.random() * 1.5) * SCALE;
        this.init();
      }

      init() {
        this.x = CX + (Math.random() - 0.5) * 3 * SCALE;
        this.y = CY + (Math.random() - 0.5) * 3 * SCALE;
        this.vx = 0;
        this.vy = 0;
        this.exploded = false;

        const tAngle = Math.atan2(this.tgt.y - CY, this.tgt.x - CX);
        const rndAngle = Math.random() * Math.PI * 2;
        const blend = tAngle + (rndAngle - tAngle) * 0.4;
        const spiralLean = blend + (this.tgt.frac > 0.5 ? 0.45 : -0.45);
        const speed = (1.8 + Math.random() * 3.8) * SCALE;
        this.bvx = Math.cos(spiralLean) * speed;
        this.bvy = Math.sin(spiralLean) * speed;
      }
    }

    let parts = Array.from({ length: N }, (_, i) => new Particle(i));

    const T = {
      SING_END: 85,
      EXPL_END: 220,
      STAR_END: 330,
      MORPH_END: 550,
      CRYS_END: 625,
    };

    let frame = 0;
    let idleFrame = 0;
    let raf = 0;

    function easeInOutQuart(t: number) {
      return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    }

    function updateParticle(p: Particle) {
      const f = frame;

      if (f <= T.SING_END) {
        p.x = CX + (Math.random() - 0.5) * 1.8 * SCALE;
        p.y = CY + (Math.random() - 0.5) * 1.8 * SCALE;
        return;
      }

      if (f <= T.EXPL_END) {
        if (!p.exploded) {
          p.vx = p.bvx;
          p.vy = p.bvy;
          p.exploded = true;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.018 * SCALE;
        p.vx *= 0.984;
        p.vy *= 0.984;
        return;
      }

      if (f <= T.STAR_END) {
        p.x += p.vx * 0.45;
        p.y += p.vy * 0.45;
        p.vx *= 0.91;
        p.vy *= 0.91;
        return;
      }

      if (f <= T.MORPH_END) {
        const dx = p.tgt.x - p.x;
        const dy = p.tgt.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

        const radial = 0.055;
        const tangential = 0.022 * Math.min(dist / (90 * SCALE), 1);

        p.vx += dx * radial + (-dy / dist) * tangential * dist;
        p.vy += dy * radial + (dx / dist) * tangential * dist;
        p.vx *= 0.81;
        p.vy *= 0.81;
        p.x += p.vx;
        p.y += p.vy;
        return;
      }

      const sh = 0.22 * SCALE * Math.sin(frame * 0.09 + p.i * 0.63);
      p.x = p.tgt.x + (Math.random() - 0.5) * sh;
      p.y = p.tgt.y + (Math.random() - 0.5) * sh;
    }

    function drawParticle(p: Particle) {
      const [r, g, b] = p.tgt.rgb.map((v) => v | 0);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      ctx.fill();

      if (p.sz > 1.6 * SCALE || frame < T.EXPL_END + 30) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.10)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawSingularity() {
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.19);
      const outer = (60 + pulse * 28) * SCALE;

      const grd = ctx.createRadialGradient(CX, CY, 0, CX, CY, outer);
      grd.addColorStop(0, `rgba(255,215,165,${0.95 * pulse})`);
      grd.addColorStop(0.22, `rgba(217,107,57,${0.6 * pulse})`);
      grd.addColorStop(0.52, `rgba(49,86,142,${0.28 * pulse})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(CX, CY, outer, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,235,205,${0.75 + 0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(CX, CY, (2.5 + pulse * 2.5) * SCALE, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawExplosionFX() {
      const f = frame;

      if (f > T.SING_END && f < T.SING_END + 14) {
        const a = 1 - (f - T.SING_END) / 14;
        ctx.fillStyle = `rgba(255,225,190,${a * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (f > T.SING_END && f < T.EXPL_END + 50) {
        const p = Math.min((f - T.SING_END) / (T.EXPL_END - T.SING_END), 1);

        ctx.strokeStyle = `rgba(217,107,57,${(1 - p) * 0.75})`;
        ctx.lineWidth = 1.5 * SCALE;
        ctx.beginPath();
        ctx.arc(CX, CY, p * 240 * SCALE, 0, Math.PI * 2);
        ctx.stroke();

        if (p > 0.22) {
          const p2 = (p - 0.22) / 0.78;
          ctx.strokeStyle = `rgba(49,86,142,${(1 - p2) * 0.5})`;
          ctx.lineWidth = 1 * SCALE;
          ctx.beginPath();
          ctx.arc(CX, CY, p2 * 205 * SCALE, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function drawVectorArm(armOffset: number, rgb: readonly number[], baseWidth: number) {
      const STEPS = 500;
      const pts: { x: number; y: number; frac: number }[] = [];

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

      for (let i = 0; i < pts.length - 1; i += 5) {
        const f = pts[i].frac;
        const glw = baseWidth * 8 * (1 - f * 0.58);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.045)`;
        ctx.lineWidth = glw;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawNucleusGlow(t: number) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.055);
      const radius = 18 * pulse * SCALE;
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

    function drawFinalLogo(alpha: number, t: number) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawVectorArm(0, P_RGB, 3.0 * SCALE);
      drawVectorArm(Math.PI, E_RGB, 3.0 * SCALE);
      drawNucleusGlow(t);
      ctx.restore();
    }

    function idleLoop() {
      idleFrame++;
      ctx.clearRect(0, 0, W, H);
      drawFinalLogo(1, idleFrame);

      if (idleFrame % 5 === 0) {
        const armOffset = Math.random() < 0.5 ? 0 : Math.PI;
        const rgb = armOffset === 0 ? P_RGB : E_RGB;
        const t = T_MIN + Math.random() * (T_MAX - T_MIN);
        const sp = spiralPoint(t, armOffset);
        const [r, g, b] = rgb.map((v) => v | 0);
        const alpha = 0.3 + Math.random() * 0.45;
        const radius = (0.6 + Math.random() * 1.1) * SCALE;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(
          sp.x + (Math.random() - 0.5) * 3 * SCALE,
          sp.y + (Math.random() - 0.5) * 3 * SCALE,
          radius,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      raf = requestAnimationFrame(idleLoop);
    }

    function animate() {
      const f = frame;

      if (f < T.CRYS_END) {
        const trailAlpha = f > T.MORPH_END ? 0.35 : 0.18;
        ctx.fillStyle = `rgba(26,28,27,${trailAlpha})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.clearRect(0, 0, W, H);
      }

      if (f <= T.SING_END) drawSingularity();
      if (f > T.SING_END) drawExplosionFX();

      parts.forEach((p) => {
        updateParticle(p);
        drawParticle(p);
      });

      if (f >= T.MORPH_END) {
        const prog = (f - T.MORPH_END) / (T.CRYS_END - T.MORPH_END);
        drawFinalLogo(easeInOutQuart(Math.min(prog, 1)), f);
      }

      frame++;
      if (frame < T.CRYS_END + 10) {
        raf = requestAnimationFrame(animate);
      } else {
        idleLoop();
      }
    }

    if (reducedMotion) {
      ctx.clearRect(0, 0, W, H);
      drawFinalLogo(1, 0);
    } else if (props.mode === "idle") {
      idleLoop();
    } else {
      parts.forEach((p) => p.init());
      animate();
    }

    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
    });
  });

  return (
    <canvas
      ref={canvasRef}
      class={props.class}
      style={{ width: `${props.size ?? 600}px`, height: `${props.size ?? 600}px` }}
      aria-hidden="true"
    />
  );
}
