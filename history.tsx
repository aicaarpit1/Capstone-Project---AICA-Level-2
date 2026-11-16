import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CompanySearch } from "@/components/CompanySearch";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Research history — Dalal Research" },
      { name: "description", content: "Companies you have researched." },
      { property: "og:title", content: "Research history — Dalal Research" },
      { property: "og:description", content: "Companies you have researched." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: History,
});

function History() {
  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => (await supabase.from("research_history").select("viewed_at, companies(id,name,nse_symbol,sector)").order("viewed_at", { ascending: false })).data ?? [],
  });
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-3xl font-semibold">Your research</h1>
      <div className="mt-6"><CompanySearch /></div>
      <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !data?.length && <p className="p-6 text-sm text-muted-foreground">No research yet. Search for a company above.</p>}
        {data?.map((h) => h.companies && (
          <Link key={h.companies.id} to="/company/$id" params={{ id: h.companies.id }} className="flex items-center justify-between p-4 hover:bg-muted">
            <div>
              <div className="font-medium">{h.companies.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{[h.companies.nse_symbol, h.companies.sector].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="text-xs text-muted-foreground">{new Date(h.viewed_at).toLocaleDateString("en-IN")}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
