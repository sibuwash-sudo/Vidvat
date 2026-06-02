import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FileText, HelpCircle, Tag, Layers, BookMarked, Boxes } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [papers, questions, tags, themes, microthemes, toppers] = await Promise.all([
        supabase.from("papers").select("id", { count: "exact", head: true }),
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase.from("tags").select("id", { count: "exact", head: true }),
        supabase.from("themes").select("id", { count: "exact", head: true }),
        supabase.from("microthemes").select("id", { count: "exact", head: true }),
        supabase.from("topper_copies").select("id", { count: "exact", head: true }),
      ]);
      return {
        papers: papers.count ?? 0,
        questions: questions.count ?? 0,
        tags: tags.count ?? 0,
        themes: themes.count ?? 0,
        microthemes: microthemes.count ?? 0,
        toppers: toppers.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Papers", value: q.data?.papers, icon: FileText },
    { label: "Questions", value: q.data?.questions, icon: HelpCircle },
    { label: "Tags", value: q.data?.tags, icon: Tag },
    { label: "Themes", value: q.data?.themes, icon: Layers },
    { label: "Microthemes", value: q.data?.microthemes, icon: Boxes },
    { label: "Topper Copies", value: q.data?.toppers, icon: BookMarked },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="p-5">
          <s.icon className="h-5 w-5 text-primary mb-3" />
          <div className="text-3xl font-display">{s.value ?? "—"}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{s.label}</div>
        </Card>
      ))}
    </div>
  );
}
