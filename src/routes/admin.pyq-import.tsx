import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/components/admin/csv-import";

export const Route = createFileRoute("/admin/pyq-import")({
  component: PyqImportPage,
});

const ALLOWED_PAPERS = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;
type PaperCode = (typeof ALLOWED_PAPERS)[number];
const EXPECTED: Record<PaperCode, number> = { Essay: 8, GS1: 20, GS2: 20, GS3: 20, GS4: 12 };

type ParsedRow = {
  rowNum: number;
  year: number | null;
  paper: string;
  q_number: number | null;
  text: string;
  marks: number | null;
  word_limit: number | null;
  section: string | null;
  errors: string[];
  isDuplicate: boolean;
};

const HEADERS = ["year", "paper", "q_number", "text", "marks", "word_limit", "section"] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

const TEMPLATE = `year,paper,q_number,text,marks,word_limit,section
2023,Essay,1,"Thinking is like a game, it does not begin unless there is an opposite team",125,1000,Section A
2023,GS1,1,"Explain the role of geographical factors towards the development of Ancient India.",10,150,
`;

function PyqImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ expected: number; imported: number; failed: number; errors: string[] } | null>(null);

  async function handleFile(file: File) {
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("CSV is empty or has no data rows");
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      for (const h of HEADERS.slice(0, 6)) {
        if (!headers.includes(h)) throw new Error(`Missing required column: ${h}`);
      }

      const data: Omit<ParsedRow, "isDuplicate">[] = rows.slice(1).map((r, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
        const errors: string[] = [];
        const year = Number(obj.year);
        if (!Number.isInteger(year) || year < 1979 || year > 2100) errors.push("Invalid year");
        const paper = obj.paper;
        if (!ALLOWED_PAPERS.includes(paper as PaperCode)) errors.push(`Invalid paper (must be one of ${ALLOWED_PAPERS.join("/")})`);
        const q_number = Number(obj.q_number);
        if (!Number.isInteger(q_number) || q_number < 1) errors.push("Invalid question number");
        const text = obj.text;
        if (!text) errors.push("Missing question text");
        const marks = Number(obj.marks);
        if (!Number.isInteger(marks) || marks <= 0) errors.push("Invalid marks");
        const word_limit = Number(obj.word_limit);
        if (!Number.isInteger(word_limit) || word_limit <= 0) errors.push("Invalid word_limit");
        return {
          rowNum: i + 2,
          year: Number.isFinite(year) ? year : null,
          paper,
          q_number: Number.isFinite(q_number) ? q_number : null,
          text,
          marks: Number.isFinite(marks) ? marks : null,
          word_limit: Number.isFinite(word_limit) ? word_limit : null,
          section: obj.section || null,
          errors,
        };
      });

      // Duplicate detection (within-CSV + DB)
      const seen = new Set<string>();
      const intraDupKeys = new Set<string>();
      for (const r of data) {
        if (r.year && r.paper && r.q_number) {
          const k = `${r.year}::${r.paper}::${r.q_number}`;
          if (seen.has(k)) intraDupKeys.add(k);
          else seen.add(k);
        }
      }

      const [papersRes, questionsRes] = await Promise.all([
        supabase.from("papers").select("id, year, paper"),
        supabase.from("questions").select("paper_id, q_number"),
      ]);
      if (papersRes.error) throw new Error(papersRes.error.message);
      if (questionsRes.error) throw new Error(questionsRes.error.message);
      const paperByKey = new Map<string, string>();
      (papersRes.data ?? []).forEach((p) => paperByKey.set(`${p.year}::${p.paper}`, p.id));
      const dbKeys = new Set<string>();
      (questionsRes.data ?? []).forEach((q) => dbKeys.add(`${q.paper_id}::${q.q_number}`));

      const final: ParsedRow[] = data.map((r) => {
        const k = `${r.year}::${r.paper}::${r.q_number}`;
        let isDup = intraDupKeys.has(k);
        if (!isDup && r.year && r.paper && r.q_number) {
          const pid = paperByKey.get(`${r.year}::${r.paper}`);
          if (pid && dbKeys.has(`${pid}::${r.q_number}`)) isDup = true;
        }
        return { ...r, isDuplicate: isDup };
      });

      setParsed(final);
      toast.success(`Parsed ${final.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setParsed(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    const importable = parsed.filter((r) => r.errors.length === 0 && !r.isDuplicate);
    const expected = importable.length;
    let imported = 0;
    const errors: string[] = [];

    // Group by year+paper, ensure papers exist
    const paperKeys = new Set(importable.map((r) => `${r.year}::${r.paper}`));
    const papersRes = await supabase.from("papers").select("id, year, paper");
    if (papersRes.error) {
      toast.error(papersRes.error.message);
      setImporting(false);
      return;
    }
    const paperByKey = new Map<string, string>();
    (papersRes.data ?? []).forEach((p) => paperByKey.set(`${p.year}::${p.paper}`, p.id));

    for (const k of paperKeys) {
      if (paperByKey.has(k)) continue;
      const [yearStr, paper] = k.split("::");
      const year = Number(yearStr);
      const title = paper === "Essay" ? `Essay ${year}` : `General Studies ${paper.slice(2)} (${year})`;
      const ins = await supabase.from("papers").insert({ year, paper: paper as PaperCode, title }).select("id").single();
      if (ins.error || !ins.data) {
        errors.push(`Paper ${k}: ${ins.error?.message ?? "insert failed"}`);
        continue;
      }
      paperByKey.set(k, ins.data.id);
    }

    // Insert questions
    const payload = importable
      .map((r) => {
        const pid = paperByKey.get(`${r.year}::${r.paper}`);
        if (!pid) return null;
        return {
          paper_id: pid,
          q_number: r.q_number!,
          text: r.text,
          marks: r.marks!,
          word_limit: r.word_limit!,
          section: r.section,
        };
      })
      .filter(Boolean) as Array<{ paper_id: string; q_number: number; text: string; marks: number; word_limit: number; section: string | null }>;

    // chunked insert for clarity
    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error, data } = await supabase.from("questions").insert(chunk).select("id");
      if (error) {
        errors.push(`Chunk ${i}-${i + chunk.length}: ${error.message}`);
      } else {
        imported += data?.length ?? 0;
      }
    }

    const failed = expected - imported;
    setResult({ expected, imported, failed, errors });
    qc.invalidateQueries({ queryKey: ["admin", "questions"] });
    qc.invalidateQueries({ queryKey: ["paper-audit"] });
    setImporting(false);
    toast.success(`Imported ${imported}/${expected}`);
  }

  const validCount = parsed?.filter((r) => r.errors.length === 0 && !r.isDuplicate).length ?? 0;
  const dupCount = parsed?.filter((r) => r.isDuplicate).length ?? 0;
  const errCount = parsed?.filter((r) => r.errors.length > 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl">UPSC PYQ Import</h2>
          <p className="text-sm text-muted-foreground">Upload authentic year-wise UPSC CSE Mains question papers. No AI-generated content.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv(TEMPLATE, "upsc-pyq-template.csv")}>
            <Download className="h-4 w-4 mr-1" /> Download PYQ Template
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Upload PYQ CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 text-sm">
        <p className="font-medium mb-1">Required columns</p>
        <code className="text-xs">{HEADERS.join(", ")}</code>
        <p className="text-xs text-muted-foreground mt-2">
          paper must be one of: Essay, GS1, GS2, GS3, GS4. Papers are auto-created from year+paper if missing.
        </p>
      </div>

      {parsed && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total rows" value={parsed.length} />
            <Stat label="Will import" value={validCount} tone="ok" />
            <Stat label="Duplicates" value={dupCount} tone="warn" />
            <Stat label="With errors" value={errCount} tone="err" />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">File: {fileName}</p>
            <Button onClick={runImport} disabled={importing || validCount === 0}>
              {importing ? "Importing…" : `Confirm import (${validCount})`}
            </Button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead className="w-16">Year</TableHead>
                  <TableHead className="w-20">Paper</TableHead>
                  <TableHead className="w-12">Q#</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead className="w-16">Marks</TableHead>
                  <TableHead className="w-16">Words</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((r) => (
                  <TableRow key={r.rowNum} className={r.errors.length ? "bg-destructive/5" : r.isDuplicate ? "bg-amber-500/5" : ""}>
                    <TableCell>{r.rowNum}</TableCell>
                    <TableCell>{r.year ?? "—"}</TableCell>
                    <TableCell>{r.paper || "—"}</TableCell>
                    <TableCell>{r.q_number ?? "—"}</TableCell>
                    <TableCell className="max-w-md"><span className="line-clamp-2 text-xs">{r.text}</span></TableCell>
                    <TableCell>{r.marks ?? "—"}</TableCell>
                    <TableCell>{r.word_limit ?? "—"}</TableCell>
                    <TableCell>
                      {r.errors.length > 0 ? (
                        <span className="text-destructive text-xs">{r.errors.join("; ")}</span>
                      ) : r.isDuplicate ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-600/40">Duplicate</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-600/40">Will import</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-display text-lg mb-3">Import Report</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Expected" value={result.expected} />
            <Stat label="Imported" value={result.imported} tone="ok" />
            <Stat label="Failed" value={result.failed} tone={result.failed ? "err" : "ok"} />
          </div>
          {result.errors.length > 0 && (
            <div className="text-xs text-destructive space-y-1">
              {result.errors.map((er, i) => <div key={i}>{er}</div>)}
            </div>
          )}
        </div>
      )}

      {!parsed && <ExpectedReference />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-green-600" : tone === "warn" ? "text-amber-600" : tone === "err" ? "text-destructive" : "text-foreground";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : tone === "err" ? XCircle : null;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl mt-1 flex items-center gap-2 ${color}`}>
        {Icon && <Icon className="h-5 w-5" />} {value}
      </div>
    </div>
  );
}

function ExpectedReference() {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-sm font-medium mb-2">Expected questions per paper</p>
      <div className="grid grid-cols-5 gap-2 text-sm">
        {(Object.keys(EXPECTED) as PaperCode[]).map((p) => (
          <div key={p} className="rounded border border-border p-2 text-center">
            <div className="text-xs text-muted-foreground">{p}</div>
            <div className="font-display text-lg">{EXPECTED[p]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { EXPECTED };
