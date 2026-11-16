import { generateResponse } from "@lovable.dev/ai-gateway";

const GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

export type FoundDoc = {
  title: string;
  url: string;
  doc_type: string;
  source_domain: string;
  excerpt: string;
};

const QUERIES: { type: string; q: (n: string, s: string) => string }[] = [
  { type: "annual_report", q: (n) => `${n} annual report` },
  { type: "quarterly_results", q: (n) => `${n} quarterly results financial statements` },
  { type: "concall", q: (n) => `${n} earnings conference call transcript` },
  { type: "presentation", q: (n) => `${n} investor presentation` },
  { type: "filing", q: (n, s) => `${s || n} NSE BSE corporate announcement disclosure` },
  { type: "regulatory", q: (n) => `${n} SEBI order notice` },
  { type: "news", q: (n) => `${n} promoter director litigation controversy governance` },
];

export async function searchDocuments(name: string, symbol: string): Promise<{ docs: FoundDoc[]; failures: string[] }> {
  const lovKey = process.env["LOVABLE_API_KEY"];
  const fcKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovKey || !fcKey) throw new Error("Document search is not configured (missing credentials).");
  const failures: string[] = [];
  const results = await Promise.all(
    QUERIES.map(async ({ type, q }) => {
      try {
        const res = await fetch(`${GATEWAY}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovKey}`, "X-Connection-Api-Key": fcKey },
          body: JSON.stringify({
            query: q(name, symbol),
            limit: 3,
            country: "in",
            scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
          }),
        });
        if (!res.ok) {
          failures.push(`${type}: ${res.status} ${(await res.text()).slice(0, 200)}`);
          return [];
        }
        const json = (await res.json()) as { data?: unknown };
        const raw = json.data as { web?: unknown[] } | unknown[] | undefined;
        const list = (Array.isArray(raw) ? raw : (raw?.web ?? [])) as {
          url?: string; title?: string; description?: string; markdown?: string;
        }[];
        return list
          .filter((r) => r.url)
          .map((r) => ({
            title: r.title || r.url!,
            url: r.url!,
            doc_type: type,
            source_domain: (() => { try { return new URL(r.url!).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
            excerpt: (r.markdown || r.description || "").slice(0, 7000),
          }));
      } catch (e) {
        failures.push(`${type}: ${(e as Error).message}`);
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const docs = results.flat().filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
  return { docs, failures };
}

export async function askModel(instructions: string, input: string): Promise<string> {
  const res = await generateResponse({
    model: "openai/gpt-6-astra",
    instructions,
    input: [{ role: "user", content: input }],
  });
  const out: string[] = [];
  for (const item of (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) if (c.type === "output_text" && c.text) out.push(c.text);
  }
  return out.join("");
}

export function parseJson<T>(text: string): T {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = m?.[1] ? m[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(body) as T;
}
