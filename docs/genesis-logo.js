/**
 * Genesis logo animation — particles condense from a singularity into the
 * OmnyID spiral mark, then idle with wandering sparks. Same algorithm as
 * solid-ui/src/components/GenesisLogoAnimation.tsx and the original
 * solid-ui/public/logo-animation.html, ported to plain JS so the static
 * docs site (no framework/bundler) can reuse it.
 *
 * mode: "full" plays the ~10s condensation sequence once then idles —
 * reserve for rare, meaningful waits. mode: "idle" (default here, since
 * docs-site waits are short network calls) skips straight to the
 * crystallised mark with its spark loop.
 *
 * Usage:
 *   const handle = OmnyIDGenesisLogo.mount(canvasEl, { size: 20, mode: "idle" });
 *   handle.stop(); // cancels the animation frame loop
 */
(function (global) {
  "use strict";

  function mount(canvas, options) {
    var opts = options || {};
    var size = opts.size || 600;
    var mode = opts.mode || "idle";
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return { stop: function () {} };
    }

    var W = size;
    var H = size;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    var CX = W / 2;
    var CY = H / 2;
    var SCALE = size / 600;

    var reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var P_RGB = [49, 86, 142]; // #31568e — primary blue
    var E_RGB = [217, 107, 57]; // #d96b39 — ember orange

    var B = 0.24;
    var T_MIN = 0.45;
    var T_MAX = Math.PI * 3.05;
    var R_MIN_RAW = Math.exp(B * T_MIN);
    var R_MAX_RAW = Math.exp(B * T_MAX);

    function spiralR(t) {
      return (18 + ((Math.exp(B * t) - R_MIN_RAW) / (R_MAX_RAW - R_MIN_RAW)) * 177) * SCALE;
    }

    function waveOffset(t, frac) {
      var amp = 4.2 * SCALE * (1 - frac * 0.68);
      return (
        Math.sin(t * 4.1) * amp +
        Math.sin(t * 9.7) * amp * 0.32 +
        Math.sin(t * 21.3) * amp * 0.11 +
        Math.sin(t * 46.1) * amp * 0.04
      );
    }

    function spiralPoint(t, armOffset) {
      var frac = (t - T_MIN) / (T_MAX - T_MIN);
      var r = spiralR(t);
      var angle = t + armOffset;
      var wave = waveOffset(t, frac);
      var perp = angle + Math.PI / 2;
      return {
        x: CX + r * Math.cos(angle) + Math.cos(perp) * wave,
        y: CY + r * Math.sin(angle) + Math.sin(perp) * wave,
        frac: frac
      };
    }

    function buildLogoPoints() {
      var pts = [];

      var NUCLEUS_N = 32;
      for (var i = 0; i < NUCLEUS_N; i++) {
        var a = (i / NUCLEUS_N) * Math.PI * 2;
        var r = (1.2 + (i % 3) * 0.9) * SCALE;
        var mix = i / NUCLEUS_N;
        pts.push({
          x: CX + r * Math.cos(a),
          y: CY + r * Math.sin(a),
          rgb: [
            P_RGB[0] * (1 - mix) + E_RGB[0] * mix,
            P_RGB[1] * (1 - mix) + E_RGB[1] * mix,
            P_RGB[2] * (1 - mix) + E_RGB[2] * mix
          ],
          frac: 0
        });
      }

      var ARM_N = 132;
      for (var arm = 0; arm < 2; arm++) {
        var offset = arm === 0 ? 0 : Math.PI;
        var rgb = arm === 0 ? P_RGB : E_RGB;
        for (var j = 0; j < ARM_N; j++) {
          var t = T_MIN + (j / (ARM_N - 1)) * (T_MAX - T_MIN);
          var sp = spiralPoint(t, offset);
          pts.push({ x: sp.x, y: sp.y, rgb: rgb, frac: sp.frac });
        }
      }

      return pts;
    }

    var LOGO_PTS = buildLogoPoints();
    var N = LOGO_PTS.length;

    function Particle(i) {
      this.i = i;
      this.tgt = LOGO_PTS[i];
      this.sz = (0.85 + Math.random() * 1.5) * SCALE;
      this.init();
    }

    Particle.prototype.init = function () {
      this.x = CX + (Math.random() - 0.5) * 3 * SCALE;
      this.y = CY + (Math.random() - 0.5) * 3 * SCALE;
      this.vx = 0;
      this.vy = 0;
      this.exploded = false;

      var tAngle = Math.atan2(this.tgt.y - CY, this.tgt.x - CX);
      var rndAngle = Math.random() * Math.PI * 2;
      var blend = tAngle + (rndAngle - tAngle) * 0.4;
      var spiralLean = blend + (this.tgt.frac > 0.5 ? 0.45 : -0.45);
      var speed = (1.8 + Math.random() * 3.8) * SCALE;
      this.bvx = Math.cos(spiralLean) * speed;
      this.bvy = Math.sin(spiralLean) * speed;
    };

    var parts = [];
    for (var pi = 0; pi < N; pi++) parts.push(new Particle(pi));

    var T = {
      SING_END: 85,
      EXPL_END: 220,
      STAR_END: 330,
      MORPH_END: 550,
      CRYS_END: 625
    };

    var frame = 0;
    var idleFrame = 0;
    var raf = 0;
    var stopped = false;

    function easeInOutQuart(t) {
      return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    }

    function updateParticle(p) {
      var f = frame;

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
        var dx = p.tgt.x - p.x;
        var dy = p.tgt.y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy) + 0.001;

        var radial = 0.055;
        var tangential = 0.022 * Math.min(dist / (90 * SCALE), 1);

        p.vx += dx * radial + (-dy / dist) * tangential * dist;
        p.vy += dy * radial + (dx / dist) * tangential * dist;
        p.vx *= 0.81;
        p.vy *= 0.81;
        p.x += p.vx;
        p.y += p.vy;
        return;
      }

      var sh = 0.22 * SCALE * Math.sin(frame * 0.09 + p.i * 0.63);
      p.x = p.tgt.x + (Math.random() - 0.5) * sh;
      p.y = p.tgt.y + (Math.random() - 0.5) * sh;
    }

    function drawParticle(p) {
      var r = p.tgt.rgb[0] | 0;
      var g = p.tgt.rgb[1] | 0;
      var b = p.tgt.rgb[2] | 0;

      ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      ctx.fill();

      if (p.sz > 1.6 * SCALE || frame < T.EXPL_END + 30) {
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.10)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawSingularity() {
      var pulse = 0.5 + 0.5 * Math.sin(frame * 0.19);
      var outer = (60 + pulse * 28) * SCALE;

      var grd = ctx.createRadialGradient(CX, CY, 0, CX, CY, outer);
      grd.addColorStop(0, "rgba(255,215,165," + 0.95 * pulse + ")");
      grd.addColorStop(0.22, "rgba(217,107,57," + 0.6 * pulse + ")");
      grd.addColorStop(0.52, "rgba(49,86,142," + 0.28 * pulse + ")");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(CX, CY, outer, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,235,205," + (0.75 + 0.25 * pulse) + ")";
      ctx.beginPath();
      ctx.arc(CX, CY, (2.5 + pulse * 2.5) * SCALE, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawExplosionFX() {
      var f = frame;

      if (f > T.SING_END && f < T.SING_END + 14) {
        var a = 1 - (f - T.SING_END) / 14;
        ctx.fillStyle = "rgba(255,225,190," + a * 0.55 + ")";
        ctx.fillRect(0, 0, W, H);
      }

      if (f > T.SING_END && f < T.EXPL_END + 50) {
        var p = Math.min((f - T.SING_END) / (T.EXPL_END - T.SING_END), 1);

        ctx.strokeStyle = "rgba(217,107,57," + (1 - p) * 0.75 + ")";
        ctx.lineWidth = 1.5 * SCALE;
        ctx.beginPath();
        ctx.arc(CX, CY, p * 240 * SCALE, 0, Math.PI * 2);
        ctx.stroke();

        if (p > 0.22) {
          var p2 = (p - 0.22) / 0.78;
          ctx.strokeStyle = "rgba(49,86,142," + (1 - p2) * 0.5 + ")";
          ctx.lineWidth = 1 * SCALE;
          ctx.beginPath();
          ctx.arc(CX, CY, p2 * 205 * SCALE, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    function drawVectorArm(armOffset, rgb, baseWidth) {
      var STEPS = 500;
      var pts = [];

      for (var i = 0; i <= STEPS; i++) {
        var frac = i / STEPS;
        var t = T_MIN + frac * (T_MAX - T_MIN);
        var sp = spiralPoint(t, armOffset);
        pts.push({ x: sp.x, y: sp.y, frac: frac });
      }

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      var r = rgb[0], g = rgb[1], b = rgb[2];

      for (var k = 0; k < pts.length - 1; k++) {
        var f = pts[k].frac;
        var lw = baseWidth * (1 - f * 0.72);
        var alp = 0.92 - f * 0.68;
        ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + alp + ")";
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(pts[k].x, pts[k].y);
        ctx.lineTo(pts[k + 1].x, pts[k + 1].y);
        ctx.stroke();
      }

      for (var m = 0; m < pts.length - 1; m += 5) {
        var f2 = pts[m].frac;
        var glw = baseWidth * 8 * (1 - f2 * 0.58);
        ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",0.045)";
        ctx.lineWidth = glw;
        ctx.beginPath();
        ctx.moveTo(pts[m].x, pts[m].y);
        ctx.lineTo(pts[m + 1].x, pts[m + 1].y);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawNucleusGlow(t) {
      var pulse = 0.7 + 0.3 * Math.sin(t * 0.055);
      var radius = 18 * pulse * SCALE;
      var cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, radius);
      cg.addColorStop(0, "rgba(255,228,200," + 0.95 * pulse + ")");
      cg.addColorStop(0.3, "rgba(217,107,57," + 0.75 * pulse + ")");
      cg.addColorStop(0.62, "rgba(49,86,142," + 0.4 * pulse + ")");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(CX, CY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawFinalLogo(alpha, t) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawVectorArm(0, P_RGB, 3.0 * SCALE);
      drawVectorArm(Math.PI, E_RGB, 3.0 * SCALE);
      drawNucleusGlow(t);
      ctx.restore();
    }

    function idleLoop() {
      if (stopped) return;
      idleFrame++;
      ctx.clearRect(0, 0, W, H);
      drawFinalLogo(1, idleFrame);

      if (idleFrame % 5 === 0) {
        var armOffset = Math.random() < 0.5 ? 0 : Math.PI;
        var rgb = armOffset === 0 ? P_RGB : E_RGB;
        var t = T_MIN + Math.random() * (T_MAX - T_MIN);
        var sp = spiralPoint(t, armOffset);
        var r = rgb[0] | 0, g = rgb[1] | 0, b = rgb[2] | 0;
        var alpha = 0.3 + Math.random() * 0.45;
        var radius = (0.6 + Math.random() * 1.1) * SCALE;
        ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(
          sp.x + (Math.random() - 0.5) * 3 * SCALE,
          sp.y + (Math.random() - 0.5) * 3 * SCALE,
          radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      raf = requestAnimationFrame(idleLoop);
    }

    function animate() {
      if (stopped) return;
      var f = frame;

      if (f < T.CRYS_END) {
        var trailAlpha = f > T.MORPH_END ? 0.35 : 0.18;
        ctx.fillStyle = "rgba(26,28,27," + trailAlpha + ")";
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.clearRect(0, 0, W, H);
      }

      if (f <= T.SING_END) drawSingularity();
      if (f > T.SING_END) drawExplosionFX();

      for (var i = 0; i < parts.length; i++) {
        updateParticle(parts[i]);
        drawParticle(parts[i]);
      }

      if (f >= T.MORPH_END) {
        var prog = (f - T.MORPH_END) / (T.CRYS_END - T.MORPH_END);
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
    } else if (mode === "idle") {
      idleLoop();
    } else {
      animate();
    }

    return {
      stop: function () {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
      }
    };
  }

  global.OmnyIDGenesisLogo = { mount: mount };
})(window);
