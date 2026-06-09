// ─────────────────────────────────────────────────────────────────────────────
// services/exa.service.ts
// Exa Search Service Wrapper (REAL API VERSION)
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "@/lib/logger";

export interface ExaCandidate {
  name: string;
  price: number;
  url: string;
  description: string;
  reasoning_score: number;

  rating?: number;
  deliveryDays?: number;
  reviews?: number;
  features?: string[];
}

interface SearchParams {
  goal: string;
  budget: number;
  preferences: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL EXA API CALL (replaces mock system)
// ─────────────────────────────────────────────────────────────────────────────

async function executeExaSearch(
  query: string,
  maxPrice: number
): Promise<ExaCandidate[]> {
  logger.debug("ExaService", `REAL Exa search: "${query}"`);

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.EXA_API_KEY!,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      contents: {
        highlights: true,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Exa API error: ${res.status}`);
  }

  const data = await res.json();

  const results: ExaCandidate[] = (data.results || []).map((r: any) => ({
    name: r.title,
    price: maxPrice, // Exa does NOT provide price → handled later in RankingEngine
    url: r.url,
    description: r.highlights?.join(" ") || r.text || "",
    reasoning_score: 0.7,
  }));

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS (keeps retry + fallback logic)
// ─────────────────────────────────────────────────────────────────────────────

export class ExaService {
  private static MAX_RETRIES = 2;

  static async searchCandidates({
    goal,
    budget,
    preferences,
  }: SearchParams): Promise<ExaCandidate[]> {
    let attempt = 0;
    let lastError: Error | null = null;

    const strictQuery = `${goal} under $${budget} ${preferences}`.trim();

    // ── PHASE 1: STRICT SEARCH ─────────────────────────────────────────────
    while (attempt < this.MAX_RETRIES) {
      try {
        const results = await executeExaSearch(strictQuery, budget);

        if (results.length > 0) {
          logger.info("ExaService", "Strict search success", {
            count: results.length,
          });

          return this.normalizeScores(results);
        }

        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        logger.warn(
          "ExaService",
          `Strict search failed (${attempt}/${this.MAX_RETRIES})`,
          { error: lastError.message }
        );

        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    // ── PHASE 2: EXPANDED SEARCH ────────────────────────────────────────────
    logger.info("ExaService", "Falling back to expanded search");

    const broadQuery = `${goal} best options`.trim();
    attempt = 0;

    while (attempt < this.MAX_RETRIES) {
      try {
        const results = await executeExaSearch(broadQuery, budget * 1.5);

        if (results.length > 0) {
          logger.info("ExaService", "Expanded search success", {
            count: results.length,
          });

          return this.normalizeScores(results);
        }

        return [];
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempt++;

        logger.warn(
          "ExaService",
          `Expanded search failed (${attempt}/${this.MAX_RETRIES})`,
          { error: lastError.message }
        );

        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    throw new Error(
      `Exa search failed after retries. Last error: ${lastError?.message}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  private static normalizeScores(
    candidates: ExaCandidate[]
  ): ExaCandidate[] {
    return candidates
      .map((c) => ({
        ...c,
        reasoning_score: Math.min(1, Math.max(0, c.reasoning_score)),
      }))
      .sort((a, b) => b.reasoning_score - a.reasoning_score);
  }
}