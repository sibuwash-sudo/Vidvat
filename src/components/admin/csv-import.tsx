import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export type CsvImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

type Props = {
  label?: string;
  expectedHeaders: string[];
  templateSample: string;
  onImport: (rows: Record<string, string>[]) => Promise<CsvImportResult>;
  onDone?: () => void;
};

/** Minimal RFC4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
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

export function CsvImportButton({ label = "Import CSV", expectedHeaders, templateSample, onImport, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("CSV is empty or has no data rows");
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      for (const h of expectedHeaders) {
        if (!headers.includes(h)) throw new Error(`Missing column: ${h}`);
      }
      const data = rows.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
        return obj;
      });
      const res = await onImport(data);
      setResult(res);
      toast.success(`Imported ${res.created} • Skipped ${res.skipped} • Errors ${res.errors.length}`);
      onDone?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setResult({ created: 0, skipped: 0, errors: [{ row: 0, message: msg }] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const blob = new Blob([templateSample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              Expected columns: <code className="text-xs bg-muted px-1 py-0.5 rounded">{expectedHeaders.join(", ")}</code>
            </div>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download template</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
            />
            {busy && <div className="text-muted-foreground">Importing…</div>}
            {result && (
              <div className="border border-border rounded-md p-3 space-y-2">
                <div className="flex gap-4">
                  <span className="text-green-600">Created: {result.created}</span>
                  <span className="text-amber-600">Skipped: {result.skipped}</span>
                  <span className="text-destructive">Errors: {result.errors.length}</span>
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-48 overflow-auto text-xs">
                    {result.errors.map((er, i) => (
                      <div key={i} className="text-destructive">Row {er.row}: {er.message}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
