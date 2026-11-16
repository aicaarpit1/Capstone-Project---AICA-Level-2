import { describe, it, expect } from "vitest";
import { computeManagementScore, SCORE_WEIGHTS } from "./score";

const mk = (scores: (number | null)[]) =>
  SCORE_WEIGHTS.map((w, i) => ({ ...w, score: scores[i] ?? null, rationale: "" }));

describe("management score", () => {
  it("uses 30/25/20/15/10 weights", () => {
    expect(computeManagementScore(mk([100, 0, 0, 0, 0])).total).toBe(30);
  });
  it("refuses to score when evidence covers under 60% of weight", () => {
    expect(computeManagementScore(mk([80, null, null, null, 90])).total).toBeNull();
  });
  it("re-weights over components that have evidence", () => {
    expect(computeManagementScore(mk([80, 60, 70, null, null])).total).toBe(71);
  });
});
