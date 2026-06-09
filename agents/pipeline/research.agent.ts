// ─────────────────────────────────────────────────────────────────────────────
// agents/pipeline/research.agent.ts
// Stage 3 — Fetches candidate products (mock Exa API for now)
// ─────────────────────────────────────────────────────────────────────────────
//
// Swap `mockExaSearch()` for a real Exa / SerpAPI / Amazon PA-API call
// by replacing the function below. The rest of the agent is API-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from "@/agents/base.agent";
import { logger } from "@/lib/logger";
import { v4 as uuidv4 } from "uuid";
import { ExaService } from "@/services/exa.service";
import type { AgentRole } from "@/types/agent";
import type { Candidate } from "@/types/recommendation";
import type { ResearchInput, ResearchOutput, ReasoningStep } from "@/types/pipeline";

// ─────────────────────────────────────────────────────────────────────────────

export class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  readonly role: AgentRole = "researcher";

  protected async run(taskId: string, input: ResearchInput): Promise<ResearchOutput> {
    const { goal, searchQuery } = input;
    const t0 = Date.now();

    logger.info("ResearchAgent", "Running Exa search via ExaService", { taskId, query: searchQuery });

    const rawResults = await ExaService.searchCandidates({
      goal: searchQuery,
      budget: goal.budget,
      preferences: goal.constraints,
    });

    const candidates: Candidate[] = (rawResults.success ? rawResults.data : []).map((r) => ({
      id: uuidv4(),
      name: r.name,
      price: Math.round(r.price * 100) / 100,
      rating: r.rating || 4.5,
      deliveryDays: r.deliveryDays || 3,
      reviews: r.reviews || 1000,
      url: r.url,
      description: r.description,
      features: r.features || [],
      badges: [],
      source: "mock-exa",
      scores: {
        valueScore: 0,
        deliveryScore: 0,
        qualityScore: 0,
        savingsScore: 0,
        prefFit: 0,
        finalScore: 0,
      },
    }));

    const durationMs = Date.now() - t0;

    const reasoning: ReasoningStep = {
      agent: "ResearchAgent",
      action: "exa_search",
      reasoning: `Queried ExaService with "${searchQuery}". Found ${candidates.length} candidates.`,
      confidence: 0.9,
      durationMs,
      timestamp: new Date().toISOString(),
      provider: "exa",
      model: "exa-neural",
    };

    this.recordStep("mock_exa_search", { query: searchQuery }, { count: candidates.length }, durationMs);

    return { candidates, totalFound: candidates.length, source: "mock-exa", reasoning };
  }
}
