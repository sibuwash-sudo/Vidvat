import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/papers/$paperId")({
  component: PaperDetail,
});

const paperLabel: Record<string, string> = {
  Essay: "Essay",
  GS1: "General Studies I",
  GS2: "General Studies II",
  GS3: "General Studies III",
  GS4: "General Studies IV — Ethics, Integrity & Aptitude",
};

const statusLabel: Record<string, string> = {
  to_attempt: "To attempt",
  reading: "Reading",
  practiced: "Practised",
  written: "Written",
};

function PaperDetail() {
  const { paperId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .eq("id", paperId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["questions", paperId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("paper_id", paperId)
        .order("q_number");
      if (error) throw error;
      return data;
    },
  });

  const userDataQ = useQuery({
    queryKey: ["user-paper-data", paperId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [bm, pr] = await Promise.all([
        supabase.from("bookmarks").select("question_id").eq("user_id", user!.id),
        supabase.from("progress").select("question_id, status").eq("user_id", user!.id),
      ]);
      return {
        bookmarks: new Set((bm.data ?? []).map((r) => r.question_id)),
        progress: new Map((pr.data ?? []).map((r) => [r.question_id, r.status])),
      };
    },
  });

  const toggleBookmark = async (qid: string, isOn: boolean) => {
    if (!user) {
      toast.error("Sign in to bookmark questions");
      return;
    }
    if (isOn) {
      await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("question_id", qid);
    } else {
      await supabase.from("bookmarks").insert({ user_id: user.id, question_id: qid });
    }
    qc.invalidateQueries({ queryKey: ["user-paper-data", paperId, user.id] });
  };

  const setStatus = async (qid: string, status: string) => {
    if (!user) {
      toast.error("Sign in to track progress");
      return;
    }
    await supabase
      .from("progress")
      .upsert({ user_id: user.id, question_id: qid, status: status as any, updated_at: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: ["user-paper-data", paperId, user.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", user.id] });
    toast.success(`Marked as ${statusLabel[status]}`);
  };

  const paper = paperQ.data;
  const questions = questionsQ.data ?? [];
  const ud = userDataQ.data;

  // Group by section if any
  const sections: Record<string, typeof questions> = {};
  questions.forEach((q: any) => {
    const k = q.section || "Questions";
    (sections[k] ||= []).push(q);
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-6 py-12 max-w-4xl">
        <Link to="/papers" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="h-4 w-4 mr-1" /> All papers
        </Link>

        {paperQ.isLoading || !paper ? (
          <Skeleton className="h-20 w-2/3 mb-12" />
        ) : (
          <header className="mb-12 pb-8 border-b border-border">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3">
              {paper.year} · Civil Services Mains
            </p>
            <h1 className="font-display text-5xl mb-4">{paperLabel[paper.paper]}</h1>
            <p className="text-sm text-muted-foreground">
              {paper.total_marks} marks · {questions.length} questions
            </p>
          </header>
        )}

        {questionsQ.isLoading && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        )}

        {Object.entries(sections).map(([section, qs]) => (
          <div key={section} className="mb-12">
            {section !== "Questions" && (
              <h2 className="font-display text-2xl text-primary mb-6 italic">{section}</h2>
            )}
            <ol className="space-y-8">
              {qs.map((q: any) => {
                const bookmarked = ud?.bookmarks.has(q.id) ?? false;
                const status = ud?.progress.get(q.id);
                return (
                  <li key={q.id} className="group">
                    <div className="flex items-baseline gap-4">
                      <span className="font-display text-3xl text-primary/60 tabular-nums">
                        {String(q.q_number).padStart(2, "0")}
                      </span>
                      <div className="flex-1">
                        <p className="prose-question text-foreground">{q.text}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="font-normal">
                            {q.marks} marks
                          </Badge>
                          <span>{q.word_limit} words</span>
                          {q.theme && (
                            <>
                              <span>·</span>
                              <span className="italic">{q.theme}</span>
                            </>
                          )}
                          {status && status !== "to_attempt" && (
                            <Badge className="bg-accent/30 text-accent-foreground border-accent/40 font-normal">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {statusLabel[status]}
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleBookmark(q.id, bookmarked)}
                            className="text-xs"
                          >
                            {bookmarked ? (
                              <><BookmarkCheck className="h-3.5 w-3.5 mr-1.5 text-primary" /> Bookmarked</>
                            ) : (
                              <><Bookmark className="h-3.5 w-3.5 mr-1.5" /> Bookmark</>
                            )}
                          </Button>
                          {(["reading", "practiced", "written"] as const).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={status === s ? "default" : "outline"}
                              onClick={() => setStatus(q.id, s)}
                              className="text-xs"
                            >
                              {statusLabel[s]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </main>
    </div>
  );
}
