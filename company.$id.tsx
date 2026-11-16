import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { RefreshCw, ExternalLink, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runResearch, askCompany, type Report } from "@/lib/research.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/company/$id")({
  head: () => ({
    meta: [
      { title: "Company research — Dalal Research" },
      { name: "description", content: "Cited research file: documents, guidance tracker, regulatory timeline and management score." },
      { property: "og:title", content: "Company research — Dalal Research" },
      { property: "og:description", content: "Cited research file for an Indian listed company." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyPage,
});

const STATUS_STYLE: Record<string, string> = {
  achieved: "bg-success/15 text-success", missed: "bg-destructive/15 text-destructive",
  partially_achieved: "bg-warning/20 text-accent-foreground", pending: "bg-muted text-muted-foreground",
  substantiated: "bg-destructive/15 text-destructive", unverified: "bg-warning/20 text-accent-foreground", resolved: "bg-success/15 text-success",
};
const label = (s: string) => s.replace(/_/g, " ");

function CompanyPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const research = useServerFn(runResearch);
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  const company = useQuery({ queryKey: ["company", id], queryFn: async () => (await supabase.from("companies").select("*").eq("id", id).single()).data });
  const job = useQuery({
    queryKey: ["job", id],
    queryFn: async () => (await supabase.from("research_jobs").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });
  const docs = useQuery({ queryKey: ["docs", id], queryFn: async () => (await supabase.from("documents").select("*").eq("company_id", id).order("created_at", { ascending: false })).data ?? [] });

  const start = async (force = false) => {
    setRunning(true);
    try {
      await research({ data: { companyId: id, force } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["job", id] });
      qc.invalidateQueries({ queryKey: ["docs", id] });
    }
  };

  useEffect(() => {
    if (started.current || job.isLoading) return;
    started.current = true;
    start(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.isLoading]);

  const report = job.data?.status === "completed" ? (job.data.report as unknown as Report) : null;
  const c = company.data;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{[c?.nse_symbol && `NSE ${c.nse_symbol}`, c?.bse_code && `BSE ${c.bse_code}`, c?.sector].filter(Boolean).join(" · ") || "Company"}</p>
          <h1 className="mt-1 text-4xl font-semibold">{c?.name ?? "…"}</h1>
          {job.data?.completed_at && <p className="mt-1 text-xs text-muted-foreground">Last researched {new Date(job.data.completed_at).toLocaleString("en-IN")}</p>}
        </div>
        <Button variant="outline" onClick={() => start(true)} disabled={running || job.data?.status === "running"} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /> Refresh research
        </Button>
      </div>

      {(running || job.data?.status === "running") && (
        <div className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-soft">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <div>
            <div className="font-medium">{job.data?.status === "running" ? job.data.stage : "Starting research"}…</div>
            <div className="text-sm text-muted-foreground">Searching official sources and news, then analysing. This usually takes 1–2 minutes.</div>
          </div>
        </div>
      )}
      {!running && job.data?.status === "failed" && (
        <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
          <div className="font-medium text-destructive">Research failed</div>
          <p className="mt-1 text-muted-foreground">{job.data.error}</p>
        </div>
      )}

      {report && (
        <Tabs defaultValue="overview" className="mt-8">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="guidance">Guidance vs actual</TabsTrigger>
            <TabsTrigger value="score">Management score</TabsTrigger>
            <TabsTrigger value="regulatory">Regulatory & controversies</TabsTrigger>
            <TabsTrigger value="docs">Documents ({docs.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="chat">Ask AI</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
              <h2 className="text-xl font-semibold">Summary</h2>
              <p className="mt-3 leading-relaxed">{report.overview.summary}</p>
              <p className="mt-3 text-sm text-muted-foreground">{report.overview.business}</p>
              {report.data_gaps.length > 0 && (
                <div className="mt-6 rounded-lg bg-muted p-4 text-sm">
                  <div className="font-medium">Not verified / data gaps</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{report.data_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
            </section>
            <aside className="space-y-6">
              <ScoreDial report={report} />
              <section className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold">Key financials</h3>
                {!report.overview.key_financials.length && <p className="mt-2 text-sm text-muted-foreground">No figures found in retrieved sources.</p>}
                <dl className="mt-3 space-y-2 text-sm">
                  {report.overview.key_financials.map((f, i) => (
                    <div key={i} className="flex justify-between gap-3 border-b border-border/60 pb-2">
                      <dt className="text-muted-foreground">{f.metric} <span className="text-xs">({f.period})</span></dt>
                      <dd className="tabular font-mono">{f.value}{f.source ? <Cite n={f.source} report={report} /> : null}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </aside>
          </TabsContent>

          <TabsContent value="guidance" className="mt-6">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="p-3">Guidance</th><th className="p-3">Made</th><th className="p-3">Target</th><th className="p-3">Actual</th><th className="p-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.guidance.map((g, i) => (
                    <tr key={i} className="align-top">
                      <td className="p-3">{g.statement}{g.sources.map((n) => <Cite key={n} n={n} report={report} />)}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{g.made_in}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{g.target_period}</td>
                      <td className="p-3">{g.actual}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLE[g.status] ?? ""}`}>{label(g.status)}</span></td>
                    </tr>
                  ))}
                  {!report.guidance.length && <tr><td colSpan={5} className="p-6 text-muted-foreground">No management guidance found in retrieved concalls or presentations.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="score" className="mt-6 grid gap-6 lg:grid-cols-3">
            <ScoreDial report={report} />
            <div className="lg:col-span-2 space-y-3">
              {report.score.components.map((s) => (
                <div key={s.key} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{s.name} <span className="text-xs text-muted-foreground">· weight {s.weight}%</span></div>
                    <div className="tabular font-mono text-lg">{s.score ?? "—"}</div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${s.score ?? 0}%` }} /></div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.rationale}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Evidence covers {report.score.coverage}% of score weight. Components without evidence are excluded; below 60% coverage no score is given.</p>
            </div>
          </TabsContent>

          <TabsContent value="regulatory" className="mt-6 grid gap-8 lg:grid-cols-2">
            <Timeline title="Regulatory matters" empty="No regulatory notices or orders found in retrieved sources."
              items={report.regulatory.map((r) => ({ date: r.date, title: r.title, tag: r.kind, sub: r.status, details: r.details, sources: r.sources }))} report={report} />
            <Timeline title="Controversies" empty="No controversies found in retrieved sources."
              items={report.controversies.map((r) => ({ date: r.date, title: r.title, tag: r.classification, sub: r.subject, details: r.details, sources: r.sources }))} report={report} />
          </TabsContent>

          <TabsContent value="docs" className="mt-6"><DocLibrary docs={docs.data ?? []} /></TabsContent>
          <TabsContent value="chat" className="mt-6"><Chat companyId={id} report={report} /></TabsContent>
        </Tabs>
      )}
    </main>
  );
}

function Cite({ n, report }: { n: number; report: Report }) {
  const s = report.sources.find((x) => x.n === n);
  if (!s) return null;
  return <a href={s.url} target="_blank" rel="noreferrer" title={s.title} className="ml-1 align-super font-mono text-[10px] text-accent hover:underline">[{n}]</a>;
}

function ScoreDial({ report }: { report: Report }) {
  const t = report.score.total;
  return (
    <section className="rounded-xl border border-border bg-primary p-6 text-primary-foreground shadow-soft">
      <div className="font-mono text-xs uppercase tracking-[0.2em] opacity-70">Management score</div>
      <div className="mt-2 font-display text-6xl font-semibold tabular">{t ?? "—"}<span className="text-2xl opacity-60">{t !== null ? "/100" : ""}</span></div>
      <p className="mt-2 text-sm opacity-80">{t === null ? "Not enough evidence to score responsibly." : report.score.sufficiency}</p>
    </section>
  );
}

function Timeline({ title, items, empty, report }: { title: string; empty: string; report: Report; items: { date: string; title: string; tag: string; sub: string; details: string; sources: number[] }[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      {!items.length && <p className="mt-3 text-sm text-muted-foreground">{empty}</p>}
      <ol className="mt-4 space-y-5 border-l border-border pl-5">
        {items.map((it, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
            <div className="font-mono text-xs text-muted-foreground">{it.date}</div>
            <div className="mt-0.5 font-medium">{it.title}{it.sources.map((n) => <Cite key={n} n={n} report={report} />)}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 capitalize ${STATUS_STYLE[it.tag] ?? "bg-muted"}`}>{label(it.tag)}</span>
              <span className="text-muted-foreground">{it.sub}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{it.details}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

type Doc = { id: string; title: string; url: string; doc_type: string; source_domain: string | null; extraction_status: string; created_at: string };
function DocLibrary({ docs }: { docs: Doc[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const types = ["all", ...Array.from(new Set(docs.map((d) => d.doc_type)))];
  const list = docs.filter((d) => (type === "all" || d.doc_type === type) && d.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {types.map((t) => <Button key={t} size="sm" variant={t === type ? "default" : "outline"} onClick={() => setType(t)} className="capitalize">{label(t)}</Button>)}
      </div>
      <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
        {list.map((d) => (
          <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 p-4 hover:bg-muted">
            <div className="min-w-0">
              <div className="truncate font-medium">{d.title}</div>
              <div className="text-xs text-muted-foreground">{d.source_domain} · added {new Date(d.created_at).toLocaleDateString("en-IN")}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="capitalize">{label(d.doc_type)}</Badge>
              {d.extraction_status !== "extracted" && <Badge variant="outline">{label(d.extraction_status)}</Badge>}
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>
          </a>
        ))}
        {!list.length && <p className="p-6 text-sm text-muted-foreground">No documents match.</p>}
      </div>
    </div>
  );
}

function Chat({ companyId, report }: { companyId: string; report: Report }) {
  const ask = useServerFn(askCompany);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgs = useQuery({
    queryKey: ["chat", companyId],
    queryFn: async () => (await supabase.from("chat_messages").select("id,role,content").eq("company_id", companyId).order("created_at")).data ?? [],
  });
  useEffect(() => { inputRef.current?.focus(); }, [pending]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim(); if (!q || pending) return;
    setText(""); setPending(q);
    try { await ask({ data: { companyId, question: q } }); await qc.invalidateQueries({ queryKey: ["chat", companyId] }); }
    catch (err) { toast.error((err as Error).message); setText(q); }
    finally { setPending(null); }
  };
  const linkify = (s: string) => s.replace(/\[(\d+)\]/g, (m, n) => { const src = report.sources.find((x) => x.n === Number(n)); return src ? `[[${n}]](${src.url})` : m; });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="space-y-5">
        {!msgs.data?.length && !pending && <p className="text-sm text-muted-foreground">Ask about guidance, results, regulatory matters or governance. Answers cite the stored documents.</p>}
        {msgs.data?.map((m) => m.role === "user"
          ? <div key={m.id} className="ml-auto w-fit max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">{m.content}</div>
          : <div key={m.id} className="prose prose-sm max-w-none text-foreground [&_a]:text-accent"><ReactMarkdown components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{linkify(m.content)}</ReactMarkdown></div>)}
        {pending && <>
          <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground">{pending}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading sources…</div>
        </>}
      </div>
      <form onSubmit={send} className="sticky bottom-4 mt-6 flex gap-2 rounded-xl border border-border bg-card p-2 shadow-soft">
        <Input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this company…" className="border-0 shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" disabled={!!pending || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
