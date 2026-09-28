import test from "node:test";
import assert from "node:assert/strict";

import { decisionOsConfettiParticleSpecs } from "../src/lib/decisionOsCelebrationState.ts";

test("decisionos celebration state builds bounded confetti particle specs", () => {
  const values = [0, 0.25, 0.5, 0.75, 1];
  let cursor = 0;
  const rng = () => {
    const value = values[cursor % values.length];
    cursor += 1;
    return value;
  };

  const particles = decisionOsConfettiParticleSpecs(3, rng);
  assert.equal(particles.length, 3);
  assert.deepEqual(particles.map((particle) => particle.background), [
    "#6366f1",
    "#22c55e",
    "#f59e0b",
  ]);

  for (const particle of particles) {
    assert.ok(particle.leftPct >= 10 && particle.leftPct <= 90);
    assert.ok(particle.topPct >= 10 && particle.topPct <= 50);
    assert.ok(particle.animationDelaySec >= 0 && particle.animationDelaySec <= 0.4);
    assert.ok(particle.rotateDeg >= 0 && particle.rotateDeg <= 360);
  }
});
