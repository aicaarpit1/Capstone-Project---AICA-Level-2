import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeManagementScore, SCORE_WEIGHTS, type ScoreComponent } from "./score";

export type Report = {
  overview: { summary: string; business: string; key_financials: { metric: string; value: string; period: string; source: number | null }[] };
  guidance: { statement: string; made_in: string; target_period: string; actual: string; status: "achieved" | "missed" | "partially_achieved" | "pending"; sources: number[] }[];
  regulatory: { date: string; title: string; kind: "notice" | "reply" | "order" | "corrective_action" | "other"; status: string; details: string; sources: number[] }[];
  controversies: { date: string; title: string; subject: string; classification: "unverified" | "substantiated" | "resolved"; details: string; sources: number[] }[];
  score: { components: ScoreComponent[]; total: number | null; coverage: number; sufficiency: string };
  data_gaps: string[];
  sources: { n: number; title: string; url: string; doc_type: string }[];
};

const SYSTEM = `You are a rigorous Indian equity research analyst. Use ONLY the numbered source documents provided. Never invent numbers, dates, orders or quotes. Cite sources by their number. If evidence is missing, say so and use null scores. Output a single JSON object, no prose.`;

function schemaPrompt(name: string) {
  return `Produce research for ${name} as JSON with exactly this shape:
{
 "overview": {"summary": string (3-4 sentences), "business": string, "key_financials": [{"metric": string, "value": string, "period": string, "source": number|null}]},
 "guidance": [{"statement": management guidance/promise from concalls or presentations, "made_in": quarter/date, "target_period": string, "actual": what later results show or "not yet reported", "status": "achieved"|"missed"|"partially_achieved"|"pending", "sources": number[]}],
 "regulatory": [{"date": string, "title": string, "kind": "notice"|"reply"|"order"|"corrective_action"|"other", "status": string, "details": string, "sources": number[]}],
 "controversies": [{"date": string, "title": string, "subject": company/promoter/director name, "classification": "unverified"|"substantiated"|"resolved", "details": string, "sources": number[]}],
 "score_components": {"guidance": {"score": 0-100|null, "rationale": string}, "governance": {...}, "execution": {...}, "compliance": {...}, "transparency": {...}},
 "sufficiency": one sentence on how strong the evidence is,
 "data_gaps": string[] listing what could not be verified
}
Sort regulatory and controversies chronologically (oldest first). Use null score when evidence is inadequate.`;
}

export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { searchDocuments, askModel, parseJson } = await import("./research.server");

    const { data: company, error: cErr } = await supabase.from("companies").select("*").eq("id", data.companyId).single();
    if (cErr || !company) throw new Error("Company not found");

    await supabase.from("research_history").upsert({ user_id: userId, company_id: company.id, viewed_at: new Date().toISOString() }, { onConflict: "user_id,company_id" });

    if (!data.force) {
      const { data: recent } = await supabase.from("research_jobs").select("id").eq("company_id", company.id).eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(1);
      if (recent?.length) return { jobId: recent[0]!.id, cached: true };
      const { data: running } = await supabase.from("research_jobs").select("id").eq("company_id", company.id).eq("status", "running")
        .gte("created_at", new Date(Date.now() - 5 * 6e4).toISOString()).limit(1);
      if (running?.length) return { jobId: running[0]!.id, cached: true };
    }

    const { data: job, error: jErr } = await supabaseAdmin.from("research_jobs")
      .insert({ company_id: company.id, requested_by: userId, status: "running", stage: "Collecting documents" }).select("id").single();
    if (jErr || !job) throw new Error(jErr?.message || "Could not start research");

    try {
      const { docs, failures } = await searchDocuments(company.name, company.nse_symbol || "");
      if (docs.length) {
        await supabaseAdmin.from("documents").upsert(
          docs.map((d) => ({ company_id: company.id, ...d, extraction_status: d.excerpt ? "extracted" : "metadata_only" })),
          { onConflict: "company_id,url" },
        );
      }
      // Use stored library (includes earlier runs) for analysis
      const { data: library } = await supabaseAdmin.from("documents").select("title,url,doc_type,excerpt").eq("company_id", company.id)
        .order("created_at", { ascending: false }).limit(30);
      const lib = library ?? [];
      if (!lib.length) throw new Error(`No documents could be retrieved. ${failures.join("; ")}`);

      await supabaseAdmin.from("research_jobs").update({ stage: "Analysing documents", sources_found: lib.length }).eq("id", job.id);
      const corpus = lib.map((d, i) => `[${i + 1}] ${d.title} (${d.doc_type}) ${d.url}\n${(d.excerpt || "").slice(0, 3500)}`).join("\n\n---\n\n");
      const text = await askModel(SYSTEM, `${schemaPrompt(company.name)}\n\nSOURCES:\n${corpus}`);
      const raw = parseJson<{
        overview: Report["overview"]; guidance: Report["guidance"]; regulatory: Report["regulatory"]; controversies: Report["controversies"];
        score_components: Record<string, { score: number | null; rationale: string }>; sufficiency: string; data_gaps: string[];
      }>(text);

      const components: ScoreComponent[] = SCORE_WEIGHTS.map((w) => ({
        ...w,
        score: typeof raw.score_components?.[w.key]?.score === "number" ? (raw.score_components[w.key]!.score as number) : null,
        rationale: raw.score_components?.[w.key]?.rationale || "No evidence found.",
      }));
      const { total, coverage } = computeManagementScore(components);
      const report: Report = {
        overview: raw.overview ?? { summary: "", business: "", key_financials: [] },
        guidance: raw.guidance ?? [],
        regulatory: raw.regulatory ?? [],
        controversies: raw.controversies ?? [],
        score: { components, total, coverage, sufficiency: raw.sufficiency || "" },
        data_gaps: [...(raw.data_gaps ?? []), ...failures.map((f) => `Source search failed — ${f}`)],
        sources: lib.map((d, i) => ({ n: i + 1, title: d.title, url: d.url, doc_type: d.doc_type })),
      };
      await supabaseAdmin.from("research_jobs").update({
        status: "completed", stage: "Done", report: report as never, completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      return { jobId: job.id, cached: false };
    } catch (e) {
      await supabaseAdmin.from("research_jobs").update({ status: "failed", error: (e as Error).message.slice(0, 1000) }).eq("id", job.id);
      throw e;
    }
  });

