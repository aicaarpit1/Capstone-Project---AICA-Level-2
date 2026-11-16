import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Company = { id: string; name: string; nse_symbol: string | null; bse_code: string | null; sector: string | null };

export function CompanySearch({ large = false }: { large?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(t.current);
    const term = q.trim().replace(/[%,()]/g, "");
    if (!term) { setItems([]); return; }
    t.current = setTimeout(async () => {
      const { data } = await supabase.from("companies").select("id,name,nse_symbol,bse_code,sector")
        .or(`name.ilike.%${term}%,nse_symbol.ilike.%${term}%,bse_code.ilike.%${term}%,cin.ilike.%${term}%`).limit(8);
      setItems(data ?? []); setActive(0);
    }, 150);
  }, [q]);

  const go = async (c?: Company) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate({ to: "/auth" }); return; }
    if (c) { navigate({ to: "/company/$id", params: { id: c.id } }); return; }
    const name = q.trim();
    if (name.length < 3) return;
    const { data, error } = await supabase.from("companies").insert({ name }).select("id").single();
    if (error || !data) { toast.error(error?.message || "Could not add company"); return; }
    navigate({ to: "/company/$id", params: { id: data.id } });
  };

  return (
    <div className="relative w-full">
      <div className={`flex items-center gap-3 rounded-xl border border-border bg-card shadow-soft ${large ? "px-5 py-4" : "px-3 py-2"}`}>
        <Search className="h-5 w-5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter") go(items[active]);
          }}
          placeholder="Company name, NSE symbol, BSE code or CIN"
          className={`w-full bg-transparent outline-none placeholder:text-muted-foreground ${large ? "text-lg" : "text-sm"}`}
        />
      </div>
      {open && q.trim() && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-soft">
          {items.map((c, i) => (
            <button key={c.id} onMouseDown={() => go(c)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${i === active ? "bg-muted" : ""}`}>
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{[c.nse_symbol, c.bse_code].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          <button onMouseDown={() => go()}
            className={`flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm text-muted-foreground ${active === items.length ? "bg-muted" : ""}`}>
            <Plus className="h-4 w-4" /> Research “{q.trim()}” as a new company
          </button>
        </div>
      )}
    </div>
  );
}
