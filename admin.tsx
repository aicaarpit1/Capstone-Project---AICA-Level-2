import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/research.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Dalal Research" },
      { name: "description", content: "Manage users, research jobs and integrations." },
      { property: "og:title", content: "Admin — Dalal Research" },
      { property: "og:description", content: "Manage users, research jobs and integrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const fn = useServerFn(getAdminOverview);
  const { data, error, isLoading } = useQuery({ queryKey: ["admin"], queryFn: () => fn() });
  if (isLoading) return <main className="mx-auto max-w-6xl px-5 py-12 text-muted-foreground">Loading…</main>;
  if (error || !data) return <main className="mx-auto max-w-6xl px-5 py-12">Admins only.</main>;
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-5 py-12">
      <h1 className="text-3xl font-semibold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Users", data.users.length], ["Companies", data.counts.companies], ["Documents", data.counts.documents], ["Recent jobs", data.counts.jobs]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-5"><div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div><div className="mt-1 font-display text-3xl tabular">{v}</div></div>
        ))}
      </div>
      <section>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge variant={data.integrations.firecrawl ? "default" : "destructive"}>Web document search: {data.integrations.firecrawl ? "connected" : "missing"}</Badge>
          <Badge variant={data.integrations.ai ? "default" : "destructive"}>AI analysis: {data.integrations.ai ? "connected" : "missing"}</Badge>
          <Badge variant="outline">NSE/BSE official APIs: not integrated (public pages via web search)</Badge>
          <Badge variant="outline">Scheduled refresh: not yet enabled</Badge>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Research jobs</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Company</th><th className="p-3">Status</th><th className="p-3">Sources</th><th className="p-3">When</th><th className="p-3">Error</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.jobs.map((j) => (
                <tr key={j.id}><td className="p-3">{(j.companies as { name: string } | null)?.name}</td><td className="p-3">{j.status}</td><td className="p-3">{j.sources_found}</td>
                  <td className="p-3 text-muted-foreground">{new Date(j.created_at).toLocaleString("en-IN")}</td><td className="p-3 text-destructive">{j.error?.slice(0, 120)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Users</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {data.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 text-sm">
              <span>{u.email}</span>
              <span className="flex gap-2">{u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
