import test from "node:test";
import assert from "node:assert/strict";

import {
  accountLooksLikeAdmin,
  activePrimaryUseCase,
  applyPrimaryUseCaseTheme,
  buildPrimaryUseCaseProfile,
  completePrimaryUseCaseProfile,
  inferPrimaryUseCaseKindFromText,
  primaryUseCaseThemeClass,
  profileNeedsPrimaryUseCasePrompt,
  shouldApplyAgentInferredPrimaryUseCase,
  withAdminPrimaryUseCaseDefault,
} from "../src/lib/primaryUseCaseProfileState.ts";
import type { UserSelfProfile } from "../src/lib/profileLedger.ts";

function baseProfile(): UserSelfProfile {
  return {
    interests: [],
    goals_domains: [],
    value_weights: {
      health: 0.5,
      family: 0.5,
      wealth: 0.5,
      social_life: 0.5,
    },
    active_value_override: null,
    vetos: [],
  };
}

test("primary use case prompt is required when profile has no active use case", () => {
  assert.equal(profileNeedsPrimaryUseCasePrompt(baseProfile()), true);

  const profile = {
    ...baseProfile(),
    primary_use_case: buildPrimaryUseCaseProfile("study", "profile", "2026-09-13T00:00:00.000Z"),
  };

  assert.equal(profileNeedsPrimaryUseCasePrompt(profile), false);
});

test("wedding-site entry source skips the primary use case prompt entirely", () => {
  assert.equal(profileNeedsPrimaryUseCasePrompt(baseProfile(), "wedding_site"), false);

  const completed = {
    ...baseProfile(),
    primary_use_case: completePrimaryUseCaseProfile(
      buildPrimaryUseCaseProfile("wedding_planning", "profile", "2026-09-13T00:00:00.000Z"),
      "2026-09-14T00:00:00.000Z",
    ),
  };
  assert.equal(profileNeedsPrimaryUseCasePrompt(completed, "wedding_site"), false);

  // A generic (non-wedding) or unrecorded entry source keeps the original first-time-user gating.
  assert.equal(profileNeedsPrimaryUseCasePrompt(baseProfile(), "generic"), true);
  assert.equal(profileNeedsPrimaryUseCasePrompt(baseProfile(), null), true);
});

test("completed primary use case reverts active theme", () => {
  const activeWedding = buildPrimaryUseCaseProfile("wedding_planning", "profile", "2026-09-13T00:00:00.000Z");
  const profile = { ...baseProfile(), primary_use_case: activeWedding };

  assert.equal(activePrimaryUseCase(profile)?.kind, "wedding_planning");
  assert.equal(primaryUseCaseThemeClass(profile), "omnyid-usecase-wedding-planning");

  const completed = {
    ...profile,
    primary_use_case: completePrimaryUseCaseProfile(activeWedding, "2026-09-14T00:00:00.000Z"),
  };

  assert.equal(activePrimaryUseCase(completed), null);
  assert.equal(primaryUseCaseThemeClass(completed), null);
  assert.equal(profileNeedsPrimaryUseCasePrompt(completed), true);
});

test("the exact OmnyID admin account defaults to the regular workspace", () => {
  assert.equal(accountLooksLikeAdmin("admin@omnyid.com"), true);

  const profile = withAdminPrimaryUseCaseDefault(
    baseProfile(),
    "admin@omnyid.com",
    "2026-09-13T00:00:00.000Z",
  );

  assert.equal(profile.primary_use_case?.kind, "general");
  assert.equal(profile.primary_use_case?.status, "active");
  assert.equal(profile.primary_use_case?.source, "admin_default");
  assert.equal(primaryUseCaseThemeClass(profile), null);
});

test("admin default respects a completed primary use case so the theme can revert", () => {
  const completedWedding = completePrimaryUseCaseProfile(
    buildPrimaryUseCaseProfile("wedding_planning", "profile", "2026-09-13T00:00:00.000Z"),
    "2026-09-14T00:00:00.000Z",
  );
  const profile = {
    ...baseProfile(),
    primary_use_case: completedWedding,
  };

  const next = withAdminPrimaryUseCaseDefault(profile, "admin@omnyid.com", "2026-09-15T00:00:00.000Z");

  assert.equal(next.primary_use_case?.status, "completed");
  assert.equal(primaryUseCaseThemeClass(next), null);
});

test("applyPrimaryUseCaseTheme removes stale use-case theme classes before applying the next one", () => {
  const classSet = new Set<string>(["omnyid-usecase-wedding-planning", "omnyid-usecase-travel"]);
  const body = {
    classList: {
      add(value: string) {
        classSet.add(value);
      },
      remove(value: string) {
        classSet.delete(value);
      },
    },
  } as HTMLElement;

  const studyProfile = {
    ...baseProfile(),
    primary_use_case: buildPrimaryUseCaseProfile("study", "profile", "2026-09-13T00:00:00.000Z"),
  };

  const applied = applyPrimaryUseCaseTheme(studyProfile, body);

  assert.equal(applied, "omnyid-usecase-study");
  assert.deepEqual([...classSet].sort(), ["omnyid-usecase-study"]);
});

test("inferPrimaryUseCaseKindFromText prioritizes specific use cases over generic study", () => {
  assert.equal(
    inferPrimaryUseCaseKindFromText("I am a medical student building Anki cards for pathophys and pharm."),
    "medical_study",
  );
  assert.equal(
    inferPrimaryUseCaseKindFromText("We need help planning our wedding and choosing a celebrant."),
    "wedding_planning",
  );
  assert.equal(inferPrimaryUseCaseKindFromText("Help me with exam prep for this course."), "study");
  assert.equal(inferPrimaryUseCaseKindFromText("Just chatting today."), null);
});

test("agent-inferred primary use case does not override a specific active use case", () => {
  const weddingProfile = {
    ...baseProfile(),
    primary_use_case: buildPrimaryUseCaseProfile("wedding_planning", "profile", "2026-09-13T00:00:00.000Z"),
  };
  const generalProfile = {
    ...baseProfile(),
    primary_use_case: buildPrimaryUseCaseProfile("general", "profile", "2026-09-13T00:00:00.000Z"),
  };
  const completedProfile = {
    ...weddingProfile,
    primary_use_case: completePrimaryUseCaseProfile(weddingProfile.primary_use_case, "2026-09-14T00:00:00.000Z"),
  };

  assert.equal(shouldApplyAgentInferredPrimaryUseCase(weddingProfile, "study"), false);
  assert.equal(shouldApplyAgentInferredPrimaryUseCase(generalProfile, "study"), true);
  assert.equal(shouldApplyAgentInferredPrimaryUseCase(completedProfile, "travel_planning"), true);
  assert.equal(shouldApplyAgentInferredPrimaryUseCase(baseProfile(), null), false);
});
