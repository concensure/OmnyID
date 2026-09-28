import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  buildReportKnowledgeContext,
  buildReportImmediateAction,
  buildReportPrompt,
  buildReportQuickStartSeed,
  buildReadyReportLauncherState,
  extractReportKnowledgeContext,
  recommendedReportOutputFormat,
  reportOutputFormatOption,
  reportOutputSectionsForKind,
  reportSourceRequirementsForKind,
  reportTemplateForKind,
} from "../src/lib/reportGeneratorState.ts";

function message(overrides: Partial<AfpMessage>): AfpMessage {
  return {
    id: "msg_1",
    thread_id: "thread_1",
    from: "user",
    timestamp: "2026-09-08T00:00:00Z",
    type: "knowledge_card",
    supertags: [],
    content: {},
    metadata: {},
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("extractReportKnowledgeContext summarizes graph, supertags, and Zettelkasten signals", () => {
  const messages: AfpMessage[] = [
    message({
      id: "econ_week3",
      supertags: ["course:econ101", "week:3", "topic:market_failures", "knowledge_mode:zettelkasten"],
      content: {
        title: "Market failures",
        summary: "Externalities and public goods.",
      },
      metadata: {
        knowledge_mode: "zettelkasten",
        academic_course_tag: "course:econ101",
        academic_week_tag: "week:3",
        knowledge_graph_group_key: "topic:market_failures",
        knowledge_graph_link_tags: ["topic:externalities", "week:3"],
        zettelkasten_next_action: "Write how externalities challenge simple market efficiency.",
      },
    }),
    message({
      id: "econ_reading",
      timestamp: "2026-09-07T00:00:00Z",
      type: "parsed_document",
      supertags: ["course:econ101", "week:3", "topic:externalities"],
      content: {
        title: "Externalities reading",
        summary: "A reading on external costs.",
      },
      metadata: {
        knowledge_mode: "connected_notes",
        knowledge_pipeline: "connected_notes_ingest",
        academic_course_tag: "course:econ101",
        academic_week_tag: "week:3",
        academic_chapter_tag: "chapter:4",
        academic_unit_tag: "unit:market-failures",
        knowledge_graph_group_key: "topic:market_failures",
      },
    }),
  ];

  const context = extractReportKnowledgeContext(messages);

  assert.equal(context.cardCount, 2);
  assert.equal(context.focusedCardCount, 0);
  assert.equal(context.readinessLevel, "draft_ready");
  assert.equal(context.sourceCoverageLevel, "connected_multi_source");
  assert.equal(context.zettelkastenCardCount, 1);
  assert.ok(context.linkedCardCount >= 1);
  assert.ok(context.courseTags.includes("course:econ101"));
  assert.ok(context.weekTags.includes("week:3"));
  assert.ok(context.chapterTags.includes("chapter:4"));
  assert.ok(context.unitTags.includes("unit:market-failures"));
  assert.ok(context.topSupertags.includes("topic:externalities"));
  assert.ok(context.graphAnchors.includes("topic:market_failures"));
  assert.ok(context.evidenceSources.includes("Market failures"));
  assert.match(context.zettelkastenNextActions.join(" "), /market efficiency/i);
  assert.match(context.topologySummary, /knowledge cards/i);
});

test("extractReportKnowledgeContext summarizes medical concept-edge cards for regenerated recall", () => {
  const context = extractReportKnowledgeContext([
    message({
      id: "medical-edge",
      supertags: [
        "medical_concept_relationship",
        "medical_concept_edge_review",
        "medical_cloze_vignette",
        "relationship:pharm_to_contraindication",
        "course:med101",
        "chapter:heart-failure",
      ],
      content: {
        title: "pharm -> contraindication",
        summary: "Medical concept relationship extracted from a saved cloze/vignette artifact.",
      },
      metadata: {
        academic_kind: "medical_cloze_vignette",
        academic_course_tag: "course:med101",
        academic_chapter_tag: "chapter:heart-failure",
        knowledge_graph_group_key: "deck-1:0:pharm_to_contraindication:pharm",
        knowledge_graph_link_tags: [
          "medical_concept_edge_review",
          "relationship:pharm_to_contraindication",
          "concept:pharm",
          "concept:contraindication",
        ],
      },
    }),
  ]);

  assert.equal(context.cardCount, 1);
  assert.ok(context.topSupertags.includes("medical_concept_relationship"));
  assert.ok(context.graphAnchors.includes("deck-1:0:pharm_to_contraindication:pharm"));
  assert.ok(context.graphAnchors.includes("medical_concept_edge_review"));
  assert.ok(context.chapterTags.includes("chapter:heart-failure"));
  assert.match(context.topologySummary, /1 medical concept-edge card available for regenerated recall/i);
  assert.match(context.topologySummary, /pharm -> contraindication/i);
});

test("buildReportPrompt requires linked study context before generic advice", () => {
  const template = reportTemplateForKind("exam_preparation");
  const prompt = buildReportPrompt({
    template,
    goal: "I need to prepare for ECON101.",
    upcomingExam: "Final exam next Friday",
    context: {
      cardCount: 3,
      focusedCardCount: 0,
      linkedCardCount: 2,
      zettelkastenCardCount: 1,
      sourceCount: 2,
      sourceCoverageLevel: "connected_multi_source",
      sourceCoverageSummary: "Uses 2 retained sources with enough graph links for stronger synthesis.",
      topSupertags: ["topic:market_failures"],
      graphAnchors: ["topic:externalities"],
      evidenceSources: ["Externalities reading.pdf"],
      missingInputs: [],
      zettelkastenNextActions: ["Promote the externalities note into a permanent note."],
      courseTags: ["course:econ101"],
      weekTags: ["week:3"],
      chapterTags: [],
      unitTags: [],
      topologySummary: "3 knowledge cards, 2 linked cards, 2 source anchors, 1 Zettelkasten cards.",
      readinessLevel: "grounded_ready",
      readinessLabel: "Ready for linked synthesis",
    },
  });

  assert.match(prompt, /exam preparation report/i);
  assert.match(prompt, /Final exam next Friday/i);
  assert.match(prompt, /Student state: urgency=soon; stress=stressed/i);
  assert.match(prompt, /Report readiness: grounded_ready - Ready for linked synthesis/i);
  assert.match(prompt, /Source coverage: connected_multi_source/i);
  assert.match(prompt, /course:econ101/i);
  assert.match(prompt, /Chapter tags: not yet detected/i);
  assert.match(prompt, /Unit tags: not yet detected/i);
  assert.match(prompt, /Knowledge graph anchors: topic:externalities/i);
  assert.match(prompt, /Likely source evidence: Externalities reading\.pdf/i);
  assert.match(prompt, /Best source inputs for this report/i);
  assert.match(prompt, /Lecture or tutorial notes/i);
  assert.match(prompt, /Known gaps before relying on this report: none obvious/i);
  assert.match(prompt, /Required output sections/i);
  assert.match(prompt, /Priority map/i);
  assert.match(prompt, /Academic integrity guardrails/i);
  assert.match(prompt, /do not present unsourced claims as final academic work/i);
  assert.match(prompt, /Immediate first action/i);
  assert.match(prompt, /Requested output format: Chat report/i);
  assert.match(prompt, /Study output contract:/i);
  assert.match(prompt, /Scope inputs allowed:/i);
  assert.match(prompt, /Export contract:/i);
  assert.match(prompt, /Structure contract:/i);
  assert.match(prompt, /Make the output reusable/i);
  assert.match(prompt, /Zettelkasten next-note moves/i);
  assert.match(prompt, /Use retained linked data, supertags, graph topology, and Zettelkasten/i);
  assert.match(prompt, /first 15-minute step/i);
});

test("buildReportQuickStartSeed launches reports through the existing study quick-start flow", () => {
  const seed = buildReportQuickStartSeed({
    kind: "zettelkasten_synthesis",
    goal: "Turn my law notes into an argument trail.",
    upcomingExam: "Jurisprudence exam in two weeks",
    messages: [
      message({
        id: "law_zk",
        supertags: ["course:law201", "zk:permanent_note", "topic:legal_positivism"],
        content: { title: "Legal positivism", summary: "A permanent note on law and morality." },
        metadata: {
          knowledge_mode: "zettelkasten",
          academic_course_tag: "course:law201",
          knowledge_graph_group_key: "topic:legal_positivism",
          zettelkasten_next_action: "Explain how this alters the earlier Hart note.",
        },
      }),
    ],
  });

  assert.equal(seed.label, "Zettelkasten synthesis report");
  assert.equal(seed.entryPoint, "workspace");
  assert.equal(seed.originLabel, "From Reports");
  assert.equal(seed.knowledgeMode, "zettelkasten");
  assert.equal(seed.retentionMode, "keep_extracted_only");
  assert.equal(seed.flowKind, "grounded_followup");
  assert.ok(seed.focusBadges?.includes("urgency:soon"));
  assert.ok(seed.focusBadges?.includes("stress:stressed"));
  assert.ok(seed.focusBadges?.includes("report_kind:zettelkasten_synthesis"));
  assert.ok(seed.focusBadges?.some((badge) => badge.startsWith("source_need:")));
  assert.ok(seed.focusBadges?.some((badge) => badge.startsWith("readiness:")));
  assert.ok(seed.focusBadges?.some((badge) => badge.startsWith("coverage:")));
  assert.ok(seed.focusBadges?.includes("course:law201"));
  assert.match(seed.query, /Turn my law notes into an argument trail/i);
  assert.match(seed.query, /topic:legal_positivism/i);
  assert.match(seed.query, /Hart note/i);
  assert.match(seed.notice, /supertags, graph links, and Zettelkasten/i);
  assert.ok(seed.firstOutputs.includes("Argument trail"));
  assert.ok(seed.firstOutputs.includes("Connection audit"));
  assert.match(seed.query, /Keep the tone calm and practical/i);
});

test("buildReportQuickStartSeed carries urgency and stress into report prompts", () => {
  const seed = buildReportQuickStartSeed({
    kind: "day_schedule",
    goal: "I have too much to do today and need a realistic plan.",
    upcomingExam: "Lab report due tonight",
    studentState: {
      urgency: "urgent",
      stress: "overwhelmed",
    },
    messages: [
      message({
        id: "lab_note",
        supertags: ["course:bio101", "topic:lab_report"],
        content: { title: "Lab report source", summary: "Data and marking notes." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:bio101",
          knowledge_graph_group_key: "topic:lab_report",
        },
      }),
    ],
  });

  assert.match(seed.query, /Student state: urgency=urgent; stress=overwhelmed/i);
  assert.match(seed.query, /Requested output format: Chat report/i);
  assert.ok(seed.focusBadges?.includes("urgency:urgent"));
  assert.ok(seed.focusBadges?.includes("stress:overwhelmed"));
  assert.match(seed.query, /realistic emergency plan/i);
  assert.match(seed.query, /one tiny first step/i);
  assert.ok(seed.firstOutputs.includes("Do the smallest useful step"));
  assert.ok(seed.firstOutputs.includes("Today plan"));
});

test("report output formats default to reusable student material by report type", () => {
  assert.equal(recommendedReportOutputFormat("cheatsheet"), "print_ready");
  assert.equal(recommendedReportOutputFormat("flashcard_deck"), "csv_flashcards");
  assert.equal(recommendedReportOutputFormat("assignment_plan"), "copyable_outline");
  assert.equal(recommendedReportOutputFormat("guided_study_session"), "copyable_outline");
  assert.equal(recommendedReportOutputFormat("exam_preparation"), "chat_markdown");
  assert.equal(reportOutputFormatOption("print_ready").label, "Print-ready");
  assert.equal(reportOutputFormatOption(null).label, "Chat report");
});

test("buildReadyReportLauncherState groups ready student report types", () => {
  const context = buildReportKnowledgeContext({
    kind: "exam_preparation",
    messages: [
      message({
        id: "psych_week5",
        supertags: ["course:psych101", "week:5", "topic:memory"],
        content: { title: "Memory lecture", summary: "Encoding and retrieval." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:psych101",
          academic_week_tag: "week:5",
          knowledge_graph_group_key: "topic:memory",
          knowledge_graph_link_tags: ["topic:encoding"],
        },
      }),
      message({
        id: "psych_reading",
        timestamp: "2026-09-07T00:00:00Z",
        supertags: ["course:psych101", "week:5", "topic:encoding"],
        content: { title: "Encoding reading", summary: "Memory systems." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:psych101",
          academic_week_tag: "week:5",
          knowledge_graph_group_key: "topic:memory",
        },
      }),
    ],
  });

  const state = buildReadyReportLauncherState({
    selectedKind: "flashcard_deck",
    context,
  });

  assert.equal(state.summaryLabel, "12 ready report types");
  assert.equal(state.selectedLabel, "Flashcard deck");
  assert.deepEqual(state.groups.map((group) => group.id), [
    "start_now",
    "study_materials",
    "planning",
    "thinking",
  ]);
  assert.equal(state.groups.flatMap((group) => group.options).length, 12);
  assert.ok(state.groups[0]?.options.some((option) => option.kind === "exam_preparation"));
  assert.ok(state.groups[1]?.options.some((option) => option.kind === "quiz_generator"));
  assert.ok(state.groups[1]?.options.some((option) => option.kind === "flashcard_deck" && option.selected));
  assert.ok(state.groups[2]?.options.some((option) => option.kind === "course_builder"));
  assert.ok(state.groups[3]?.options.some((option) => option.kind === "zettelkasten_synthesis"));
  assert.ok(
    state.groups
      .flatMap((group) => group.options)
      .every((option) => /retained files|available now/i.test(option.contextHint)),
  );
});

test("buildReadyReportLauncherState warns when ready reports need an initial source", () => {
  const state = buildReadyReportLauncherState({
    selectedKind: "exam_preparation",
    context: buildReportKnowledgeContext({
      kind: "exam_preparation",
      messages: [],
    }),
  });

  assert.ok(
    state.groups
      .flatMap((group) => group.options)
      .every((option) => /attach or paste one/i.test(option.contextHint)),
  );
});

test("buildReportQuickStartSeed carries explicit reusable output format into prompt", () => {
  const seed = buildReportQuickStartSeed({
    kind: "flashcard_deck",
    goal: "Make recall cards for my biology exam.",
    outputFormat: "csv_flashcards",
    messages: [
      message({
        id: "bio_terms",
        supertags: ["course:bio101", "topic:respiration"],
        content: { title: "Respiration definitions", summary: "ATP, glycolysis, and mitochondria." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:bio101",
          knowledge_graph_group_key: "topic:respiration",
        },
      }),
    ],
  });

  assert.match(seed.query, /Requested output format: CSV flashcards/i);
  assert.match(seed.query, /Study output contract: Produce parseable flashcard rows/i);
  assert.match(seed.query, /Scope inputs allowed: course, week, lecture, chapter, unit, file group, graph cluster/i);
  assert.match(seed.query, /Export contract: markdown, html, browser pdf, word doc, csv/i);
  assert.match(seed.query, /Structure contract: source citations, chapter unit metadata, next action, answer policy, structured rows/i);
  assert.ok(seed.focusBadges?.includes("output_format:csv_flashcards"));
  assert.match(seed.query, /front, back, source, difficulty, and tag columns/i);
  assert.match(seed.query, /Make the output reusable/i);
});

test("buildReportQuickStartSeed adds medical cloze and vignette contract when requested", () => {
  const seed = buildReportQuickStartSeed({
    kind: "flashcard_deck",
    goal: "Make cards for missed cardio concepts without copying QBank text. Use trusted medical reference snippets if available.",
    outputFormat: "csv_flashcards",
    focus: {
      source: "study_lens",
      searchQuery: "trusted_medical_reference detail_zoom:fine_detail PubMed UMLS beta blocker contraindications",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphLinkTags: ["source_tier:open_reference", "concept graph"],
    },
    messages: [
      message({
        id: "cardio_source",
        supertags: ["course:med101", "unit:cardiology", "chapter:heart-failure"],
        content: { title: "Heart failure lecture", summary: "Pathophys, presentation, and first-line therapies." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "topic:heart_failure",
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical Anki contract:/i);
  assert.match(seed.query, /cloze and short clinical-vignette recall items/i);
  assert.match(seed.query, /chapter_tag/i);
  assert.match(seed.query, /reasoning_order/i);
  assert.match(seed.query, /do not reproduce proprietary UWorld, AMBOSS/i);
  assert.match(seed.query, /Medical detail zoom: fine detail/i);
  assert.match(seed.query, /retained student uploads and source locators first/i);
  assert.match(seed.query, /trusted open-reference snippets are available/i);
  assert.match(seed.query, /never treat LLM internal knowledge as source evidence/i);
  assert.match(seed.query, /UMLS\/MeSH may normalize synonyms/i);
  assert.ok(seed.focusBadges?.includes("academic_kind:medical_cloze_vignette"));
  assert.ok(seed.focusBadges?.includes("chapter:heart-failure"));
  assert.ok(seed.focusBadges?.includes("source_tier:open_reference"));
});

test("buildReportQuickStartSeed turns medical missed topics into regenerative concept-graph prompts", () => {
  const seed = buildReportQuickStartSeed({
    kind: "flashcard_deck",
    goal: "Make cards from missed cardiology topics.",
    outputFormat: "csv_flashcards",
    focus: {
      source: "study_lens",
      searchQuery: "medical missed topics: ACE inhibitor contraindications",
      activeTag: "missed_topic:ACE inhibitor contraindications",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "topic:heart_failure",
      knowledgeGraphLinkTags: [
        "medical_missed_question_topics",
        "qbank:uworld",
        "system:cardio",
        "concept:pharm",
        "concept:contraindication",
      ],
      zettelkastenNextAction: "Generate source-grounded cloze and vignette recall from missed-topic labels only; do not reproduce proprietary QBank wording or explanations.",
    },
    messages: [
      message({
        id: "hf_source",
        supertags: ["course:med101", "unit:cardiology", "chapter:heart-failure", "concept:contraindication"],
        content: { title: "Heart failure lecture", summary: "ACE inhibitor contraindications and clinical caveats." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "topic:heart_failure",
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical missed-topic repair queue:/i);
  assert.match(seed.query, /safe metadata only/i);
  assert.match(seed.query, /Regeneration requirement: vary phrasing/i);
  assert.match(seed.query, /link pathophys, pharmacology, clinical presentation/i);
  assert.match(seed.query, /medical_edge_attempt \| relationship_id:/i);
  assert.match(seed.query, /never infer correctness from generated questions alone/i);
  assert.match(seed.query, /Medical graph scope to preserve: course:med101, unit:cardiology, chapter:heart-failure, topic:heart_failure/i);
  assert.match(seed.query, /do not reproduce proprietary QBank wording/i);
  assert.ok(seed.focusBadges?.includes("medical_missed_question_topics"));
  assert.ok(seed.focusBadges?.includes("qbank:uworld"));
});

test("buildReportQuickStartSeed turns medical graph-gap tags into cloze deck prompts", () => {
  const seed = buildReportQuickStartSeed({
    kind: "flashcard_deck",
    goal: "Make cited cloze/vignette cards for graph gaps.",
    outputFormat: "csv_flashcards",
    focus: {
      source: "knowledge_graph",
      searchQuery: "medical cloze vignette deck from graph gaps",
      activeTag: "chapter:heart-failure",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "topic:heart_failure",
      knowledgeGraphLinkTags: [
        "medical_cloze_vignette",
        "medical_gap_cloze_deck",
        "concept:pathophys",
        "concept:presentation",
      ],
    },
    messages: [
      message({
        id: "hf-source",
        supertags: ["course:med101", "unit:cardiology", "chapter:heart-failure", "concept:pathophys"],
        content: { title: "Heart failure lecture", summary: "Pathophys and clinical presentation." },
        metadata: {
          academic_kind: "medical_cloze_vignette",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "topic:heart_failure",
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical graph-gap cloze deck queue/i);
  assert.match(seed.query, /Anki-compatible cloze rows/i);
  assert.match(seed.query, /avoid duplicating already-covered cards/i);
  assert.match(seed.query, /source locators, chapter\/unit tags, and concept supertags/i);
  assert.ok(seed.focusBadges?.includes("medical_gap_cloze_deck"));
});

test("buildReportQuickStartSeed turns medical vignette tags into application blocks", () => {
  const seed = buildReportQuickStartSeed({
    kind: "practice_questions",
    goal: "Run a fresh vignette block from the medical graph.",
    outputFormat: "chat_markdown",
    focus: {
      source: "knowledge_graph",
      searchQuery: "medical vignette block from concept graph",
      activeTag: "chapter:heart-failure",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "topic:heart_failure",
      knowledgeGraphLinkTags: [
        "medical_cloze_vignette",
        "medical_vignette_block",
        "concept:pathophys",
        "concept:management",
      ],
    },
    messages: [
      message({
        id: "hf-source",
        supertags: ["course:med101", "unit:cardiology", "chapter:heart-failure", "concept:management"],
        content: { title: "Heart failure management", summary: "Treatment sequencing and contraindications." },
        metadata: {
          academic_kind: "medical_cloze_vignette",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "topic:heart_failure",
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical vignette block queue/i);
  assert.match(seed.query, /practices reasoning rather than memorized static card wording/i);
  assert.match(seed.query, /vary patient age, presentation, distractor framing, and management step/i);
  assert.ok(seed.focusBadges?.includes("medical_vignette_block"));
});

test("buildReportQuickStartSeed turns medical topology markers into scoped deck prompts", () => {
  const seed = buildReportQuickStartSeed({
    kind: "flashcard_deck",
    goal: "Fill the missing source-backed topology cards.",
    outputFormat: "csv_flashcards",
    focus: {
      source: "knowledge_graph",
      searchQuery: "medical topology coverage system:cardiovascular",
      activeTag: "system:cardiovascular",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "topic:heart_failure",
      knowledgeGraphLinkTags: [
        "medical_cloze_vignette",
        "medical_topology_coverage",
        "topology_gap:source_only",
        "pharm",
        "management",
      ],
      zettelkastenNextAction: "Use the current medical topology coverage state to generate only missing source-grounded cloze/vignette rows.",
    },
    messages: [
      message({
        id: "hf-source",
        supertags: ["course:med101", "unit:cardiology", "chapter:heart-failure", "system:cardiovascular"],
        content: { title: "Heart failure lecture", summary: "Pharm and management source coverage." },
        metadata: {
          academic_kind: "medical_cloze_vignette",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "topic:heart_failure",
          knowledge_graph_link_tags: ["medical_topology_coverage", "system:cardiovascular"],
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical topology coverage queue/i);
  assert.match(seed.query, /source exists but card inventory is missing/i);
  assert.match(seed.query, /generate cited cloze\/vignette rows for this exact scope/i);
  assert.match(seed.query, /Use the current medical topology coverage state/i);
  assert.ok(seed.focusBadges?.includes("medical_topology_coverage"));
  assert.ok(seed.focusBadges?.includes("topology_gap:source_only"));
});

test("buildReportQuickStartSeed turns weak medical concept edges into repair prompts", () => {
  const seed = buildReportQuickStartSeed({
    kind: "practice_questions",
    goal: "Regenerate edge questions for a weak concept relationship.",
    outputFormat: "chat_markdown",
    focus: {
      source: "study_lens",
      searchQuery: "medical concept-edge review: pathophys -> presentation",
      activeTag: "medical_edge:medical-deck:0:pathophys_to_presentation:pathophys",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "medical-deck:0:pathophys_to_presentation:pathophys",
      knowledgeGraphLinkTags: [
        "medical_concept_edge_review",
        "priority:high",
        "relationship:pathophys_to_presentation",
        "score_band:weak",
        "system:cardio",
      ],
      zettelkastenNextAction: "Regenerate freshly phrased cloze and vignette questions for the concept edge \"pathophys -> presentation\". Score state: 40% latest edge attempt. Latest edge attempt score is 40%; regenerate and repair this relationship.",
    },
    messages: [
      message({
        id: "medical-edge",
        supertags: [
          "medical_concept_relationship",
          "medical_concept_edge_review",
          "medical_cloze_vignette",
          "course:med101",
          "chapter:heart-failure",
        ],
        content: {
          title: "pathophys -> presentation",
          summary: "Medical concept relationship extracted from a saved cloze/vignette artifact.",
        },
        metadata: {
          academic_kind: "medical_cloze_vignette",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "medical-deck:0:pathophys_to_presentation:pathophys",
          knowledge_graph_link_tags: [
            "medical_concept_edge_review",
            "relationship:pathophys_to_presentation",
            "system:cardio",
          ],
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical concept-edge repair queue:/i);
  assert.match(seed.query, /relationship ID, score band, and graph tags/i);
  assert.match(seed.query, /preserve the same tested relationship/i);
  assert.match(seed.query, /40% latest edge attempt/i);
  assert.match(seed.query, /medical_edge_attempt \| relationship_id:/i);
  assert.ok(seed.focusBadges?.includes("medical_concept_edge_review"));
  assert.ok(seed.focusBadges?.includes("score_band:weak"));
  assert.ok(seed.focusBadges?.includes("relationship:pathophys_to_presentation"));
});

test("buildReportQuickStartSeed asks for attempt evidence when repaired medical concept edge exists", () => {
  const seed = buildReportQuickStartSeed({
    kind: "practice_questions",
    goal: "Record attempt evidence for a repaired concept relationship.",
    outputFormat: "chat_markdown",
    focus: {
      source: "study_lens",
      searchQuery: "medical concept-edge attempt evidence: pathophys -> presentation",
      activeTag: "medical_edge:medical-deck:0:pathophys_to_presentation:pathophys",
      academicKind: "medical_cloze_vignette",
      courseTag: "course:med101",
      unitTag: "unit:cardiology",
      chapterTag: "chapter:heart-failure",
      knowledgeGraphGroupKey: "medical-deck:0:pathophys_to_presentation:pathophys",
      knowledgeGraphLinkTags: [
        "medical_concept_edge_review",
        "repair_status:pending_attempt",
        "priority:medium",
        "relationship:pathophys_to_presentation",
        "score_band:weak",
      ],
      zettelkastenNextAction: "Use the saved repair output for this concept edge and record a real attempt before generating more variants.",
    },
    messages: [
      message({
        id: "medical-edge",
        supertags: [
          "medical_concept_relationship",
          "medical_concept_edge_review",
          "medical_cloze_vignette",
          "course:med101",
          "chapter:heart-failure",
        ],
        content: {
          title: "pathophys -> presentation",
          summary: "Medical concept relationship extracted from a saved cloze/vignette artifact.",
        },
        metadata: {
          academic_kind: "medical_cloze_vignette",
          academic_course_tag: "course:med101",
          academic_unit_tag: "unit:cardiology",
          academic_chapter_tag: "chapter:heart-failure",
          knowledge_graph_group_key: "medical-deck:0:pathophys_to_presentation:pathophys",
          knowledge_graph_link_tags: [
            "medical_concept_edge_review",
            "relationship:pathophys_to_presentation",
            "system:cardio",
          ],
        },
      }),
    ],
  });

  assert.match(seed.query, /Medical concept-edge attempt capture/i);
  assert.match(seed.query, /repair output already exists/i);
  assert.match(seed.query, /do not generate additional variants by default/i);
  assert.match(seed.query, /Use the saved repair output/i);
  assert.match(seed.query, /never infer correctness from a repair artifact/i);
  assert.ok(seed.focusBadges?.includes("repair_status:pending_attempt"));
  assert.ok(seed.focusBadges?.includes("score_band:weak"));
  assert.ok(seed.focusBadges?.includes("relationship:pathophys_to_presentation"));
});

test("buildReportImmediateAction gives low-friction first steps", () => {
  const noSourceAction = buildReportImmediateAction({
    kind: "exam_preparation",
    context: buildReportKnowledgeContext({
      kind: "exam_preparation",
      messages: [],
    }),
  });
  assert.equal(noSourceAction.label, "Attach one source");

  const urgentAction = buildReportImmediateAction({
    kind: "assignment_plan",
    studentState: { urgency: "urgent", stress: "overwhelmed" },
    context: buildReportKnowledgeContext({
      kind: "assignment_plan",
      messages: [
        message({
          id: "assignment",
          supertags: ["course:eng101", "topic:essay"],
          content: { title: "Essay brief", summary: "Assessment instructions." },
          metadata: {
            knowledge_mode: "connected_notes",
            knowledge_graph_group_key: "topic:essay",
          },
        }),
      ],
    }),
  });
  assert.equal(urgentAction.label, "Do the smallest useful step");
  assert.match(urgentAction.detail, /15 minutes/i);
});

test("reportOutputSectionsForKind returns actionable sections for each report type", () => {
  for (const kind of [
    "exam_preparation",
    "day_schedule",
    "assignment_plan",
    "weekly_revision",
    "zettelkasten_synthesis",
    "course_builder",
    "quiz_generator",
    "flashcard_deck",
    "cheatsheet",
    "lecture_summary",
    "practice_questions",
    "guided_study_session",
  ] as const) {
    const sections = reportOutputSectionsForKind(kind);
    assert.equal(sections.length, 3);
    assert.ok(sections.every((section) => section.title.trim() && section.detail.trim()));
  }
});

test("buildReportQuickStartSeed prioritizes a carried Reports focus", () => {
  const seed = buildReportQuickStartSeed({
    kind: "weekly_revision",
    goal: "Create a report from the current graph focus.",
    messages: [
      message({
        id: "econ_week4",
        supertags: ["course:econ101", "week:4", "topic:elasticity"],
        content: { title: "Elasticity", summary: "Price elasticity lecture." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:econ101",
          academic_week_tag: "week:4",
          knowledge_graph_group_key: "topic:elasticity",
        },
      }),
    ],
    focus: {
      source: "knowledge_graph",
      searchQuery: "elasticity",
      activeTag: "topic:elasticity",
      knowledgeMode: "connected_notes",
      academicKind: "lecture_slides",
      courseTag: "course:econ101",
      weekTag: "week:4",
      lectureTag: "lecture:4",
      chapterTag: "chapter:6",
      unitTag: "unit:elasticity",
      moduleLabel: "Module 3",
      dueLabel: "2026-10-03T22:00:00.000Z",
      deadlineId: "deadline-42",
      providerId: "gcal",
      knowledgeGraphGroupKey: "topic:elasticity",
      knowledgeGraphLinkTags: ["topic:demand", "week:4"],
      zettelkastenStage: null,
      zettelkastenNextAction: null,
    },
  });

  assert.ok(seed.focusBadges?.includes("source:knowledge_graph"));
  assert.ok(seed.focusBadges?.includes("course:econ101"));
  assert.ok(seed.focusBadges?.includes("Elasticity"));
  assert.ok(seed.focusBadges?.includes("chapter:6"));
  assert.ok(seed.focusBadges?.includes("unit:elasticity"));
  assert.ok(seed.focusBadges?.includes("module:Module 3"));
  assert.ok(seed.focusBadges?.includes("due:2026-10-03T22:00:00.000Z"));
  assert.ok(seed.focusBadges?.includes("deadline:deadline-42"));
  assert.ok(seed.focusBadges?.includes("provider:gcal"));
  assert.match(seed.query, /Current report focus to prioritize/i);
  assert.match(seed.query, /search:elasticity/i);
  assert.match(seed.query, /lecture:4/i);
  assert.match(seed.query, /chapter:6/i);
  assert.match(seed.query, /unit:elasticity/i);
  assert.match(seed.query, /module:Module 3/i);
  assert.match(seed.query, /due:2026-10-03T22:00:00.000Z/i);
  assert.match(seed.query, /deadline:deadline-42/i);
  assert.match(seed.query, /provider:gcal/i);
  assert.match(seed.query, /topic:demand/i);
  assert.match(seed.query, /prioritize that course, unit, chapter, week, graph cluster, or note chain/i);
  assert.match(seed.helper, /Ask for the report now/i);
  assert.match(seed.helper, /Readiness:/i);
  assert.match(seed.helper, /Coverage:/i);
  assert.ok(seed.checklist.some((item) => /source coverage/i.test(item)));
});

test("buildReportQuickStartSeed carries missing input guidance for no-source exam reports", () => {
  const seed = buildReportQuickStartSeed({
    kind: "exam_preparation",
    goal: "I need a plan for my statistics final.",
    messages: [],
  });

  assert.equal(seed.flowKind, "initial_upload");
  assert.equal(seed.knowledgeMode, "connected_notes");
  assert.ok(seed.focusBadges?.includes("readiness:needs_source"));
  assert.ok(seed.focusBadges?.includes("coverage:none"));
  assert.match(seed.query, /Known gaps before relying on this report/i);
  assert.match(seed.query, /Attach or paste one source/i);
  assert.match(seed.query, /lecture or tutorial notes/i);
  assert.match(seed.query, /exam date, topic range, or assessment scope/i);
  assert.match(seed.helper, /Attach or paste lecture or tutorial notes/i);
  assert.match(seed.helper, /Readiness: Needs one study source/i);
  assert.match(seed.helper, /Coverage: none/i);
  assert.match(seed.helper, /Best gap to fill/i);
  assert.match(seed.recommendedUpload ?? "", /assessment scope/i);
  assert.ok(seed.checklist.some((item) => /source coverage/i.test(item)));
  assert.ok(seed.checklist.some((item) => /Fill this gap first/i.test(item)));
});

test("reportSourceRequirementsForKind gives report-specific attachment guidance", () => {
  for (const kind of [
    "exam_preparation",
    "day_schedule",
    "assignment_plan",
    "weekly_revision",
    "zettelkasten_synthesis",
    "course_builder",
    "quiz_generator",
    "flashcard_deck",
    "cheatsheet",
    "lecture_summary",
    "practice_questions",
    "guided_study_session",
  ] as const) {
    const requirements = reportSourceRequirementsForKind(kind);
    assert.ok(requirements.length >= 2);
    assert.ok(requirements.length <= 4);
    assert.ok(requirements.every((requirement) => requirement.label.trim() && requirement.examples.trim()));
  }

  const assignmentSources = reportSourceRequirementsForKind("assignment_plan");
  assert.ok(assignmentSources.some((source) => /assignment brief/i.test(source.label)));
  assert.ok(assignmentSources.some((source) => /rubric/i.test(source.label)));

  const zettelkastenSources = reportSourceRequirementsForKind("zettelkasten_synthesis");
  assert.ok(zettelkastenSources.some((source) => /source notes/i.test(source.label)));
  assert.ok(zettelkastenSources.some((source) => /permanent notes/i.test(source.label)));

  const courseSources = reportSourceRequirementsForKind("course_builder");
  assert.ok(courseSources.some((source) => /course outline/i.test(source.label)));
  assert.ok(courseSources.some((source) => /assessment timeline/i.test(source.label)));

  const quizSources = reportSourceRequirementsForKind("quiz_generator");
  assert.ok(quizSources.some((source) => /testable source material/i.test(source.label)));

  const guidedSources = reportSourceRequirementsForKind("guided_study_session");
  assert.ok(guidedSources.some((source) => /available time/i.test(source.label)));
});

test("buildReportQuickStartSeed supports first-class learning material report templates", () => {
  const messages = [
    message({
      id: "psych_week5",
      supertags: ["course:psych101", "week:5", "topic:memory"],
      content: { title: "Memory lecture", summary: "Encoding, storage, and retrieval." },
      metadata: {
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:psych101",
        academic_week_tag: "week:5",
        knowledge_graph_group_key: "topic:memory",
        knowledge_graph_link_tags: ["topic:encoding", "topic:retrieval"],
      },
    }),
  ];

  const cases = [
    { kind: "course_builder", expected: /structured study course/i, output: "Course path" },
    { kind: "quiz_generator", expected: /source-grounded questions/i, output: "Question set" },
    { kind: "flashcard_deck", expected: /active-recall cards/i, output: "Recall cards" },
    { kind: "cheatsheet", expected: /printable revision sheet/i, output: "Compressed sheet" },
    { kind: "lecture_summary", expected: /catch up quickly/i, output: "Plain-English summary" },
    { kind: "practice_questions", expected: /exam-style prompts/i, output: "Exam-style questions" },
    { kind: "guided_study_session", expected: /plan, review, recall, check/i, output: "Session plan" },
  ] as const;

  for (const entry of cases) {
    const seed = buildReportQuickStartSeed({
      kind: entry.kind,
      goal: "Help me prepare from week 5.",
      upcomingExam: "Midterm in 10 days",
      messages,
    });
    assert.ok(seed.focusBadges?.includes(`report_kind:${entry.kind}`));
    assert.match(seed.query, entry.expected);
    assert.ok(seed.firstOutputs.includes(entry.output));
    assert.equal(seed.knowledgeMode, "connected_notes");
    assert.equal(seed.retentionMode, "keep_extracted_only");
  }
});

test("buildReportKnowledgeContext flags report-specific gaps", () => {
  const context = buildReportKnowledgeContext({
    kind: "zettelkasten_synthesis",
    messages: [
      message({
        id: "plain_note",
        supertags: ["course:arts101", "topic:essay"],
        content: { title: "Essay reading", summary: "A rough reading note." },
        metadata: {
          knowledge_mode: "connected_notes",
          academic_course_tag: "course:arts101",
          knowledge_graph_group_key: "topic:essay",
        },
      }),
    ],
  });

  assert.equal(context.cardCount, 1);
  assert.equal(context.readinessLevel, "needs_scope");
  assert.equal(context.readinessLabel, "Needs one detail to improve");
  assert.equal(context.sourceCoverageLevel, "single_source");
  assert.equal(context.zettelkastenCardCount, 0);
  assert.ok(context.missingInputs.some((gap) => /Zettelkasten mode/i.test(gap)));
});

test("extractReportKnowledgeContext scopes summaries to a carried focus when matches exist", () => {
  const messages: AfpMessage[] = [
    message({
      id: "econ_week4",
      supertags: ["course:econ101", "week:4", "topic:elasticity"],
      content: { title: "Elasticity", summary: "Price elasticity lecture." },
      metadata: {
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:econ101",
        academic_week_tag: "week:4",
        academic_lecture_tag: "lecture:4",
        academic_chapter_tag: "chapter:6",
        academic_unit_tag: "unit:elasticity",
        knowledge_graph_group_key: "topic:elasticity",
        knowledge_graph_link_tags: ["topic:demand"],
      },
    }),
    message({
      id: "biology_week2",
      supertags: ["course:bio101", "week:2", "topic:cellular_respiration"],
      content: { title: "Cellular respiration", summary: "ATP and mitochondria." },
      metadata: {
        knowledge_mode: "connected_notes",
        academic_course_tag: "course:bio101",
        academic_week_tag: "week:2",
        knowledge_graph_group_key: "topic:cellular_respiration",
      },
    }),
  ];

  const context = extractReportKnowledgeContext(messages, {
    source: "knowledge_graph",
    searchQuery: "elasticity",
    activeTag: "topic:elasticity",
    knowledgeMode: "connected_notes",
    academicKind: null,
    courseTag: "course:econ101",
    weekTag: "week:4",
    lectureTag: "lecture:4",
    chapterTag: "chapter:6",
    unitTag: "unit:elasticity",
    knowledgeGraphGroupKey: "topic:elasticity",
    knowledgeGraphLinkTags: ["topic:demand"],
    zettelkastenStage: null,
    zettelkastenNextAction: null,
  });

  assert.equal(context.cardCount, 2);
  assert.equal(context.focusedCardCount, 1);
  assert.equal(context.readinessLevel, "draft_ready");
  assert.equal(context.sourceCoverageLevel, "single_source");
  assert.deepEqual(context.courseTags, ["course:econ101"]);
  assert.deepEqual(context.weekTags, ["week:4"]);
  assert.deepEqual(context.chapterTags, ["chapter:6"]);
  assert.deepEqual(context.unitTags, ["unit:elasticity"]);
  assert.ok(context.topSupertags.includes("topic:elasticity"));
  assert.ok(!context.topSupertags.includes("topic:cellular_respiration"));
  assert.deepEqual(context.evidenceSources, ["Elasticity"]);
  assert.match(context.topologySummary, /1 focused knowledge cards from 2 retained cards/i);
});

test("extractReportKnowledgeContext allows Zettelkasten mode to scope note-chain reports", () => {
  const messages: AfpMessage[] = [
    message({
      id: "zk_note",
      supertags: ["zk:permanent_note", "topic:public_goods"],
      content: { title: "Public goods", summary: "A permanent note about non-excludability." },
      metadata: {
        knowledge_mode: "zettelkasten",
        knowledge_graph_group_key: "topic:public_goods",
        zettelkasten_next_action: "Link this to market failure examples.",
      },
    }),
    message({
      id: "standard_note",
      supertags: ["topic:exam_admin"],
      content: { title: "Exam admin", summary: "Room and timing notes." },
      metadata: {
        knowledge_mode: "connected_notes",
      },
    }),
  ];

  const context = extractReportKnowledgeContext(messages, {
    source: "knowledge_graph",
    searchQuery: "",
    activeTag: null,
    knowledgeMode: "zettelkasten",
    academicKind: null,
    courseTag: null,
    weekTag: null,
    lectureTag: null,
    knowledgeGraphGroupKey: null,
    knowledgeGraphLinkTags: [],
    zettelkastenStage: null,
    zettelkastenNextAction: null,
  });

  assert.equal(context.cardCount, 2);
  assert.equal(context.focusedCardCount, 1);
  assert.equal(context.readinessLevel, "draft_ready");
  assert.equal(context.zettelkastenCardCount, 1);
  assert.ok(context.topSupertags.includes("topic:public_goods"));
  assert.ok(!context.topSupertags.includes("topic:exam_admin"));
  assert.deepEqual(context.evidenceSources, ["Public goods"]);
  assert.match(context.zettelkastenNextActions.join(" "), /market failure/i);
});
