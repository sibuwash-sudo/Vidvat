import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BookmarkCheck, PenLine, BookOpen, Target } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Vidvat" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const dataQ = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [pr, bm, profile] = await Promise.all([
        supabase
          .from("progress")
          .select("status, question_id, updated_at, questions(text, q_number, marks, papers(year, paper, id))")
          .eq("user_id", user!.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("bookmarks")
          .select("question_id, questions(text, q_number, marks, papers(year, paper, id))")
          .eq("user_id", user!.id),
        supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle(),
      ]);
      return { progress: pr.data ?? [], bookmarks: bm.data ?? [], profile: profile.data };
    },
  });

  const progress = dataQ.data?.progress ?? [];
  const bookmarks = dataQ.data?.bookmarks ?? [];

  const counts = {
    reading: progress.filter((p) => p.status === "reading").length,
    practiced: progress.filter((p) => p.status === "practiced").length,
    written: progress.filter((p) => p.status === "written").length,
    bookmarked: bookmarks.length,
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1 container mx-auto px-6 py-12"><Skeleton className="h-40 w-full" /></main>
      </div>
    );
  }

  const name = dataQ.data?.profile?.display_name || user.email?.split("@")[0];

  const stats = [
    { label: "Bookmarked", value: counts.bookmarked, icon: BookmarkCheck },
    { label: "Reading", value: counts.reading, icon: BookOpen },
    { label: "Practised", value: counts.practiced, icon: Target },
    { label: "Written", value: counts.written, icon: PenLine },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-6 py-12 max-w-5xl">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3">Your desk</p>
          <h1 className="font-display text-5xl">Hello, <span className="italic">{name}</span>.</h1>
          <p className="text-muted-foreground mt-3 font-serif text-lg">
            A snapshot of your Mains preparation so far.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {stats.map((s) => (
            <Card key={s.label} className="p-6">
              <s.icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-display text-4xl">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </Card>
          ))}
        </div>

        <section className="mb-16">
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="font-display text-3xl">Bookmarks</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          {bookmarks.length === 0 ? (
            <p className="text-muted-foreground italic">
              No bookmarks yet. <Link to="/papers" className="text-primary hover:underline">Browse papers</Link> and mark questions to return to.
            </p>
          ) : (
            <ul className="space-y-4">
              {bookmarks.map((b: any) => (
                <li key={b.question_id}>
                  <Link
                    to="/papers/$paperId"
                    params={{ paperId: b.questions.papers.id }}
                    className="block group"
                  >
                    <Card className="p-5 hover:border-primary transition-colors">
                      <div className="text-xs uppercase tracking-[0.2em] text-accent-foreground/70 mb-2">
                        {b.questions.papers.year} · {b.questions.papers.paper} · Q{b.questions.q_number}
                      </div>
                      <p className="font-serif text-lg group-hover:text-primary transition-colors">
                        {b.questions.text}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline gap-4 mb-6">
            <h2 className="font-display text-3xl">Recent activity</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          {progress.length === 0 ? (
            <div>
              <p className="text-muted-foreground italic mb-4">
                You haven't logged any practice yet.
              </p>
              <Button asChild>
                <Link to="/papers">Start with a paper</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {progress.slice(0, 10).map((p: any) => (
                <li key={p.question_id}>
                  <Link
                    to="/papers/$paperId"
                    params={{ paperId: p.questions.papers.id }}
                    className="block hover:bg-secondary/50 -mx-3 px-3 py-3 rounded transition-colors"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="text-xs uppercase tracking-[0.2em] text-primary w-24 shrink-0">
                        {p.status}
                      </span>
                      <div className="flex-1">
                        <p className="font-serif">{p.questions.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.questions.papers.year} · {p.questions.papers.paper} · Q{p.questions.q_number}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
