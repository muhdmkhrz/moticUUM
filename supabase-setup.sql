-- MOTIC UUM news administration schema
-- This file matches the schema already applied to the MOTIC UUM Admin project.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.news (
  id bigint generated always as identity primary key,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null
    check (char_length(title) between 3 and 220),
  published_date date not null default current_date,
  category text not null default 'Club News'
    check (char_length(category) between 2 and 80),
  image_url text,
  image_path text,
  image_alt text,
  excerpt text not null
    check (char_length(excerpt) between 10 and 600),
  content jsonb not null default '[]'::jsonb
    check (jsonb_typeof(content) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_published_date_idx
  on public.news (published_date desc, id desc);

create index if not exists news_created_by_idx
  on public.news (created_by)
  where created_by is not null;

alter table public.admin_users enable row level security;
alter table public.news enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.news from anon, authenticated;
revoke all on sequence public.news_id_seq from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.news to anon, authenticated;
grant insert, update, delete on table public.news to authenticated;
grant select on table public.admin_users to authenticated;
grant usage, select on sequence public.news_id_seq to authenticated;

drop policy if exists "Admins can verify their own membership" on public.admin_users;
create policy "Admins can verify their own membership"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Public can read news" on public.news;
create policy "Public can read news"
on public.news
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can create news" on public.news;
create policy "Admins can create news"
on public.news
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
  and created_by = (select auth.uid())
);

drop policy if exists "Admins can update news" on public.news;
create policy "Admins can update news"
on public.news
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete news" on public.news;
create policy "Admins can delete news"
on public.news
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'news-images',
  'news-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view news images" on storage.objects;

drop policy if exists "Admins can upload news images" on storage.objects;
create policy "Admins can upload news images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update news images" on storage.objects;
create policy "Admins can update news images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete news images" on storage.objects;
create policy "Admins can delete news images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

create table if not exists public.posters (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 3 and 180),
  image_url text not null,
  image_path text,
  image_alt text not null check (char_length(image_alt) between 5 and 240),
  link_url text,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posters_active_order_idx
  on public.posters (is_active, display_order, id desc);

create index if not exists posters_created_by_idx
  on public.posters (created_by)
  where created_by is not null;

alter table public.posters enable row level security;

revoke all on table public.posters from anon, authenticated;
revoke all on sequence public.posters_id_seq from anon, authenticated;

grant select on table public.posters to anon, authenticated;
grant insert, update, delete on table public.posters to authenticated;
grant usage, select on sequence public.posters_id_seq to authenticated;

drop policy if exists "Public can read active posters" on public.posters;
drop policy if exists "Admins can read all posters" on public.posters;
drop policy if exists "Anonymous visitors can read active posters" on public.posters;
create policy "Anonymous visitors can read active posters"
on public.posters
for select
to anon
using (is_active = true);

drop policy if exists "Authenticated users can read allowed posters" on public.posters;
create policy "Authenticated users can read allowed posters"
on public.posters
for select
to authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can create posters" on public.posters;
create policy "Admins can create posters"
on public.posters
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
  and created_by = (select auth.uid())
);

drop policy if exists "Admins can update posters" on public.posters;
create policy "Admins can update posters"
on public.posters
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete posters" on public.posters;
create policy "Admins can delete posters"
on public.posters
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

-- ============================================================
-- HOME PAGE GALLERY SECTIONS
-- Powers the four homepage columns: Event, Activities,
-- Researcher Spotlight and ICTOM. Each row belongs to one
-- "section" and behaves like a small, independent carousel.
-- A section with zero rows simply does not render on the site.
-- ============================================================

create table if not exists public.home_gallery (
  id bigint generated always as identity primary key,
  section text not null
    check (section in ('event', 'activities', 'researcher_spotlight', 'ictom')),
  title text not null
    check (char_length(title) between 3 and 180),
  image_url text not null,
  image_path text,
  image_alt text not null
    check (char_length(image_alt) between 5 and 240),
  caption text,
  link_url text,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists home_gallery_section_order_idx
  on public.home_gallery (section, is_active, display_order, id desc);

create index if not exists home_gallery_created_by_idx
  on public.home_gallery (created_by)
  where created_by is not null;

alter table public.home_gallery enable row level security;

revoke all on table public.home_gallery from anon, authenticated;
revoke all on sequence public.home_gallery_id_seq from anon, authenticated;

grant select on table public.home_gallery to anon, authenticated;
grant insert, update, delete on table public.home_gallery to authenticated;
grant usage, select on sequence public.home_gallery_id_seq to authenticated;

drop policy if exists "Anonymous visitors can read active gallery items" on public.home_gallery;
create policy "Anonymous visitors can read active gallery items"
on public.home_gallery
for select
to anon
using (is_active = true);

drop policy if exists "Authenticated users can read allowed gallery items" on public.home_gallery;
create policy "Authenticated users can read allowed gallery items"
on public.home_gallery
for select
to authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can create gallery items" on public.home_gallery;
create policy "Admins can create gallery items"
on public.home_gallery
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
  and created_by = (select auth.uid())
);

drop policy if exists "Admins can update gallery items" on public.home_gallery;
create policy "Admins can update gallery items"
on public.home_gallery
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete gallery items" on public.home_gallery;
create policy "Admins can delete gallery items"
on public.home_gallery
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

-- Create the Auth account in Supabase Dashboard first. Then authorize it by
-- replacing the placeholder below with that user's UUID and running the line.
-- insert into public.admin_users (user_id)
-- values ('00000000-0000-0000-0000-000000000000');

notify pgrst, 'reload schema';