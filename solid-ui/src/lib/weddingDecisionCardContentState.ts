// @locs-version: 1.0
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";

export type WeddingDecisionSupport = {
  statusLabel: string;
  knownFacts: string[];
  oneThingToConfirm: string | null;
  primaryOutcome: string;
  compromise: string | null;
  alternative: string | null;
  unconfirmed: string | null;
};

export type WeddingDecisionCardContent = {
  title: string;
  whyItMatters: string;
  primaryActionLabel: string;
  recommendationSummary: string | null;
  recommendationReasons: string[];
  timeSensitivity: { label: string; at: string } | null;
  support: WeddingDecisionSupport;
};

const INTERNAL_COPY = /(saved evidence|backed by the wedding plan|hard constraints|ready to review|evidence signal|prepared wedding research brief|planning check)/i;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sentence(value: string): string {
  if (!value) return value;
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export function formatWeddingDecisionDate(value: string | null | undefined): string | null {
  const parsed = value ? new Date(value) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function usefulFacts(item: FocusDeckItem): string[] {
  const seen = new Set<string>();
  return item.evidenceLabels.flatMap((raw) => {
    const value = clean(raw).replace(/^priority:\s*/i, "");
    const key = value.toLowerCase();
    if (!value || INTERNAL_COPY.test(value) || seen.has(key)) return [];
    seen.add(key);
    return [sentence(value)];
  }).slice(0, 2);
}

function transportContent(item: FocusDeckItem, facts: string[]): WeddingDecisionCardContent {
  const evidence = `${item.title} ${item.recommendedActionLabel} ${item.whyNowLabel} ${item.evidenceLabels.join(" ")}`;
  const booked = /booked|booking confirmed|deposit paid/i.test(evidence);
  const choiceSaved = /selected|preferred option|choice saved|agreed/i.test(evidence);
  const quotes = /quotes? received|quote comparison|comparable quotes?|quoted total/i.test(evidence);
  const shortlist = Boolean(item.vendorComparison?.cards.length) || /shortlist|options? identified|requirements? confirmed|passengers? confirmed/i.test(evidence);
  const date = formatWeddingDecisionDate(item.dueAt);

  if (booked) return {
    title: "What transport details should go into your wedding plan?",
    whyItMatters: facts[0] ?? "Connect the confirmed arrangement to your budget and run sheet so pickup details are not lost.",
    primaryActionLabel: "Add booking details",
    recommendationSummary: null,
    recommendationReasons: [],
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: "Ready to record",
      knownFacts: facts,
      oneThingToConfirm: "The final passengers, pickup locations and pickup times.",
      primaryOutcome: "Add the booking to the budget and run sheet.",
      compromise: null,
      alternative: null,
      unconfirmed: "Final pickup details remain unconfirmed until they are recorded.",
    },
  };

  if (choiceSaved) return {
    title: "Is this the transport arrangement you want to use?",
    whyItMatters: facts[0] ?? "Confirm the preferred arrangement before creating booking and coordination work.",
    primaryActionLabel: "Confirm our choice",
    recommendationSummary: clean(item.recommendedActionLabel) || null,
    recommendationReasons: facts,
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: "Ready to confirm",
      knownFacts: facts,
      oneThingToConfirm: "Whether this is a preference or an agreed choice.",
      primaryOutcome: "Record the agreement and create the next booking tasks.",
      compromise: "A hired option adds cost and pickup coordination.",
      alternative: "Use existing vehicles, or no extra transport when the day stays in one place.",
      unconfirmed: "Final availability, price and service details still need vendor confirmation.",
    },
  };

  if (quotes) return {
    title: "Which transport quote fits your wedding best?",
    whyItMatters: facts[0] ?? "Compare total cost, passenger coverage and pickup terms on the same basis before choosing.",
    primaryActionLabel: "Compare your quotes",
    recommendationSummary: clean(item.recommendedActionLabel) && !INTERNAL_COPY.test(item.recommendedActionLabel) ? clean(item.recommendedActionLabel) : null,
    recommendationReasons: facts,
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: "Ready to compare",
      knownFacts: facts,
      oneThingToConfirm: "Any fee, route or passenger requirement that is still missing from a quote.",
      primaryOutcome: "Compare inclusions, unknowns and total costs side by side.",
      compromise: "The lowest price may cover fewer passengers, stops or waiting time.",
      alternative: "Keep the choice open until the missing quote detail is confirmed.",
      unconfirmed: "Unknown quote fees remain unknown until the vendor confirms them.",
    },
  };

  if (shortlist) return {
    title: "Which transport arrangement suits your wedding?",
    whyItMatters: facts[0] ?? "Compare capacity, locations, timing and budget before asking a provider to hold a vehicle.",
    primaryActionLabel: item.vendorComparison?.cards.length ? "Compare transport options" : "Prepare quote requests",
    recommendationSummary: item.vendorComparison?.cards.length && !INTERNAL_COPY.test(item.recommendedActionLabel) ? clean(item.recommendedActionLabel) : null,
    recommendationReasons: facts,
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: item.vendorComparison?.cards.length ? "Ready to compare" : "Ready for quotes",
      knownFacts: facts,
      oneThingToConfirm: "Current availability and a complete price for the required route.",
      primaryOutcome: item.vendorComparison?.cards.length ? "Review practical alternatives before choosing." : "Create editable enquiries for review before anything is sent.",
      compromise: "Hired transport keeps the group together but adds cost and coordination.",
      alternative: "Use existing vehicles, or no extra transport when the day stays in one place.",
      unconfirmed: "Availability and final price are not assumed.",
    },
  };

  return {
    title: "How should your wedding party travel?",
    whyItMatters: facts[0] ?? "First confirm whether anyone needs help travelling between wedding locations; paid transport may not be necessary.",
    primaryActionLabel: "Confirm who needs transport",
    recommendationSummary: null,
    recommendationReasons: [],
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: "Needs your input",
      knownFacts: facts,
      oneThingToConfirm: "Who needs a lift, between which locations, and at what times?",
      primaryOutcome: "Save the passenger and route requirement before comparing options.",
      compromise: null,
      alternative: "Use existing vehicles, or no extra transport when the day stays in one place.",
      unconfirmed: "Passenger count, route and timing are not confirmed yet.",
    },
  };
}

