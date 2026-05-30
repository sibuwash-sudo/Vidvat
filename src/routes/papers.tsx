import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/papers")({
  head: () => ({
    meta: [
      { title: "Papers — Vidvat UPSC Mains PYQ" },
      { name: "description", content: "Browse all UPSC Mains previous year papers — Essay and GS I–IV — organised by year." },
    ],
  }),
  component: PapersPage,
});

type Paper = {
  id: string;
  year: number;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4";
  title: string;
};

const paperOrder = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;
const paperLabel: Record<string, string> = {
  Essay: "Essay",
  GS1: "General Studies I",
  GS2: "General Studies II",
  GS3: "General Studies III",
  GS4: "GS IV — Ethics",
};

function PapersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["papers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("papers")
        .select("id, year, paper, title")
        .order("year", { ascending: false });
      if (error) throw error;
      return data as Paper[];
    },
  });

  const byYear: Record<number, Paper[]> = {};
  (data ?? []).forEach((p) => {
    (byYear[p.year] ||= []).push(p);
  });
  Object.values(byYear).forEach((arr) =>
    arr.sort((a, b) => paperOrder.indexOf(a.paper) - paperOrder.indexOf(b.paper)),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-6 py-12 md:py-16">
        <div className="mb-12 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-4">The Archive</p>
          <h1 className="font-display text-5xl mb-3">Mains papers</h1>
          <p className="text-muted-foreground font-serif text-lg">
            Pick a year, then a paper. Every question is preserved exactly as it
            appeared on the UPSC question paper.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-10">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        )}

        <div className="space-y-16">
          {Object.keys(byYear)
            .map(Number)
            .sort((a, b) => b - a)
            .map((year) => (
              <section key={year}>
                <div className="flex items-baseline gap-4 mb-6">
                  <h2 className="font-display text-4xl">{year}</h2>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {byYear[year].map((p) => (
                    <Link
                      key={p.id}
                      to="/papers/$paperId"
                      params={{ paperId: p.id }}
                      className="group"
                    >
                      <Card className="p-6 h-full hover:border-primary transition-colors hover:shadow-md">
                        <div className="text-xs uppercase tracking-[0.2em] text-accent-foreground/70 mb-2">
                          {year} · {p.paper}
                        </div>
                        <h3 className="font-display text-2xl group-hover:text-primary transition-colors">
                          {paperLabel[p.paper]}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-3">
                          250 marks · 3 hours
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </main>
    </div>
  );
}
