import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { Field, FormDialog } from "@/components/admin/papers-admin";
import { DialogFooter } from "@/components/ui/dialog";
import { CsvImportButton, type CsvImportResult, downloadCsv } from "@/components/admin/csv-import";

type Subject = { id: string; name: string; display_order: number };
type Theme = {
  id: string;
  name: string;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4" | null;
  description: string | null;
  subject_id: string | null;
};

const PAPERS = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;

export const Route = createFileRoute("/admin/themes")({
  component: ThemesAdmin,
});

function ThemesAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Theme> | null>(null);
  const [filterSubject, setFilterSubject] = useState<string>("_all");

  const subjectsQ = useQuery({
    queryKey: ["admin", "subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name, display_order").order("display_order");
      if (error) throw error;
      return data as Subject[];
    },
  });

  const themesQ = useQuery({
    queryKey: ["admin", "themes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("themes").select("*").order("name");
      if (error) throw error;
      return data as Theme[];
    },
  });

  const subjectById = useMemo(() => {
    const m = new Map<string, Subject>();
    subjectsQ.data?.forEach((s) => m.set(s.id, s));
    return m;
  }, [subjectsQ.data]);

  const filteredThemes = useMemo(() => {
    if (!themesQ.data) return [];
    if (filterSubject === "_all") return themesQ.data;
    return themesQ.data.filter((t) => t.subject_id === filterSubject);
  }, [themesQ.data, filterSubject]);

  const upsert = useMutation({
    mutationFn: async (t: Partial<Theme>) => {
      const payload = {
        name: t.name!,
        paper: t.paper || null,
        description: t.description || null,
        subject_id: t.subject_id || null,
      };
      if (t.id) {
        const { error } = await supabase.from("themes").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("themes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("themes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Theme deleted");
      qc.invalidateQueries({ queryKey: ["admin", "themes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <h2 className="font-display text-2xl">Themes</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All subjects</SelectItem>
              {subjectsQ.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "name,paper,description\nIndian Society,GS1,Issues related to Indian society\nWomen,GS1,Issues related to women empowerment\n",
                "themes-template.csv"
              )
            }
          >
            <Download className="h-4 w-4 mr-1" /> Download Template
          </Button>
          <CsvImportButton
            label="Import Themes CSV"
            expectedHeaders={["name", "paper", "description"]}
            templateSample={"name,paper,description\nIndian Society,GS1,Sample theme\n"}
            onImport={async (rows) => {
              const result: CsvImportResult = { created: 0, skipped: 0, errors: [] };
              const { data: existing, error: exErr } = await supabase.from("themes").select("name, paper");
              if (exErr) throw new Error(exErr.message);
              const { data: subs } = await supabase.from("subjects").select("id, name");
              const subjectIdByName = new Map<string, string>();
              (subs ?? []).forEach((s) => subjectIdByName.set(s.name, s.id));
              const key = (n: string, p: string | null) => `${n.toLowerCase()}::${p ?? ""}`;
              const have = new Set((existing ?? []).map((t) => key(t.name, t.paper)));
              const validPapers = new Set(PAPERS as readonly string[]);
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const rowNum = i + 2;
                const name = r.name?.trim();
                const paperRaw = r.paper?.trim() || "";
                const paper = paperRaw === "" ? null : paperRaw;
                if (!name) { result.errors.push({ row: rowNum, message: "Missing name" }); continue; }
                if (paper && !validPapers.has(paper)) {
                  result.errors.push({ row: rowNum, message: `Invalid paper "${paper}"` }); continue;
                }
                const k = key(name, paper);
                if (have.has(k)) { result.skipped++; continue; }
                const { error } = await supabase.from("themes").insert({
                  name, paper: paper as Theme["paper"],
                  description: r.description?.trim() || null,
                  subject_id: paper ? subjectIdByName.get(paper) ?? null : null,
                });
                if (error) { result.errors.push({ row: rowNum, message: error.message }); continue; }
                have.add(k); result.created++;
              }
              qc.invalidateQueries({ queryKey: ["admin", "themes"] });
              qc.invalidateQueries({ queryKey: ["admin-overview"] });
              return result;
            }}
          />
          <Button onClick={() => setEditing({ name: "", paper: null, description: "", subject_id: null })}>
            <Plus className="h-4 w-4 mr-1" /> New theme
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredThemes.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{t.subject_id ? subjectById.get(t.subject_id)?.name ?? "—" : "—"}</TableCell>
                <TableCell>{t.paper || "—"}</TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{t.description || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon"
                    onClick={() => confirm("Delete this theme?") && del.mutate(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FormDialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit theme" : "New theme"}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <Input value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Subject">
              <Select value={editing.subject_id ?? "_none"}
                onValueChange={(v) => setEditing({ ...editing, subject_id: v === "_none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Select a subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {subjectsQ.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Paper (optional)">
              <Select value={editing.paper ?? "_none"}
                onValueChange={(v) => setEditing({ ...editing, paper: v === "_none" ? null : (v as Theme["paper"]) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any / unspecified</SelectItem>
                  {PAPERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => upsert.mutate(editing)} disabled={upsert.isPending}>Save</Button>
            </DialogFooter>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
