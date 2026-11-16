import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold">Dalal</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">research</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/history">History</Link></Button>
              {isAdmin && <Button asChild variant="ghost" size="sm"><Link to="/admin">Admin</Link></Button>}
              <Button variant="outline" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}
