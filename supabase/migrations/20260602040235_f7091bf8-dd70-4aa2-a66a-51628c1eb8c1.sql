CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.microthemes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id uuid NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_microthemes_theme_id ON public.microthemes(theme_id);

GRANT SELECT ON public.microthemes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.microthemes TO authenticated;
GRANT ALL ON public.microthemes TO service_role;

ALTER TABLE public.microthemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "microthemes public read"
ON public.microthemes FOR SELECT
USING (true);

CREATE POLICY "admins manage microthemes"
ON public.microthemes FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_microthemes_updated_at
BEFORE UPDATE ON public.microthemes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();