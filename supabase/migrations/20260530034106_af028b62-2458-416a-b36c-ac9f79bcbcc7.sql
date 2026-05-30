
-- Enums
create type public.attempt_status as enum ('to_attempt', 'reading', 'practiced', 'written');
create type public.gs_paper as enum ('Essay', 'GS1', 'GS2', 'GS3', 'GS4');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  target_year int,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

-- auto-create profile trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- papers
create table public.papers (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  paper public.gs_paper not null,
  title text not null,
  total_marks int not null default 250,
  unique (year, paper)
);
grant select on public.papers to anon, authenticated;
grant all on public.papers to service_role;
alter table public.papers enable row level security;
create policy "papers public read" on public.papers for select to anon, authenticated using (true);

-- questions
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  q_number int not null,
  section text,
  text text not null,
  marks int not null default 10,
  word_limit int not null default 150,
  theme text,
  unique (paper_id, q_number)
);
grant select on public.questions to anon, authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;
create policy "questions public read" on public.questions for select to anon, authenticated using (true);
create index questions_paper_idx on public.questions(paper_id);
create index questions_theme_idx on public.questions(theme);

-- bookmarks
create table public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
grant select, insert, delete on public.bookmarks to authenticated;
grant all on public.bookmarks to service_role;
alter table public.bookmarks enable row level security;
create policy "own bookmarks" on public.bookmarks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- progress
create table public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status public.attempt_status not null default 'to_attempt',
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
grant select, insert, update, delete on public.progress to authenticated;
grant all on public.progress to service_role;
alter table public.progress enable row level security;
create policy "own progress" on public.progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
