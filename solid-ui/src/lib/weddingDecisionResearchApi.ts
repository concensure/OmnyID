import { apiFetch } from "@/lib/api";

export type FundedWeddingDecisionResearch = {
  recommendation: string;
  reportMarkdown: string;
  model: string;
  cached: boolean;
};

export async function requestFundedWeddingDecisionResearch(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  taskId: string;
  title: string;
  notes?: string | null;
  context: readonly string[];
  queueRank: number;
}): Promise<FundedWeddingDecisionResearch> {
  const response = await apiFetch<Record<string, unknown>>("/wedding/decision-research", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      task_id: input.taskId,
      title: input.title,
      notes: input.notes ?? "",
      context: input.context,
      queue_rank: input.queueRank,
    },
  });
  return {
    recommendation: String(response.recommendation ?? "").trim(),
    reportMarkdown: String(response.report_markdown ?? "").trim(),
    model: String(response.model ?? "").trim(),
    cached: response.cached === true,
  };
}
