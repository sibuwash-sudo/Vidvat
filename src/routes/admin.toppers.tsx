import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Field, FormDialog } from "@/components/admin/papers-admin";
import { DialogFooter } from "@/components/ui/dialog";

type Topper = {
  id: string;
  topper_name: string;
  rank: number | null;
  year: number;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4";
  subject: string | null;
  paper_id: string | null;
  pdf_path: string;
  notes: string | null;
};

const PAPERS = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;

export const Route = createFileRoute("/admin/toppers")({
  component: ToppersAdmin,
});

function publicUrl(path: string) {
  return supabase.storage.from("topper-copies").getPublicUrl(path).data.publicUrl;
}

function ToppersAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Partial<Topper> & { file?: File | null }) | null>(null);
  const [uploading, setUploading] = useState(false);

  const toppersQ = useQuery({
    queryKey: ["admin", "toppers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topper_copies")
        .select("*")
        .order("year", { ascending: false })
        .order("rank", { ascending: true });
      if (error) throw error;
      return data as Topper[];
    },
  });

  const papersQ = useQuery({
    queryKey: ["admin", "papers", "select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("papers").select("id, year, paper, title").order("year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (t: Partial<Topper> & { file?: File | null }) => {
      setUploading(true);
      try {
        let pdf_path = t.pdf_path || "";
        if (t.file) {
          const ext = t.file.name.split(".").pop() || "pdf";
          const filename = `${t.year}/${t.paper}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("topper-copies")
            .upload(filename, t.file, { contentType: t.file.type || "application/pdf" });
          if (upErr) throw upErr;
          pdf_path = filename;
        }
        if (!pdf_path) throw new Error("Please select a PDF file");

        const payload = {
          topper_name: t.topper_name!,
          rank: t.rank ? Number(t.rank) : null,
          year: Number(t.year),
          paper: t.paper!,
          subject: t.subject || null,
          paper_id: t.paper_id || null,
          pdf_path,
          notes: t.notes || null,
        };
        if (t.id) {
          const { error } = await supabase.from("topper_copies").update(payload).eq("id", t.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("topper_copies").insert(payload);
          if (error) throw error;
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      toast.success("Topper copy saved");
      qc.invalidateQueries({ queryKey: ["admin", "toppers"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (t: Topper) => {
      await supabase.storage.from("topper-copies").remove([t.pdf_path]);
      const { error } = await supabase.from("topper_copies").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Topper copy deleted");
      qc.invalidateQueries({ queryKey: ["admin", "toppers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-2xl">Topper Copies</h2>
        <Button
          onClick={() =>
            setEditing({ topper_name: "", year: new Date().getFullYear() - 1, paper: "GS1", rank: null })
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Upload copy
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topper</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>PDF</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {toppersQ.data?.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.topper_name}</TableCell>
                <TableCell>{t.rank ? `AIR ${t.rank}` : "—"}</TableCell>
                <TableCell>{t.year}</TableCell>
                <TableCell>{t.paper}</TableCell>
                <TableCell className="text-muted-foreground">{t.subject || "—"}</TableCell>
                <TableCell>
                  <a href={publicUrl(t.pdf_path)} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
                    <FileDown className="h-3.5 w-3.5" /> View
                  </a>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon"
                    onClick={() => confirm("Delete this topper copy and its PDF?") && del.mutate(t)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FormDialog open={!!editing} onClose={() => !uploading && setEditing(null)}
        title={editing?.id ? "Edit topper copy" : "Upload topper copy"}>
        {editing && (
          <div className="space-y-4">
            <Field label="Topper name">
              <Input value={editing.topper_name ?? ""}
                onChange={(e) => setEditing({ ...editing, topper_name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Rank (AIR)">
                <Input type="number" value={editing.rank ?? ""}
                  onChange={(e) => setEditing({ ...editing, rank: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Year">
                <Input type="number" value={editing.year ?? ""}
                  onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} />
              </Field>
              <Field label="Paper">
                <Select value={editing.paper}
                  onValueChange={(v) => setEditing({ ...editing, paper: v as Topper["paper"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Subject (optional)">
              <Input value={editing.subject ?? ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </Field>
            <Field label="Link to existing paper (optional)">
              <Select value={editing.paper_id ?? "_none"}
                onValueChange={(v) => setEditing({ ...editing, paper_id: v === "_none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {papersQ.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.year} — {p.paper} — {p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={editing.id ? "Replace PDF (optional)" : "PDF file"}>
              <Input type="file" accept="application/pdf"
                onChange={(e) => setEditing({ ...editing, file: e.target.files?.[0] ?? null })} />
              {editing.pdf_path && !editing.file && (
                <p className="text-xs text-muted-foreground mt-1">Current: {editing.pdf_path}</p>
              )}
            </Field>
            <Field label="Notes">
              <Textarea rows={3} value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={uploading}>Cancel</Button>
              <Button onClick={() => upsert.mutate(editing)} disabled={uploading || upsert.isPending}>
                {uploading ? "Uploading..." : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
