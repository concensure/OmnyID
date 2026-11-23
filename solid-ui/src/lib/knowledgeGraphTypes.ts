// @locs-version: 1.0
export type KnowledgeGraphBacklinkRef = {
  targetId: string;
  targetTitle: string;
  relationLabel: string;
};

export type KnowledgeGraphConnectionStrength = "low" | "medium" | "high";

export type KnowledgeCard = {
  id: string;
  title: string;
  summary: string;
  supertags: string[];
  canonicalSupertags?: string[];
  linkEvidenceScore?: number;
  sourceDiversityCount?: number;
  topicalConnectionCount?: number;
  contradictionLinkCount?: number;
  corroboratedSourceCount?: number;
  knowledgeMode: "standard" | "connected_notes" | "zettelkasten";
  sourceKind?: string | null;
  sourceMessageId?: string | null;
  sourceTitle?: string | null;
  sourceFileName?: string | null;
  academicKind?: string | null;
  academicCourseTag?: string | null;
  academicWeekTag?: string | null;
  academicLectureTag?: string | null;
  academicChapterTag?: string | null;
  academicUnitTag?: string | null;
  academicSummary?: string | null;
  retentionMode?: string | null;
  retentionLabel?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenEntryType?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphSeed?: boolean;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[];
  policyOutcome?: string | null;
  storageSummary?: string | null;
  provenanceSummary?: string | null;
  referenceTargetIds?: string[];
  relatedCardCount?: number;
  connectionStrength?: KnowledgeGraphConnectionStrength;
  connectionReasons?: string[];
  reviewPending: boolean;
  sourceNote: boolean;
  permanentNote: boolean;
  backlinks: KnowledgeGraphBacklinkRef[];
  timestamp: string;
  sourceThreadId?: string;
};

export type InsightMsg = {
  id: string;
  body: string;
  topic?: string;
  count?: number;
  timestamp: string;
};

export type MergeSuggestion = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  similarityScore?: number;
  timestamp: string;
};
