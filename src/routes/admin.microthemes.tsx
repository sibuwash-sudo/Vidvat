import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus, Download, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FormDialog } from "@/components/admin/papers-admin";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CsvImportButton, type CsvImportResult, downloadCsv } from "@/components/admin/csv-import";
import { generateMicrothemesForAllThemes, previewMicrothemesForSelectedThemes, type ThemeReport, type PreviewReport } from "@/lib/generate-microthemes.functions";
import { Eye } from "lucide-react";

type Subject = { id: string; name: string; display_order: number };
type Theme = {
  id: string;
  name: string;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4" | null;
  subject_id: string | null;
};

type Microtheme = {
  id: string;
  theme_id: string;
  name: string;
  description: string | null;
};

export const Route = createFileRoute("/admin/microthemes")({
  component: MicrothemesAdmin,
});

function MicrothemesAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Microtheme> | null>(null);
  const [filterSubject, setFilterSubject] = useState<string>("_all");
  const [filterTheme, setFilterTheme] = useState<string>("_all");
  const [genReport, setGenReport] = useState<ThemeReport[] | null>(null);
  const [previewReport, setPreviewReport] = useState<PreviewReport[] | null>(null);
  const generateFn = useServerFn(generateMicrothemesForAllThemes);
  const previewFn = useServerFn(previewMicrothemesForSelectedThemes);

  const preview = useMutation({
    mutationFn: async () => previewFn(),
    onSuccess: (res) => {
      setPreviewReport(res.reports);
      const total = res.reports.reduce((a, r) => a + r.count, 0);
      toast.success(`Preview ready: ${total} new microthemes across ${res.reports.length} themes (no DB writes)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => generateFn(),
    onSuccess: (res) => {
      setGenReport(res.reports);
      const created = res.reports.reduce((a, r) => a + r.created, 0);
      const errors = res.reports.filter((r) => r.error).length;
      toast.success(`Generated ${created} microthemes across ${res.reports.length} themes • ${errors} errors`);
      qc.invalidateQueries({ queryKey: ["admin", "microthemes"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subjectsQ = useQuery({
    queryKey: ["admin", "subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name, display_order").order("display_order");
      if (error) throw error;
      return data as Subject[];
    },
  });

  const themesQ = useQuery({
    queryKey: ["admin", "themes", "for-microthemes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name, paper, subject_id")
        .order("paper")
        .order("name");
      if (error) throw error;
      return data as Theme[];
    },
  });

  const microsQ = useQuery({
    queryKey: ["admin", "microthemes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("microthemes")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Microtheme[];
    },
  });

  const themeById = useMemo(() => {
    const map = new Map<string, Theme>();
    themesQ.data?.forEach((t) => map.set(t.id, t));
    return map;
  }, [themesQ.data]);

  const themesForFilter = useMemo(() => {
    if (!themesQ.data) return [];
    if (filterSubject === "_all") return themesQ.data;
    return themesQ.data.filter((t) => t.subject_id === filterSubject);
  }, [themesQ.data, filterSubject]);

  const filtered = useMemo(() => {
    if (!microsQ.data) return [];
    let list = microsQ.data;
    if (filterSubject !== "_all") {
      const allowed = new Set(themesForFilter.map((t) => t.id));
      list = list.filter((m) => allowed.has(m.theme_id));
    }
    if (filterTheme !== "_all") list = list.filter((m) => m.theme_id === filterTheme);
    return list;
  }, [microsQ.data, filterTheme, filterSubject, themesForFilter]);

  const upsert = useMutation({
    mutationFn: async (m: Partial<Microtheme>) => {
      if (!m.name?.trim()) throw new Error("Name is required");
      if (!m.theme_id) throw new Error("Theme is required");
      const payload = {
        name: m.name.trim(),
        theme_id: m.theme_id,
        description: m.description || null,
      };
      if (m.id) {
        const { error } = await supabase.from("microthemes").update(payload).eq("id", m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("microthemes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Microtheme saved");
      qc.invalidateQueries({ queryKey: ["admin", "microthemes"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("microthemes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Microtheme deleted");
      qc.invalidateQueries({ queryKey: ["admin", "microthemes"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h2 className="font-display text-2xl">Microthemes</h2>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "theme_name,microtheme_name,description\nIndian Society,Women,Issues related to women empowerment\nIndian Society,Poverty,Issues related to poverty and hunger\n",
                "microthemes-template.csv"
              )
            }
          >
            <Download className="h-4 w-4 mr-1" /> Download Template
          </Button>
          <Select value={filterSubject} onValueChange={(v) => { setFilterSubject(v); setFilterTheme("_all"); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All subjects</SelectItem>
              {subjectsQ.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTheme} onValueChange={setFilterTheme}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Filter by theme" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All themes</SelectItem>
              {themesForFilter.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.paper ? `[${t.paper}] ` : ""}{t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CsvImportButton
            label="Import Microthemes CSV"
            expectedHeaders={["theme_name", "microtheme_name", "description"]}
            templateSample={"theme_name,microtheme_name,description\nIndian Society,Women,Issues related to women\n"}
            onImport={async (rows) => {
              const result: CsvImportResult = { created: 0, skipped: 0, errors: [] };
              const { data: themes, error: tErr } = await supabase.from("themes").select("id, name");
              if (tErr) throw new Error(tErr.message);
              const themeIdByName = new Map<string, string>();
              (themes ?? []).forEach((t) => themeIdByName.set(t.name.toLowerCase(), t.id));
              const { data: existing, error: mErr } = await supabase.from("microthemes").select("theme_id, name");
              if (mErr) throw new Error(mErr.message);
              const have = new Set((existing ?? []).map((m) => `${m.theme_id}::${m.name.toLowerCase()}`));
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const rowNum = i + 2;
                const tName = r.theme_name?.trim();
                const mName = r.microtheme_name?.trim();
                if (!tName || !mName) { result.errors.push({ row: rowNum, message: "Missing theme_name or microtheme_name" }); continue; }
                const themeId = themeIdByName.get(tName.toLowerCase());
                if (!themeId) { result.errors.push({ row: rowNum, message: `Theme not found: ${tName}` }); continue; }
                const k = `${themeId}::${mName.toLowerCase()}`;
                if (have.has(k)) { result.skipped++; continue; }
                const { error } = await supabase.from("microthemes").insert({
                  theme_id: themeId, name: mName, description: r.description?.trim() || null,
                });
                if (error) { result.errors.push({ row: rowNum, message: error.message }); continue; }
                have.add(k); result.created++;
              }
              qc.invalidateQueries({ queryKey: ["admin", "microthemes"] });
              qc.invalidateQueries({ queryKey: ["admin-overview"] });
              return result;
            }}
          />
          <Button
            variant="outline"
            onClick={() => preview.mutate()}
            disabled={preview.isPending}
          >
            {preview.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
            Preview Generated Microthemes
          </Button>
          <Button
            variant="secondary"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Generate UPSC Microthemes
          </Button>
          <Button
            onClick={() => setEditing({ name: "", theme_id: filterTheme !== "_all" ? filterTheme : "", description: "" })}
            disabled={!themesQ.data?.length}
          >
            <Plus className="h-4 w-4 mr-1" /> New microtheme
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Theme</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => {
              const t = themeById.get(m.theme_id);
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{t?.name ?? "—"}</TableCell>
                  <TableCell>{t?.paper ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">{m.description || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirm("Delete this microtheme?") && del.mutate(m.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No microthemes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <FormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit microtheme" : "New microtheme"}
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Theme">
              <Select
                value={editing.theme_id ?? ""}
                onValueChange={(v) => setEditing({ ...editing, theme_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select a theme" /></SelectTrigger>
                <SelectContent>
                  {themesQ.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.paper ? `[${t.paper}] ` : ""}{t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name">
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={3}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => upsert.mutate(editing)} disabled={upsert.isPending}>Save</Button>
            </DialogFooter>
          </div>
        )}
      </FormDialog>

      <Dialog open={!!genReport} onOpenChange={(o) => !o && setGenReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Microtheme Generation Report</DialogTitle>
          </DialogHeader>
          {genReport && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-4 text-xs">
                <span className="text-green-600">Created: {genReport.reduce((a, r) => a + r.created, 0)}</span>
                <span className="text-amber-600">Skipped (dupes): {genReport.reduce((a, r) => a + r.skipped, 0)}</span>
                <span className="text-destructive">Errors: {genReport.filter((r) => r.error).length}</span>
                <span className="text-muted-foreground">Themes: {genReport.length}</span>
              </div>
              <div className="max-h-96 overflow-auto border border-border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Theme</TableHead>
                      <TableHead>Paper</TableHead>
                      <TableHead className="text-right">Created</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {genReport.map((r) => (
                      <TableRow key={r.theme_id}>
                        <TableCell className="font-medium">{r.theme_name}</TableCell>
                        <TableCell>{r.paper ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.created}</TableCell>
                        <TableCell className="text-right">{r.total}</TableCell>
                        <TableCell className={r.error ? "text-destructive text-xs" : "text-green-600 text-xs"}>
                          {r.error ?? "OK"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGenReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewReport} onOpenChange={(o) => !o && setPreviewReport(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Preview — Generated Microthemes (Dry Run)</DialogTitle>
          </DialogHeader>
          {previewReport && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-4 text-xs flex-wrap">
                <span className="text-muted-foreground">Themes: {previewReport.length}</span>
                <span className="text-green-600">New to insert: {previewReport.reduce((a, r) => a + r.count, 0)}</span>
                <span className="text-amber-600">Already exist: {previewReport.reduce((a, r) => a + r.microthemes.filter((m) => m.duplicate).length, 0)}</span>
                <span className="text-destructive">Errors: {previewReport.filter((r) => r.error).length}</span>
                <span className="italic text-muted-foreground">No database changes made.</span>
              </div>
              <div className="max-h-[32rem] overflow-auto space-y-4">
                {previewReport.map((r) => (
                  <div key={r.theme_id} className="border border-border rounded-md p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">
                        {r.theme_name} <span className="text-muted-foreground text-xs">[{r.paper ?? "—"}]</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Count: {r.count}</div>
                    </div>
                    {r.error ? (
                      <div className="text-destructive text-xs">{r.error}</div>
                    ) : (
                      <div className="border border-border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-48">Microtheme</TableHead>
                              <TableHead>Syllabus Link</TableHead>
                              <TableHead className="text-right w-20">PYQ Count</TableHead>
                              <TableHead className="text-right w-24">Last Asked</TableHead>
                              <TableHead>Sample Questions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {r.microthemes.map((m, i) => (
                              <TableRow key={i} className={m.duplicate ? "opacity-60" : ""}>
                                <TableCell className="align-top">
                                  <div className="font-medium text-xs">
                                    {m.name}
                                    {m.duplicate ? <span className="ml-1 text-amber-600">(exists)</span> : null}
                                  </div>
                                  {m.description ? (
                                    <div className="text-[11px] text-muted-foreground mt-0.5">{m.description}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell className="align-top text-xs text-muted-foreground">
                                  {m.syllabus_link || "—"}
                                  {m.keywords?.length ? (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {m.keywords.map((k, j) => (
                                        <span key={j} className="text-[10px] bg-muted px-1 rounded">{k}</span>
                                      ))}
                                    </div>
                                  ) : null}
                                </TableCell>
                                <TableCell className="text-right align-top text-xs">{m.pyq_count}</TableCell>
                                <TableCell className="text-right align-top text-xs">{m.last_asked ?? "—"}</TableCell>
                                <TableCell className="align-top text-[11px]">
                                  {m.sample_questions.length === 0 ? (
                                    <span className="text-muted-foreground">No PYQ match</span>
                                  ) : (
                                    <ul className="space-y-1">
                                      {m.sample_questions.map((q, j) => (
                                        <li key={j}>
                                          <span className="text-muted-foreground">[{q.year}]</span> {q.text}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