export const askCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; question: string }) => {
    if (!d.question?.trim() || d.question.length > 2000) throw new Error("Invalid question");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { askModel } = await import("./research.server");
    const [{ data: company }, { data: docs }, { data: job }, { data: history }] = await Promise.all([
      supabase.from("companies").select("name").eq("id", data.companyId).single(),
      supabase.from("documents").select("title,url,doc_type,excerpt").eq("company_id", data.companyId).order("created_at", { ascending: false }).limit(30),
      supabase.from("research_jobs").select("report").eq("company_id", data.companyId).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("chat_messages").select("role,content").eq("user_id", userId).eq("company_id", data.companyId).order("created_at", { ascending: false }).limit(8),
    ]);
    // Simple keyword retrieval over stored excerpts
    const terms = data.question.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    const ranked = (docs ?? []).map((d, i) => ({ d, n: i + 1, s: terms.reduce((a, t) => a + ((d.excerpt || "").toLowerCase().split(t).length - 1), 0) }))
      .sort((a, b) => b.s - a.s).slice(0, 8);
    const ctx = ranked.map(({ d, n }) => `[${n}] ${d.title} — ${d.url}\n${(d.excerpt || "").slice(0, 3000)}`).join("\n\n---\n\n");
    const convo = (history ?? []).reverse().map((m) => `${m.role}: ${m.content}`).join("\n");
    const answer = await askModel(
      `You answer questions about ${company?.name ?? "the company"} using only the numbered sources and the stored research summary. Cite like [3]. If the sources don't cover it, say so plainly. Be concise; use markdown.`,
      `RESEARCH SUMMARY:\n${JSON.stringify((job?.report as Record<string, unknown> | null)?.["overview"] ?? {}).slice(0, 3000)}\n\nSOURCES:\n${ctx}\n\nCONVERSATION:\n${convo}\n\nQUESTION: ${data.question}`,
    );
    const { error } = await supabase.from("chat_messages").insert([
      { user_id: userId, company_id: data.companyId, role: "user", content: data.question },
      { user_id: userId, company_id: data.companyId, role: "assistant", content: answer },
    ]);
    if (error) throw new Error(error.message);
    return { answer };
  });

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, companies, docs, jobs, roles] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 100 }),
      supabaseAdmin.from("companies").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("documents").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("research_jobs").select("id,status,stage,error,created_at,sources_found,companies(name)").order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("user_roles").select("user_id,role"),
    ]);
    return {
      users: (users.data?.users ?? []).map((u) => ({
        id: u.id, email: u.email ?? "", created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
        roles: (roles.data ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
      })),
      counts: { companies: companies.count ?? 0, documents: docs.count ?? 0, jobs: jobs.data?.length ?? 0 },
      jobs: jobs.data ?? [],
      integrations: {
        firecrawl: Boolean(process.env["FIRECRAWL_API_KEY"]),
        ai: Boolean(process.env["LOVABLE_API_KEY"]),
      },
    };
  });
