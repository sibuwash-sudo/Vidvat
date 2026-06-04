import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { Field, FormDialog } from "@/components/admin/papers-admin";
import { DialogFooter } from "@/components/ui/dialog";
import { CsvImportButton, type CsvImportResult, downloadCsv } from "@/components/admin/csv-import";

type Question = {
  id: string;
  paper_id: string;
  q_number: number;
  text: string;
  marks: number;
  word_limit: number;
  theme: string | null;
  section: string | null;
};

export const Route = createFileRoute("/admin/questions")({
  component: QuestionsAdmin,
});

function QuestionsAdmin() {
  const qc = useQueryClient();
  const [paperId, setPaperId] = useState<string>("");
  const [editing, setEditing] = useState<Partial<Question> | null>(null);

  const papersQ = useQuery({
    queryKey: ["admin", "papers", "select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("papers")
        .select("id, year, paper, title")
        .order("year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["admin", "questions", paperId],
    enabled: !!paperId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("paper_id", paperId)
        .order("q_number");
      if (error) throw error;
      return data as Question[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (q: Partial<Question>) => {
      const payload = {
        paper_id: paperId,
        q_number: Number(q.q_number),
        text: q.text!,
        marks: Number(q.marks) || 10,
        word_limit: Number(q.word_limit) || 150,
        theme: q.theme || null,
        section: q.section || null,
      };
      if (q.id) {
        const { error } = await supabase.from("questions").update(payload).eq("id", q.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("questions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Question saved");
      qc.invalidateQueries({ queryKey: ["admin", "questions", paperId] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["admin", "questions", paperId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl">Questions</h2>
          <Select value={paperId} onValueChange={setPaperId}>
            <SelectTrigger className="w-80"><SelectValue placeholder="Select a paper..." /></SelectTrigger>
            <SelectContent>
              {papersQ.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.year} — {p.paper} — {p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "question_number,paper,theme_name,microtheme_name\n1,GS1,Indian Society,Women\n2,GS2,Constitution,Fundamental Rights\n",
                "question-mapping-template.csv"
              )
            }
          >
            <Download className="h-4 w-4 mr-1" /> Download Mapping Template
          </Button>
          <CsvImportButton
            label="Import Question Mapping CSV"
            expectedHeaders={["question_number", "paper", "theme_name", "microtheme_name"]}
            templateSample={"question_number,paper,theme_name,microtheme_name\n1,GS1,Indian Society,Women\n"}
            onImport={async (rows) => {
              const result: CsvImportResult = { created: 0, skipped: 0, errors: [] };

              const [papersRes, themesRes, microsRes] = await Promise.all([
                supabase.from("papers").select("id, paper"),
                supabase.from("themes").select("id, name"),
                supabase.from("microthemes").select("id, name, theme_id"),
              ]);
              if (papersRes.error) throw new Error(papersRes.error.message);
              if (themesRes.error) throw new Error(themesRes.error.message);
              if (microsRes.error) throw new Error(microsRes.error.message);

              const paperIdsByCode = new Map<string, string[]>();
              (papersRes.data ?? []).forEach((p) => {
                const k = String(p.paper).toLowerCase();
                const arr = paperIdsByCode.get(k) ?? [];
                arr.push(p.id);
                paperIdsByCode.set(k, arr);
              });
              const themeIdByName = new Map<string, string>();
              (themesRes.data ?? []).forEach((t) => themeIdByName.set(t.name.toLowerCase(), t.id));
              const microByThemeAndName = new Map<string, string>();
              (microsRes.data ?? []).forEach((m) =>
                microByThemeAndName.set(`${m.theme_id}::${m.name.toLowerCase()}`, m.id)
              );

              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const rowNum = i + 2;
                const qNum = Number(r.question_number);
                const paperCode = r.paper?.trim();
                const tName = r.theme_name?.trim();
                const mName = r.microtheme_name?.trim();

                if (!qNum || !paperCode || !tName || !mName) {
                  result.errors.push({ row: rowNum, message: "Missing required field" });
                  continue;
                }
                const paperIds = paperIdsByCode.get(paperCode.toLowerCase());
                if (!paperIds?.length) {
                  result.errors.push({ row: rowNum, message: `Paper not found: ${paperCode}` });
                  continue;
                }
                const themeId = themeIdByName.get(tName.toLowerCase());
                if (!themeId) {
                  result.errors.push({ row: rowNum, message: `Theme not found: ${tName}` });
                  continue;
                }
                const microId = microByThemeAndName.get(`${themeId}::${mName.toLowerCase()}`);
                if (!microId) {
                  result.errors.push({ row: rowNum, message: `Microtheme not found under theme: ${mName}` });
                  continue;
                }

                const { data: qs, error: qErr } = await supabase
                  .from("questions")
                  .select("id")
                  .eq("q_number", qNum)
                  .in("paper_id", paperIds);
                if (qErr) {
                  result.errors.push({ row: rowNum, message: qErr.message });
                  continue;
                }
                if (!qs || qs.length === 0) {
                  result.errors.push({ row: rowNum, message: `Question not found: Q${qNum} in ${paperCode}` });
                  continue;
                }
                const ids = qs.map((q) => q.id);
                const { error: uErr } = await supabase
                  .from("questions")
                  .update({ theme_id: themeId, microtheme_id: microId })
                  .in("id", ids);
                if (uErr) {
                  result.errors.push({ row: rowNum, message: uErr.message });
                  continue;
                }
                result.created += ids.length;
              }
              qc.invalidateQueries({ queryKey: ["admin", "questions"] });
              return result;
            }}
          />
          <Button
            disabled={!paperId}
            onClick={() =>
              setEditing({
                q_number: (questionsQ.data?.length ?? 0) + 1,
                text: "",
                marks: 10,
                word_limit: 150,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" /> New question
          </Button>
        </div>
      </div>

      {!paperId ? (
        <p className="text-sm text-muted-foreground">Pick a paper above to view its questions.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Question</TableHead>
                <TableHead className="w-20">Marks</TableHead>
                <TableHead className="w-24">Words</TableHead>
                <TableHead className="w-40">Theme</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questionsQ.data?.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>{q.q_number}</TableCell>
                  <TableCell className="max-w-xl"><span className="line-clamp-2">{q.text}</span></TableCell>
                  <TableCell>{q.marks}</TableCell>
                  <TableCell>{q.word_limit}</TableCell>
                  <TableCell className="text-muted-foreground">{q.theme || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(q)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirm("Delete this question?") && del.mutate(q.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FormDialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit question" : "New question"}>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Number">
                <Input type="number" value={editing.q_number ?? 1}
                  onChange={(e) => setEditing({ ...editing, q_number: Number(e.target.value) })} />
              </Field>
              <Field label="Marks">
                <Input type="number" value={editing.marks ?? 10}
                  onChange={(e) => setEditing({ ...editing, marks: Number(e.target.value) })} />
              </Field>
              <Field label="Word limit">
                <Input type="number" value={editing.word_limit ?? 150}
                  onChange={(e) => setEditing({ ...editing, word_limit: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Section">
              <Input value={editing.section ?? ""}
                onChange={(e) => setEditing({ ...editing, section: e.target.value })} />
            </Field>
            <Field label="Theme">
              <Input value={editing.theme ?? ""}
                onChange={(e) => setEditing({ ...editing, theme: e.target.value })} />
            </Field>
            <Field label="Question text">
              <Textarea rows={5} value={editing.text ?? ""}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
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
