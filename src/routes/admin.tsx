import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { useIsAdmin } from "@/lib/use-is-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Sparkles } from "lucide-react";
import { checkAdminBootstrap, claimFirstAdmin } from "@/lib/admin-bootstrap.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Vidvat" }] }),
  component: AdminLayout,
});

const tabs: { to: string; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/papers", label: "Papers" },
  { to: "/admin/questions", label: "Questions" },
  { to: "/admin/tags", label: "Tags" },
  { to: "/admin/themes", label: "Themes" },
  { to: "/admin/toppers", label: "Topper Copies" },
];

function FirstAdminWizard({ onClaimed }: { onClaimed: () => void }) {
  const check = useServerFn(checkAdminBootstrap);
  const claim = useServerFn(claimFirstAdmin);
  const qc = useQueryClient();

  const bootstrapQ = useQuery({
    queryKey: ["admin-bootstrap"],
    queryFn: () => check(),
  });

  const mutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => {
      toast.success("You're now an admin!");
      qc.invalidateQueries({ queryKey: ["is-admin"] });
      qc.invalidateQueries({ queryKey: ["admin-bootstrap"] });
      onClaimed();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (bootstrapQ.isLoading) return null;
  if (bootstrapQ.data?.adminExists) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 max-w-lg mx-auto mt-6 text-center">
      <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
      <h3 className="font-display text-xl mb-2">Claim first admin</h3>
      <p className="text-sm text-muted-foreground mb-4">
        No administrator has been set up yet. Since you're the first one here, you can claim the admin role for your account.
      </p>
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "Granting…" : "Make me admin"}
      </Button>
    </div>
  );
}

function AdminLayout() {
  const { isAdmin, loading, user } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Vidvat</p>
          <h1 className="font-display text-4xl mt-1">Admin Console</h1>
        </div>

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !isAdmin ? (
          <>
            <div className="rounded-lg border border-border bg-card p-8 text-center max-w-lg mx-auto">
              <ShieldAlert className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="font-display text-2xl mb-2">Restricted area</h2>
              <p className="text-sm text-muted-foreground">
                You need administrator privileges to view this section. Ask an existing admin to grant you the
                <code className="mx-1 px-1.5 py-0.5 rounded bg-secondary text-foreground">admin</code> role.
              </p>
            </div>
            {user && (
              <FirstAdminWizard
                onClaimed={() => qc.invalidateQueries({ queryKey: ["is-admin"] })}
              />
            )}
          </>
        ) : (
          <>
            <nav className="flex flex-wrap gap-1 border-b border-border mb-8">
              {tabs.map((t) => {
                const active = t.exact
                  ? location.pathname === t.to
                  : location.pathname.startsWith(t.to);
                return (
                  <Link
                    key={t.to}
                    to={t.to as never}
                    className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                      active
                        ? "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <Outlet />
          </>
        )}
      </div>
    </div>
  );
}
