// @locs-version: 1.0
import type { AreaRulesPayload, FolderRulePayload } from "@/lib/api";

export type NoteBlockType =
  | "paragraph"
  | "heading"
  | "image"
  | "ocr"
  | "3d";

export interface NoteBlock {
  type: NoteBlockType;
  text?: string;
  url?: string;
  ocrText?: string;
  ocrConfidence?: number;
  modelUrl?: string;
  level?: 1 | 2 | 3;
}

export interface BacklinkRef {
  targetId: string;
  targetTitle: string;
  relation: string;
}

export interface Note {
  id: string;
  threadId?: string;
  messageId?: string;
  title: string;
  preview: string;
  blocks: NoteBlock[];
  summary: string;
  tags: string[];
  supertags: string[];
  backlinks: BacklinkRef[];
  updatedAt: string;
  createdAt: string;
  folderId?: string;
  areaId?: string;
  metadata: {
    hasVoice?: boolean;
    hasImage?: boolean;
    hasOcr?: boolean;
    has3d?: boolean;
  };
}

export interface Folder {
  id: string;
  name: string;
  areaId?: string;
  rule?: FolderRulePayload;
}

export interface Area {
  id: string;
  rules: AreaRulesPayload;
}
