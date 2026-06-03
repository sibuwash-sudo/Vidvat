
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects public read" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "admins manage subjects" ON public.subjects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subjects (name, display_order) VALUES
  ('Essay', 1), ('GS1', 2), ('GS2', 3), ('GS3', 4), ('GS4', 5);

ALTER TABLE public.themes ADD COLUMN subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;
CREATE INDEX idx_themes_subject_id ON public.themes(subject_id);

UPDATE public.themes t SET subject_id = s.id
  FROM public.subjects s WHERE s.name = t.paper::text;