export function buildWeddingDecisionCardContent(item: FocusDeckItem): WeddingDecisionCardContent {
  const facts = usefulFacts(item);
  const contract = item.decisionContract;
  if (contract) {
    const knownFacts = Array.from(new Set([...contract.knownFacts, ...facts])).slice(0, 3);
    const recommendation = clean(item.recommendedActionLabel);
    const usableRecommendation = contract.recommendationSupported
      && recommendation
      && recommendation !== contract.primaryActionLabel
      && !INTERNAL_COPY.test(recommendation)
      ? recommendation
      : null;
    const date = formatWeddingDecisionDate(item.dueAt);
    const unknownEvidence = contract.evidence.find((evidence) => evidence.status !== "confirmed")?.label ?? null;
    const alternative = contract.options.find((option) => option.id !== "keep" && option.id !== "confirm") ?? contract.options[1] ?? null;
    return {
      title: contract.question,
      whyItMatters: contract.missingPrerequisite
        ? `${contract.missingPrerequisite.label} must be resolved before this decision can safely advance.`
        : clean(item.whyNowLabel) && !INTERNAL_COPY.test(item.whyNowLabel)
          ? sentence(clean(item.whyNowLabel))
          : contract.deadlineReason,
      primaryActionLabel: contract.primaryActionLabel,
      recommendationSummary: usableRecommendation,
      recommendationReasons: usableRecommendation ? knownFacts : [],
      timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
      support: {
        statusLabel: contract.missingPrerequisite ? "Prerequisite needed" : contract.recommendationSupported ? "Ready to choose" : "Needs your input",
        knownFacts,
        oneThingToConfirm: contract.oneThingToConfirm,
        primaryOutcome: contract.primaryOutcome,
        compromise: contract.recommendationSupported ? unknownEvidence : null,
        alternative: alternative ? `${alternative.label}: ${alternative.summary}` : null,
        unconfirmed: unknownEvidence ?? (contract.oneThingToConfirm ? `${contract.oneThingToConfirm} is not confirmed yet.` : null),
      },
    };
  }
  if (/transport|limousine|pickup schedule|guest logistics|travel arrangement/i.test(item.title)) {
    return transportContent(item, facts);
  }

  const date = formatWeddingDecisionDate(item.dueAt);
  const response = item.kind === "response";
  const vendorComparison = Boolean(item.vendorComparison?.cards.length);
  const recommendation = clean(item.recommendedActionLabel);
  const usableRecommendation = recommendation && !INTERNAL_COPY.test(recommendation) ? recommendation : null;
  return {
    title: clean(item.title) || "What needs your decision?",
    whyItMatters: facts[0] ?? (response
      ? "Review what changed and choose the safe next action before anything is sent."
      : "Resolve this one planning question before moving to its booking or coordination work."),
    primaryActionLabel: response ? "Review response" : vendorComparison ? "Open shortlist" : "Open next step",
    recommendationSummary: usableRecommendation,
    recommendationReasons: facts,
    timeSensitivity: date && item.dueAt ? { label: `Task due ${date}`, at: item.dueAt } : null,
    support: {
      statusLabel: response ? "Needs your review" : vendorComparison ? "Ready to compare" : "Needs your input",
      knownFacts: facts,
      oneThingToConfirm: vendorComparison ? "Which option best meets the stated priorities and remaining unknowns?" : "The one missing detail needed to complete this step.",
      primaryOutcome: response ? "Review the prepared response without sending it." : vendorComparison ? "Compare the options and their trade-offs." : "Open the exact task and record the missing detail.",
      compromise: vendorComparison ? "The best fit may not be the lowest-cost option." : null,
      alternative: vendorComparison ? "Keep the choice open until the most important unknown is confirmed." : null,
      unconfirmed: vendorComparison ? "Availability and final price remain unconfirmed unless a source says otherwise." : null,
    },
  };
}
