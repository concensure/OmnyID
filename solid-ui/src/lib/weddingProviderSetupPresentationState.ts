// @locs-version: 2.0
import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";

export type WeddingProviderSetupPresentationState = {
  buttonLabel: string;
  destinationLabel: string | null;
};

export function buildWeddingProviderSetupPresentationState(
  readiness: Pick<WeddingProviderExecutorReadinessState, "capability" | "setupView">,
): WeddingProviderSetupPresentationState {
  if (!readiness.setupView) {
    return {
      buttonLabel: "No setup needed",
      destinationLabel: null,
    };
  }
  if (readiness.capability === "email") {
    return {
      buttonLabel: "Open email setup",
      destinationLabel: "Email",
    };
  }
  if (readiness.capability === "calendar") {
    return {
      buttonLabel: "Open calendar setup",
      destinationLabel: "Calendar",
    };
  }
  if (readiness.capability === "registry") {
    return {
      buttonLabel: "Open Connected Apps",
      destinationLabel: "Connected Apps",
    };
  }
  if (readiness.capability === "vendor_search") {
    return {
      buttonLabel: "Connect vendor search",
      destinationLabel: "Connected Apps - Brave, EXA Search, Google Places, or OSM/Overpass",
    };
  }
  return {
    buttonLabel: "Open setup",
    destinationLabel: readiness.setupView.replace(/_/g, " "),
  };
}
