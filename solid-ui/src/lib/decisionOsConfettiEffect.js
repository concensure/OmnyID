import { decisionOsConfettiParticleSpecs } from "./decisionOsCelebrationState.ts";

export function appendDecisionOsConfetti(container, options = {}) {
  const particles = options.particles ?? decisionOsConfettiParticleSpecs();
  const createElement = options.createElement ?? ((tagName) => document.createElement(tagName));
  const scheduleRemoval = options.scheduleRemoval ?? ((remove, delayMs) => setTimeout(remove, delayMs));

  for (const particle of particles) {
    const element = createElement("div");
    element.style.cssText = [
      "position:absolute;width:7px;height:7px;border-radius:2px;pointer-events:none;z-index:999;",
      `background:${particle.background};`,
      `left:${particle.leftPct}%;top:${particle.topPct}%;`,
      "animation:confetti-fall 1s ease-in forwards;",
      `animation-delay:${particle.animationDelaySec}s;`,
      `transform:rotate(${particle.rotateDeg}deg);`,
    ].join("");
    container.appendChild(element);
    scheduleRemoval(() => element.remove(), 1500);
  }

  return particles.length;
}
