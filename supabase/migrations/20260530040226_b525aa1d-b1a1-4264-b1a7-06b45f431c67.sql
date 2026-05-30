
-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Admin write policies on papers + questions
CREATE POLICY "admins insert papers" ON public.papers
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update papers" ON public.papers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete papers" ON public.papers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.papers TO authenticated;

CREATE POLICY "admins insert questions" ON public.questions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update questions" ON public.questions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete questions" ON public.questions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.questions TO authenticated;

-- 3. Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tags TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags public read" ON public.tags FOR SELECT USING (true);
CREATE POLICY "admins manage tags" ON public.tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Themes
CREATE TABLE public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  paper public.gs_paper,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.themes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "themes public read" ON public.themes FOR SELECT USING (true);
CREATE POLICY "admins manage themes" ON public.themes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Topper Copies
CREATE TABLE public.topper_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topper_name TEXT NOT NULL,
  rank INTEGER,
  year INTEGER NOT NULL,
  paper public.gs_paper NOT NULL,
  subject TEXT,
  paper_id UUID REFERENCES public.papers(id) ON DELETE SET NULL,
  pdf_path TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.topper_copies TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.topper_copies TO authenticated;
GRANT ALL ON public.topper_copies TO service_role;
ALTER TABLE public.topper_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topper public read" ON public.topper_copies FOR SELECT USING (true);
CREATE POLICY "admins manage topper" ON public.topper_copies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Storage bucket for topper PDFs (public read)
INSERT INTO storage.buckets (id, name, public) VALUES ('topper-copies', 'topper-copies', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "topper pdfs public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'topper-copies');
CREATE POLICY "admins upload topper pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'topper-copies' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update topper pdfs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'topper-copies' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete topper pdfs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'topper-copies' AND public.has_role(auth.uid(), 'admin'));
