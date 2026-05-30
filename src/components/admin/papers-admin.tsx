import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type Paper = {
  id: string;
  year: number;
  paper: "Essay" | "GS1" | "GS2" | "GS3" | "GS4";
  title: string;
  total_marks: number;
};

const PAPER_TYPES = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;

export function PapersAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Paper> | null>(null);

  const papersQ = useQuery({
    queryKey: ["admin", "papers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .order("year", { ascending: false })
        .order("paper");
      if (error) throw error;
      return data as Paper[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: Partial<Paper>) => {
      const payload = {
        year: Number(p.year),
        paper: p.paper!,
        title: p.title!,
        total_marks: Number(p.total_marks) || 250,
      };
      if (p.id) {
        const { error } = await supabase.from("papers").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("papers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Paper saved");
      qc.invalidateQueries({ queryKey: ["admin", "papers"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("papers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Paper deleted");
      qc.invalidateQueries({ queryKey: ["admin", "papers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-2xl">Papers</h2>
        <Button onClick={() => setEditing({ year: new Date().getFullYear(), paper: "GS1", total_marks: 250, title: "" })}>
          <Plus className="h-4 w-4 mr-1" /> New paper
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead>Paper</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Marks</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {papersQ.data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.year}</TableCell>
                <TableCell>{p.paper}</TableCell>
                <TableCell className="max-w-md truncate">{p.title}</TableCell>
                <TableCell>{p.total_marks}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => confirm("Delete this paper and all its questions?") && del.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FormDialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit paper" : "New paper"}>
        {editing && (
          <div className="space-y-4">
            <Field label="Year">
              <Input
                type="number"
                value={editing.year ?? ""}
                onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })}
              />
            </Field>
            <Field label="Paper">
              <Select
                value={editing.paper}
                onValueChange={(v) => setEditing({ ...editing, paper: v as Paper["paper"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title">
              <Input
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field label="Total marks">
              <Input
                type="number"
                value={editing.total_marks ?? 250}
                onChange={(e) => setEditing({ ...editing, total_marks: Number(e.target.value) })}
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function FormDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export { Textarea };
