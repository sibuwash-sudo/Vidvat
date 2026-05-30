import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useIsAdmin } from "@/lib/use-is-admin";
import { Button } from "@/components/ui/button";
import { BookOpen, Shield } from "lucide-react";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();

  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-display text-2xl tracking-tight">
            Vidvat<span className="text-primary">.</span>
          </span>
          <span className="hidden sm:inline text-xs uppercase tracking-[0.2em] text-muted-foreground ml-2">
            UPSC Mains PYQ
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          <Link
            to="/papers"
            className="px-3 py-2 rounded-md hover:bg-secondary transition-colors"
            activeProps={{ className: "px-3 py-2 rounded-md bg-secondary font-medium" }}
          >
            Papers
          </Link>
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="px-3 py-2 rounded-md hover:bg-secondary transition-colors"
                activeProps={{ className: "px-3 py-2 rounded-md bg-secondary font-medium" }}
              >
                Dashboard
              </Link>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="default">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
