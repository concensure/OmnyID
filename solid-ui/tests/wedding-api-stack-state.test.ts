import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApiStackState } from "@/lib/weddingApiStackState";

test("buildWeddingApiStackState models horizontal wedding APIs instead of a giant vendor database", () => {
  const state = buildWeddingApiStackState({
    connectedAppIds: ["google-places-api", "google-maps-platform", "gcal", "weatherapi", "stripe"],
  });

  assert.equal(state.readyProviderLabels.includes("Google Places API"), true);
  assert.equal(state.readyProviderLabels.includes("Google Maps Platform"), true);
  assert.equal(state.readyProviderLabels.includes("Google Calendar API"), true);
  assert.equal(state.readyProviderLabels.includes("WeatherAPI"), true);
  assert.equal(state.readyProviderLabels.includes("Stripe"), true);
  assert.deepEqual(state.missingRequiredLabels, []);
  assert.deepEqual(state.optionalProviderLabels, ["Twilio Messaging", "Cloudinary"]);
  assert.match(state.summary, /required production providers connected/i);
  assert.ok(state.guardrails.some((guardrail) => /giant static vendor database/i.test(guardrail)));
  assert.ok(state.guardrails.some((guardrail) => /wedding_shared_tool_usage_event/i.test(guardrail)));
});

test("buildWeddingApiStackState reports missing required providers and keeps optional media/SMS separate", () => {
  const state = buildWeddingApiStackState({
    connectedAppIds: ["google-places-api"],
  });
  const maps = state.providers.find((provider) => provider.connectedAppId === "google-maps-platform");
  const twilio = state.providers.find((provider) => provider.connectedAppId === "twilio-messaging");
  const cloudinary = state.providers.find((provider) => provider.connectedAppId === "cloudinary");

  assert.equal(maps?.status, "missing");
  assert.equal(twilio?.status, "optional");
  assert.equal(cloudinary?.status, "optional");
  assert.ok(state.missingRequiredLabels.includes("Google Maps Platform"));
  assert.ok(state.missingRequiredLabels.includes("Google Calendar API"));
  assert.ok(state.missingRequiredLabels.includes("WeatherAPI"));
  assert.ok(state.missingRequiredLabels.includes("Stripe"));
  assert.ok(state.providers.some((provider) =>
    provider.need === "vendor_discovery"
    && provider.ontologyRole === "Vendor entity/location evidence"
  ));
});

test("buildWeddingApiStackState gives every shared provider a per-user metering contract", () => {
  const state = buildWeddingApiStackState({
    connectedAppIds: [
      "google-places-api",
      "google-maps-platform",
      "gcal",
      "weatherapi",
      "twilio-messaging",
      "stripe",
      "cloudinary",
    ],
  });

  for (const connectedAppId of [
    "google-maps-platform",
    "weatherapi",
    "twilio-messaging",
    "stripe",
    "cloudinary",
  ]) {
    const provider = state.providers.find((candidate) => candidate.connectedAppId === connectedAppId);
    assert.equal(provider?.meteringRequired, true);
    assert.equal(provider?.usageEventSource, "wedding_shared_tool_usage_event");
    assert.deepEqual(provider?.adminEnablementScopes, ["all users", "wedding planner only"]);
    assert.ok(provider?.usageMetadataFields.includes("user_id"));
    assert.ok(provider?.usageMetadataFields.includes("wedding_plan_id"));
    assert.ok(provider?.usageMetadataFields.includes("provider_request_id"));
  }

  assert.ok(state.meteringContractLabels.some((label) => /Google Maps Platform: wedding_shared_tool_usage_event/i.test(label)));
  assert.deepEqual(state.requiredUsageMetadataFields, [
    "user_id",
    "provider_id",
    "template_scope",
    "wedding_plan_id",
    "operation",
    "quantity",
    "estimated_cost",
    "provider_request_id",
  ]);
});
