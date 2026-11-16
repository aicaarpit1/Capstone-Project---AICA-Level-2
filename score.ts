export type ScoreComponent = {
  key: string;
  name: string;
  weight: number;
  score: number | null;
  rationale: string;
};

export const SCORE_WEIGHTS: { key: string; name: string; weight: number }[] = [
  { key: "guidance", name: "Guidance accuracy", weight: 30 },
  { key: "governance", name: "Corporate governance", weight: 25 },
  { key: "execution", name: "Financial execution", weight: 20 },
  { key: "compliance", name: "Regulatory compliance", weight: 15 },
  { key: "transparency", name: "Transparency", weight: 10 },
];

/**
 * Weighted 0–100 management score. Components without evidence (null) are
 * excluded; if evidence covers less than 60% of total weight, no score is given.
 */
export function computeManagementScore(components: ScoreComponent[]): {
  total: number | null;
  coverage: number;
} {
  let covered = 0;
  let sum = 0;
  for (const c of components) {
    if (c.score === null || Number.isNaN(c.score)) continue;
    const s = Math.max(0, Math.min(100, c.score));
    covered += c.weight;
    sum += s * c.weight;
  }
  const coverage = covered;
  if (covered < 60) return { total: null, coverage };
  return { total: Math.round(sum / covered), coverage };
}
