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
import { CsvImportButton, type CsvImportResult } from "@/components/admin/csv-import";

type Theme = {
  id: string;
  name: string;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4" | null;
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
  const [filterTheme, setFilterTheme] = useState<string>("_all");

  const themesQ = useQuery({
    queryKey: ["admin", "themes", "for-microthemes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name, paper")
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

  const filtered = useMemo(() => {
    if (!microsQ.data) return [];
    if (filterTheme === "_all") return microsQ.data;
    return microsQ.data.filter((m) => m.theme_id === filterTheme);
  }, [microsQ.data, filterTheme]);

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
          <Select value={filterTheme} onValueChange={setFilterTheme}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Filter by theme" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All themes</SelectItem>
              {themesQ.data?.map((t) => (
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
    </div>
  );
}
