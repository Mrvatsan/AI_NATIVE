export interface TokenUsage {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export const CostTracker = {
  costs: new Map<string, Record<string, TokenUsage>>(),

  addUsage: (jobId: string, stageName: string, usage: TokenUsage) => {
    if (!CostTracker.costs.has(jobId)) {
      CostTracker.costs.set(jobId, {});
    }
    const jobCosts = CostTracker.costs.get(jobId)!;
    jobCosts[stageName] = usage;
  },

  getJobCost: (jobId: string) => {
    return CostTracker.costs.get(jobId) || null;
  }
};
