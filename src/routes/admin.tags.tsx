import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Field, FormDialog } from "@/components/admin/papers-admin";
import { DialogFooter } from "@/components/ui/dialog";

type Tag = { id: string; name: string; slug: string; description: string | null };

export const Route = createFileRoute("/admin/tags")({
  component: TagsAdmin,
});

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function TagsAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);

  const tagsQ = useQuery({
    queryKey: ["admin", "tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data as Tag[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (t: Partial<Tag>) => {
      const payload = {
        name: t.name!,
        slug: t.slug || slugify(t.name!),
        description: t.description || null,
      };
      if (t.id) {
        const { error } = await supabase.from("tags").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tags").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Tag saved");
      qc.invalidateQueries({ queryKey: ["admin", "tags"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tag deleted");
      qc.invalidateQueries({ queryKey: ["admin", "tags"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-display text-2xl">Tags</h2>
        <Button onClick={() => setEditing({ name: "", slug: "", description: "" })}>
          <Plus className="h-4 w-4 mr-1" /> New tag
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tagsQ.data?.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-muted-foreground"><code>{t.slug}</code></TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{t.description || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon"
                    onClick={() => confirm("Delete this tag?") && del.mutate(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FormDialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit tag" : "New tag"}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <Input value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.slug || slugify(e.target.value) })} />
            </Field>
            <Field label="Slug">
              <Input value={editing.slug ?? ""}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
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
