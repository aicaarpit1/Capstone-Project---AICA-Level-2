import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { CompanySearch } from "@/components/CompanySearch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dalal Research — AI equity research for NSE & BSE companies" },
      { name: "description", content: "Search any Indian listed company to get source-cited research: filings, concall guidance tracking, regulatory timeline and a management score." },
      { property: "og:title", content: "Dalal Research — AI equity research for Indian companies" },
      { property: "og:description", content: "Source-cited research on NSE/BSE companies: guidance vs actuals, SEBI matters, controversies and management scoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FEATURES = [
  ["Documents", "Annual reports, results, concalls, filings and SEBI orders collected automatically."],
  ["Guidance tracker", "Every management promise checked against later quarterly results."],
  ["Regulatory timeline", "Notices, replies and final orders in date order, with sources."],
  ["Management score", "A 0–100 score with visible weights, evidence and gaps."],
];

function Index() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 pt-24 pb-20">
        <p className="fade-up font-mono text-xs uppercase tracking-[0.25em] text-accent">NSE · BSE · SEBI</p>
        <h1 className="fade-up mt-4 text-5xl font-semibold leading-[1.05] md:text-6xl">
          Research any Indian company,<br /><em className="font-normal text-muted-foreground">with the receipts.</em>
        </h1>
        <p className="fade-up mt-5 max-w-xl text-muted-foreground">
          Pick a company and the platform gathers public filings and news, then builds a cited research file you can question.
        </p>
        <div className="fade-up mt-10"><CompanySearch large /></div>
        <div className="mt-20 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="bg-card p-6">
              <h3 className="text-lg font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
