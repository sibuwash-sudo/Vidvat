import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ThemeReport = {
  theme_id: string;
  theme_name: string;
  paper: string | null;
  created: number;
  skipped: number;
  total: number;
  error?: string;
};

const ALLOWED_PAPERS = ["Essay", "GS1", "GS2", "GS3", "GS4"] as const;

const PREVIEW_THEMES = [
  "Agriculture",
  "Governance",
  "International Relations",
  "Ethics",
  "Indian Society",
] as const;

export type PreviewReport = {
  theme_id: string;
  theme_name: string;
  paper: string | null;
  microthemes: { name: string; description: string; duplicate: boolean }[];
  count: number;
  error?: string;
};

async function callAI(themeName: string, paper: string | null): Promise<{ name: string; description: string }[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const targets: Record<string, string> = {
    GS1: "15-30",
    GS2: "15-30",
    GS3: "15-30",
    GS4: "20-40",
    Essay: "20-40",
  };
  const target = targets[paper ?? ""] ?? "15-30";

  const sys = `You are a senior UPSC Civil Services Mains mentor and PYQ (Previous Year Questions) trend analyst. You design GRANULAR, syllabus-anchored microthemes derived from how UPSC actually frames questions across the last 15+ years. You decompose broad themes into the specific, recurring sub-concepts that appear in question stems. Output only valid JSON.`;

  const user = `Generate ${target} HIGHLY GRANULAR, syllabus-oriented microthemes for the following UPSC theme, based on PYQ trend analysis.

Paper: ${paper ?? "General"}
Theme: ${themeName}

METHOD — PYQ-driven decomposition:
- Think about how UPSC has framed questions on this theme in Mains over the last 15+ years.
- Break the theme into the SPECIFIC sub-concepts, values, phenomena, actors, instruments, or dimensions that recur in question stems.
- Each microtheme must be a single, narrow, exam-answerable concept — NOT a chapter title or broad umbrella.

STRICT RULES:
- Microthemes must be SPECIFIC, NON-OVERLAPPING, and FREQUENTLY RECURRING in UPSC.
- AVOID broad/umbrella phrasings like "Human Values", "Globalization and Indian Society", "Poverty Alleviation Strategies", "Good Governance Concept", "Role of X", "Issues in Y".
- Decompose broad themes into atomic sub-points. Examples:
  * "Human Values" -> Integrity, Objectivity, Compassion, Empathy, Dedication to Public Service, Tolerance, Courage of Conviction
  * "Globalization and Indian Society" -> Cultural Homogenization, Consumerism, Family Transformation, Digital Social Change, Migration Effects, Youth Identity Crisis
- Names: 2-6 words, concrete noun phrases. No "and", no slashes, no umbrella connectors.
- Descriptions: 1-2 sentences explaining the exam angle / typical PYQ framing.

Return ONLY a JSON object in this exact shape:
{
  "microthemes": [
    { "name": "string", "description": "string" }
  ]
}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("Rate limited by AI gateway. Try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits to your Lovable workspace.");
    throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const json = await resp.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { microthemes: [] };
  }
  const items = Array.isArray(parsed?.microthemes) ? parsed.microthemes : [];
  return items
    .map((m: any) => ({
      name: String(m?.name ?? "").trim(),
      description: String(m?.description ?? "").trim(),
    }))
    .filter((m: any) => m.name.length > 0);
}

export const generateMicrothemesForAllThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Admin-only
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Admin access required");

    const { data: themes, error: tErr } = await supabase
      .from("themes")
      .select("id, name, paper")
      .in("paper", [...ALLOWED_PAPERS]);
    if (tErr) throw new Error(tErr.message);

    const reports: ThemeReport[] = [];

    for (const t of themes ?? []) {
      const r: ThemeReport = {
        theme_id: t.id,
        theme_name: t.name,
        paper: t.paper,
        created: 0,
        skipped: 0,
        total: 0,
      };
      try {
        const { data: existing, error: eErr } = await supabase
          .from("microthemes")
          .select("name")
          .eq("theme_id", t.id);
        if (eErr) throw new Error(eErr.message);
        const have = new Set((existing ?? []).map((m) => m.name.toLowerCase()));

        const generated = await callAI(t.name, t.paper);

        const seenInBatch = new Set<string>();
        const toInsert: { theme_id: string; name: string; description: string | null }[] = [];
        for (const m of generated) {
          const key = m.name.toLowerCase();
          if (have.has(key) || seenInBatch.has(key)) {
            r.skipped++;
            continue;
          }
          seenInBatch.add(key);
          toInsert.push({
            theme_id: t.id,
            name: m.name,
            description: m.description || null,
          });
        }

        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from("microthemes").insert(toInsert);
          if (insErr) throw new Error(insErr.message);
          r.created = toInsert.length;
        }

        const { count } = await supabase
          .from("microthemes")
          .select("id", { count: "exact", head: true })
          .eq("theme_id", t.id);
        r.total = count ?? 0;
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
      }
      reports.push(r);
    }

    return { reports };
  });

export const previewMicrothemesForSelectedThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Admin access required");

    const { data: themes, error: tErr } = await supabase
      .from("themes")
      .select("id, name, paper")
      .in("name", [...PREVIEW_THEMES]);
    if (tErr) throw new Error(tErr.message);

    const reports: PreviewReport[] = [];

    for (const t of themes ?? []) {
      const r: PreviewReport = {
        theme_id: t.id,
        theme_name: t.name,
        paper: t.paper,
        microthemes: [],
        count: 0,
      };
      try {
        const { data: existing, error: eErr } = await supabase
          .from("microthemes")
          .select("name")
          .eq("theme_id", t.id);
        if (eErr) throw new Error(eErr.message);
        const have = new Set((existing ?? []).map((m) => m.name.toLowerCase()));

        const generated = await callAI(t.name, t.paper);
        const seen = new Set<string>();
        for (const m of generated) {
          const key = m.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          r.microthemes.push({
            name: m.name,
            description: m.description,
            duplicate: have.has(key),
          });
        }
        r.count = r.microthemes.filter((m) => !m.duplicate).length;
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
      }
      reports.push(r);
    }

    return { reports };
  });

