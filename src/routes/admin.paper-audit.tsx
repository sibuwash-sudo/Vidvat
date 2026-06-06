import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/admin/paper-audit")({
  component: PaperAuditPage,
});

const EXPECTED: Record<string, number> = { Essay: 8, GS1: 20, GS2: 20, GS3: 20, GS4: 12 };

function PaperAuditPage() {
  const auditQ = useQuery({
    queryKey: ["paper-audit"],
    queryFn: async () => {
      const [papersRes, questionsRes] = await Promise.all([
        supabase.from("papers").select("id, year, paper, title").order("year", { ascending: false }),
        supabase.from("questions").select("paper_id"),
      ]);
      if (papersRes.error) throw papersRes.error;
      if (questionsRes.error) throw questionsRes.error;
      const counts = new Map<string, number>();
      (questionsRes.data ?? []).forEach((q) => counts.set(q.paper_id, (counts.get(q.paper_id) ?? 0) + 1));
      return (papersRes.data ?? []).map((p) => {
        const total = counts.get(p.id) ?? 0;
        const expected = EXPECTED[p.paper] ?? 0;
        const pct = expected ? Math.min(100, Math.round((total / expected) * 100)) : 0;
        return { ...p, total, expected, pct };
      });
    },
  });

  const rows = auditQ.data ?? [];
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalActual = rows.reduce((s, r) => s + r.total, 0);
  const overallPct = totalExpected ? Math.round((totalActual / totalExpected) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Paper Audit</h2>
        <p className="text-sm text-muted-foreground">Completeness of imported UPSC PYQs against expected counts per paper.</p>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Overall completeness</span>
          <span className="font-medium">{totalActual} / {totalExpected} ({overallPct}%)</span>
        </div>
        <Progress value={overallPct} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Year</TableHead>
              <TableHead className="w-24">Paper</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-28 text-right">Expected</TableHead>
              <TableHead className="w-56">Completeness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditQ.isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No papers found.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.year}</TableCell>
                <TableCell>{r.paper}</TableCell>
                <TableCell className="text-muted-foreground">{r.title}</TableCell>
                <TableCell className="text-right">{r.total}</TableCell>
                <TableCell className="text-right">{r.expected}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={r.pct} className="flex-1" />
                    <Badge
                      variant="outline"
                      className={
                        r.pct === 100
                          ? "text-green-600 border-green-600/40"
                          : r.pct >= 50
                          ? "text-amber-600 border-amber-600/40"
                          : "text-destructive border-destructive/40"
                      }
                    >
                      {r.pct}%
                    </Badge>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
