import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookMarked, Layers, Target } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vidvat — UPSC Mains Previous Year Questions" },
      { name: "description", content: "A scholarly archive of UPSC Mains previous year questions with progress tracking, bookmarks and themes." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="container mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-32">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.3em] text-primary mb-6">
              Civil Services · Mains · Archive
            </p>
            <h1 className="font-display text-5xl md:text-7xl leading-[1.05] mb-8">
              Every Mains question.
              <br />
              <span className="italic text-primary">Read closely.</span>
              <br />
              Practised deliberately.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mb-10 font-serif">
              Vidvat is a quiet study room for UPSC aspirants — a complete archive of
              previous year Mains questions across Essay and GS I–IV, with bookmarks,
              themes and a private record of what you've written.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="text-base">
                <Link to="/papers">
                  Browse papers <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <Link to="/login">Create an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-6">
          <div className="rule-gold" />
        </div>

        {/* Features */}
        <section className="container mx-auto px-6 py-24">
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: Layers,
                title: "Five papers, every year",
                body: "Essay and General Studies I through IV, organised paper-wise and theme-wise — the way examiners think.",
              },
              {
                icon: BookMarked,
                title: "Mark and return",
                body: "Bookmark questions worth revisiting. Build a private corpus of the prompts you find most difficult.",
              },
              {
                icon: Target,
                title: "Track what you've written",
                body: "Move each question through Reading → Practised → Written. Know exactly where you stand before the next mock.",
              },
            ].map((f) => (
              <div key={f.title}>
                <f.icon className="h-6 w-6 text-primary mb-4" />
                <h3 className="font-display text-2xl mb-3">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quote */}
        <section className="bg-foreground text-background py-24">
          <div className="container mx-auto px-6 max-w-3xl text-center">
            <p className="font-display text-3xl md:text-4xl italic leading-snug">
              “An hour with a previous year question, honestly attempted, is worth
              ten hours of passive reading.”
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.3em] text-accent">
              The Vidvat method
            </p>
          </div>
        </section>

        <footer className="container mx-auto px-6 py-10 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg">Vidvat<span className="text-primary">.</span></span>
            <span>© {new Date().getFullYear()} · For aspirants, by aspirants.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
