-- ============================================================
-- MOTIC UUM — COMPLETE SUPABASE SETUP
-- Updated: 2026-08-12
--
-- Safe to run again: existing news, posters, gallery items,
-- administrators and uploaded images are preserved.
--
-- Includes:
--   1. Admin allowlist
--   2. News management
--   3. Upcoming-poster management
--   4. Event, Activities, Researcher Spotlight and ICTOM
--   5. President profile and message
--   6. Committee/session management
--   7. Organizational chart management
--   8. Storage bucket and overwrite/delete policies
--   9. Row Level Security and Data API grants
--  10. Owner/admin roles and secure administrator handover
--  11. Contact Us photo, email and phone management
-- ============================================================

begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  invited_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.admin_users
  add column if not exists role text not null default 'admin';

alter table public.admin_users
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

alter table public.admin_users
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('owner', 'admin'));
  end if;
end;
$$;

-- When upgrading an existing installation, the earliest authorized
-- administrator becomes the initial Owner. Ownership can then be
-- transferred safely from the website's Admin Access screen.
update public.admin_users
set
  role = 'owner',
  updated_at = now()
where user_id = (
  select user_id
  from public.admin_users
  order by created_at asc, user_id asc
  limit 1
)
and not exists (
  select 1
  from public.admin_users
  where role = 'owner'
);

comment on table public.admin_users is
  'Allowlist of authenticated users permitted to manage MOTIC content.';

comment on column public.admin_users.role is
  'Owner can invite, transfer ownership and remove admins; admin can manage website content.';

-- These functions are callable only with the server-side service role.
-- Website JavaScript never receives that secret key.
create or replace function public.transfer_admin_ownership(
  requesting_user_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  lock table public.admin_users in share row exclusive mode;

  if requesting_user_id = target_user_id then
    raise exception 'Choose a different administrator.';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = requesting_user_id
      and role = 'owner'
  ) then
    raise exception 'Only the current Owner can transfer ownership.';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = target_user_id
  ) then
    raise exception 'The selected administrator no longer exists.';
  end if;

  update public.admin_users
  set
    role = case
      when user_id = target_user_id then 'owner'
      else 'admin'
    end,
    updated_at = now()
  where role = 'owner'
     or user_id = target_user_id;
end;
$$;

revoke all on function public.transfer_admin_ownership(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.transfer_admin_ownership(uuid, uuid)
  to service_role;

create or replace function public.reassign_admin_storage_ownership(
  previous_user_id uuid,
  replacement_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if previous_user_id = replacement_user_id then
    return 0;
  end if;

  if not exists (
    select 1
    from public.admin_users
    where user_id = replacement_user_id
      and role = 'owner'
  ) then
    raise exception 'Storage ownership can only be transferred to the current Owner.';
  end if;

  update storage.objects
  set owner_id = replacement_user_id::text
  where owner_id = previous_user_id::text;

  get diagnostics changed_rows = row_count;
  return changed_rows;
end;
$$;

revoke all on function public.reassign_admin_storage_ownership(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.reassign_admin_storage_ownership(uuid, uuid)
  to service_role;

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

comment on table public.news is
  'Published MOTIC news stories shown on the public website.';

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

comment on table public.posters is
  'Homepage announcement posters managed through the MOTIC admin portal.';

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

-- ============================================================
-- ABOUT US CONTENT — CURRENT SESSION SINGLETON RECORDS
-- These tables deliberately keep one row with id = 'current'.
-- Updating a term changes that row instead of adding duplicates.
-- ============================================================

create table if not exists public.president_profile (
  id text primary key default 'current'
    check (id = 'current'),
  president_name text not null
    check (char_length(president_name) between 2 and 180),
  session_label text not null
    check (char_length(session_label) between 3 and 40),
  message text not null
    check (char_length(message) between 20 and 5000),
  photo_url text,
  photo_path text,
  photo_alt text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.committee_settings (
  id text primary key default 'current'
    check (id = 'current'),
  session_label text not null
    check (char_length(session_label) between 3 and 40),
  members jsonb not null default '[]'::jsonb
    check (jsonb_typeof(members) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.organizational_chart (
  id text primary key default 'current'
    check (id = 'current'),
  title text not null
    check (char_length(title) between 3 and 180),
  session_label text not null
    check (char_length(session_label) between 3 and 40),
  image_url text not null,
  image_path text not null,
  image_alt text not null
    check (char_length(image_alt) between 5 and 240),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Each About Us table contains at most one row, so indexes on updated_by
-- provide no benefit. Remove older copies created by previous setup files.
drop index if exists public.president_profile_updated_by_idx;
drop index if exists public.committee_settings_updated_by_idx;
drop index if exists public.organizational_chart_updated_by_idx;

comment on table public.president_profile is
  'Current MOTIC President profile and message shown on the public About page.';
comment on table public.committee_settings is
  'Current MOTIC committee session and members stored as one editable document.';
comment on table public.organizational_chart is
  'Current MOTIC organizational chart shown on the public About page.';

alter table public.president_profile enable row level security;
alter table public.committee_settings enable row level security;
alter table public.organizational_chart enable row level security;

revoke all on table public.president_profile from anon, authenticated;
revoke all on table public.committee_settings from anon, authenticated;
revoke all on table public.organizational_chart from anon, authenticated;

grant select on table public.president_profile to anon, authenticated;
grant select on table public.committee_settings to anon, authenticated;
grant select on table public.organizational_chart to anon, authenticated;
grant insert, update, delete on table public.president_profile to authenticated;
grant insert, update, delete on table public.committee_settings to authenticated;
grant insert, update, delete on table public.organizational_chart to authenticated;

drop policy if exists "Public can read President profile" on public.president_profile;
create policy "Public can read President profile"
on public.president_profile for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert President profile" on public.president_profile;
create policy "Admins can insert President profile"
on public.president_profile for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update President profile" on public.president_profile;
create policy "Admins can update President profile"
on public.president_profile for update
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete President profile" on public.president_profile;
create policy "Admins can delete President profile"
on public.president_profile for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Public can read committee" on public.committee_settings;
create policy "Public can read committee"
on public.committee_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert committee" on public.committee_settings;
create policy "Admins can insert committee"
on public.committee_settings for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update committee" on public.committee_settings;
create policy "Admins can update committee"
on public.committee_settings for update
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete committee" on public.committee_settings;
create policy "Admins can delete committee"
on public.committee_settings for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Public can read organizational chart" on public.organizational_chart;
create policy "Public can read organizational chart"
on public.organizational_chart for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert organizational chart" on public.organizational_chart;
create policy "Admins can insert organizational chart"
on public.organizational_chart for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update organizational chart" on public.organizational_chart;
create policy "Admins can update organizational chart"
on public.organizational_chart for update
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete organizational chart" on public.organizational_chart;
create policy "Admins can delete organizational chart"
on public.organizational_chart for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

-- Storage upsert needs SELECT as well as INSERT and UPDATE.
drop policy if exists "Admins can read managed images" on storage.objects;
create policy "Admins can read managed images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'news-images'
  and exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

insert into public.president_profile (
  id,
  president_name,
  session_label,
  message,
  photo_url,
  photo_path,
  photo_alt
)
values (
  'current',
  'Peek Zhen Nan',
  '2025/2026',
  'Welcome to MOTIC. We bring students together to learn, lead and build meaningful connections through technology management. We look forward to a session filled with useful programmes, new friendships and opportunities for every member to contribute.',
  null,
  null,
  'Portrait of the MOTIC President'
)
on conflict (id) do nothing;

insert into public.committee_settings (
  id,
  session_label,
  members
)
values (
  'current',
  '2025/2026',
  '[{"id":"member-1","group":"Majlis Tertinggi","position":"President","name":"Peek Zhen Nan","email":"zhen.motic@gmail.com","order":1},{"id":"member-2","group":"Majlis Tertinggi","position":"Vice President","name":"Nur Adriana Amni Binti Mohd Asrol","email":"nadriana.motic@gmail.com","order":2},{"id":"member-3","group":"Majlis Tertinggi","position":"Secretary","name":"Nor Salihah Binti Mah Hassan","email":"salihah.motic@gmail.com","order":3},{"id":"member-4","group":"Majlis Tertinggi","position":"Vice Secretary","name":"Loo Pak Heng","email":"loo.motic@gmail.com","order":4},{"id":"member-5","group":"Majlis Tertinggi","position":"Treasurer","name":"Nur Farisha Alya Binti Zulkafli","email":"farisha.motic@gmail.com","order":5},{"id":"member-6","group":"Majlis Tertinggi","position":"Vice Treasurer","name":"Nur Laila Binti Ibrahim","email":"laila.motic@gmail.com","order":6},{"id":"member-7","group":"Multimedia","position":"Head of Exco","name":"Muhammad Sufi Bin Nor Hisham","email":"sufi.motic@gmail.com","order":1},{"id":"member-8","group":"Multimedia","position":"Vice Head of Exco","name":"Nur Aisyahtul Farisya Binti Abdul Malik","email":"aisyahtul.motic@gmail.com","order":2},{"id":"member-9","group":"Multimedia","position":"Committee Member","name":"Aidan Rafif Bin Asmadiwardi","email":"aidan.motic@gmail.com","order":3},{"id":"member-10","group":"Multimedia","position":"Committee Member","name":"Nurul Farzana Binti Zamri","email":"farzana.motic@gmail.com","order":4},{"id":"member-11","group":"Multimedia","position":"Committee Member","name":"Malina A/P Uthai","email":"malina.motic@gmail.com","order":5},{"id":"member-12","group":"Industry","position":"Head of Exco","name":"Cheong Yu Cen","email":"yucencc.motic@gmail.com","order":1},{"id":"member-13","group":"Industry","position":"Vice Head of Exco","name":"Risviin A/L Sugunthan","email":"risviin.motic@gmail.com","order":2},{"id":"member-14","group":"Industry","position":"Committee Member","name":"Dianasuttiryani Binti Darwis","email":"dyana.motic@gmail.com","order":3},{"id":"member-15","group":"Industry","position":"Committee Member","name":"Harees A/L Renganathan","email":"harees.motic@gmail.com","order":4},{"id":"member-16","group":"Training","position":"Head of Exco","name":"Nur Balqis Binti Mohamad Zuraimi","email":"balqis.motic@gmail.com","order":1},{"id":"member-17","group":"Training","position":"Vice Head of Exco","name":"Nurilma Dalila Binti Amerudin","email":"ilmaaa.motic@gmail.com","order":2},{"id":"member-18","group":"Training","position":"Committee Member","name":"Devarishi A/L Ilangoyan","email":"devarishi.motic@gmail.com","order":3},{"id":"member-19","group":"Spiritual","position":"Head of Exco","name":"Nur Nadjwa Iman Binti Mohamad Fadzli","email":"nadjwa.motic@gmail.com","order":1},{"id":"member-20","group":"Spiritual","position":"Vice Head of Exco","name":"Ahmad Aiman Afif Bin Ahmad Mazli","email":"aiman.motic@gmail.com","order":2},{"id":"member-21","group":"Spiritual","position":"Committee Member","name":"Nur Hidayu Mat Yatim","email":"hidayu.motic@gmail.com","order":3},{"id":"member-22","group":"CSR","position":"Head of Exco","name":"Nur Azwahida Binti Mohamad","email":"azwa.motic@gmail.com","order":1},{"id":"member-23","group":"CSR","position":"Vice Head of Exco","name":"Wan Nur Izzati Binti Ibrahim","email":"izzati.motic@gmail.com","order":2},{"id":"member-24","group":"CSR","position":"Committee Member","name":"Nur Fatihah Binti Azizan","email":"fatihah.motic@gmail.com","order":3},{"id":"member-25","group":"CSR","position":"Committee Member","name":"Nadia Irieqa Binti Mat Nasir","email":"nadia.motic@gmail.com","order":4},{"id":"member-26","group":"Network & Alumni","position":"Head of Exco","name":"Danesh Mirven A/L Pathmanathan","email":"dmirvenmotic@gmail.com","order":1},{"id":"member-27","group":"Network & Alumni","position":"Vice Head of Exco","name":"Evangelina Seeba A/P Balu","email":"seeba.motic@gmail.com","order":2},{"id":"member-28","group":"Network & Alumni","position":"Committee Member","name":"Tiviyanthini A/P Kannan","email":"tiviya.motic@gmail.com","order":3},{"id":"member-29","group":"Protocol","position":"Head of Exco","name":"Nurul Syazwani Natasha Yusri Azwan Binti Abdullah","email":"syazwanitasha.motic@gmail.com","order":1},{"id":"member-30","group":"Protocol","position":"Vice Head of Exco","name":"Nur Alieya Qistina Binti Sharol Azlan","email":"alieyamotic@gmail.com","order":2},{"id":"member-31","group":"Protocol","position":"Committee Member","name":"Nireshaa A/P Vijayan","email":"nireshaa.motic@gmail.com","order":3},{"id":"member-32","group":"Protocol","position":"Committee Member","name":"Diban Raj A/L Jayamohan","email":"diban.raj05motic@gmail.com","order":4},{"id":"member-33","group":"Protocol","position":"Committee Member","name":"Nur Fatihah Binti Azrun","email":"nurfatihah.motic@gmail.com","order":5},{"id":"member-34","group":"Special Duty & Academic","position":"Head of Exco","name":"Nuratirah Binti Sahidan","email":"atirah.motic@gmail.com","order":1},{"id":"member-35","group":"Special Duty & Academic","position":"Vice Head of Exco","name":"Nur-Asmida Binti Mohd Shariff","email":"asmieda.motic@gmail.com","order":2},{"id":"member-36","group":"Special Duty & Academic","position":"Committee Member","name":"Putri Nur Khaleeda Binti Khaireel","email":"khaleeda.motic@gmail.com","order":3},{"id":"member-37","group":"Special Duty & Academic","position":"Committee Member","name":"Ratthanaphorn A/P Prak Pan","email":"rath.motic@gmail.com","order":4},{"id":"member-38","group":"Entrepreneurship","position":"Head of Exco","name":"Fakhrul Imran Bin Abd Rahim","email":"fakhrul.motic@gmail.com","order":1},{"id":"member-39","group":"Entrepreneurship","position":"Vice Head of Exco","name":"Nik Alya Qistina Binti Nik Hassanuddin","email":"nikalya.motic@gmail.com","order":2},{"id":"member-40","group":"Entrepreneurship","position":"Committee Member","name":"Nur Aufa Natasha Binti Annuar Khuzaimi","email":"aufa.motic@gmail.com","order":3},{"id":"member-41","group":"Entrepreneurship","position":"Committee Member","name":"Charan Jeevanantham","email":"charan.motic1903@gmail.com","order":4},{"id":"member-42","group":"Logistics","position":"Head of Exco","name":"Amanina Aqilah Binti Khairil Anuar","email":"aqilah.motic@gmail.com","order":1},{"id":"member-43","group":"Logistics","position":"Vice Head of Exco","name":"Nurhanis Eliyia Binti Mohd Yusnor","email":"hanis.motic@gmail.com","order":2},{"id":"member-44","group":"Logistics","position":"Committee Member","name":"Nurhasya Afiqah Binti Md Jafri","email":"hasya.motic@gmail.com","order":3},{"id":"member-45","group":"Logistics","position":"Committee Member","name":"Karthik Raj A/L Rajakumar","email":"karthik.motic@gmail.com","order":4}]'::jsonb
)
on conflict (id) do nothing;

-- ============================================================
-- CONTACT US DIRECTORY
-- Four fixed public positions with photo, email and phone details.
-- ============================================================

create table if not exists public.contact_people (
  id text primary key,
  constraint contact_people_position_check
    check (
      id in (
        'advisor',
        'president',
        'vice_president'
      )
    ),
  role_label text not null
    check (char_length(role_label) between 2 and 80),
  kicker text not null
    check (char_length(kicker) between 2 and 100),
  display_name text not null
    check (char_length(display_name) between 2 and 180),
  email text
    check (
      email is null
      or (
        char_length(email) <= 254
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  phone text,
  photo_url text,
  photo_path text,
  photo_alt text not null
    check (char_length(photo_alt) between 5 and 240),
  display_order smallint not null,
  constraint contact_people_display_order_check
    check (display_order between 1 and 3),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.contact_people
  add column if not exists phone text;

delete from public.contact_people
where id = 'academic_leadership';

update public.contact_people
set display_order = case id
  when 'advisor' then 1
  when 'president' then 2
  when 'vice_president' then 3
  else display_order
end
where id in ('advisor', 'president', 'vice_president');

alter table public.contact_people
  drop constraint if exists contact_people_id_check,
  drop constraint if exists contact_people_position_check,
  drop constraint if exists contact_people_display_order_check;

alter table public.contact_people
  add constraint contact_people_position_check
    check (id in ('advisor', 'president', 'vice_president')),
  add constraint contact_people_display_order_check
    check (display_order between 1 and 3);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_people'::regclass
      and conname = 'contact_people_phone_format_check'
  ) then
    alter table public.contact_people
      add constraint contact_people_phone_format_check
      check (
        phone is null
        or (
          char_length(trim(phone)) between 7 and 30
          and phone ~ '^[0-9+() .-]+$'
        )
      );
  end if;
end
$$;

comment on table public.contact_people is
  'Fixed Contact Us directory managed through the MOTIC admin portal, including public email and phone links.';

create index if not exists contact_people_updated_by_idx
  on public.contact_people (updated_by)
  where updated_by is not null;

alter table public.contact_people enable row level security;

revoke all on table public.contact_people from anon, authenticated;
grant select on table public.contact_people to anon, authenticated;
grant insert, update on table public.contact_people to authenticated;

drop policy if exists "Public can read contact directory"
  on public.contact_people;
create policy "Public can read contact directory"
on public.contact_people
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert contact directory"
  on public.contact_people;
create policy "Admins can insert contact directory"
on public.contact_people
for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update contact directory"
  on public.contact_people;
create policy "Admins can update contact directory"
on public.contact_people
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
  updated_by = (select auth.uid())
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

insert into public.contact_people (
  id,
  role_label,
  kicker,
  display_name,
  email,
  phone,
  photo_url,
  photo_path,
  photo_alt,
  display_order
)
values
  (
    'advisor',
    'Advisor',
    'Club guidance',
    'MOTIC Advisor',
    null,
    null,
    null,
    null,
    'Portrait placeholder for the MOTIC Advisor',
    1
  ),
  (
    'president',
    'President',
    'Student leadership',
    'Peek Zhen Nan',
    'zhen.motic@gmail.com',
    null,
    null,
    null,
    'Portrait of MOTIC President Peek Zhen Nan',
    2
  ),
  (
    'vice_president',
    'Vice President',
    'Student leadership',
    'Nur Adriana Amni Binti Mohd Asrol',
    'nadriana.motic@gmail.com',
    null,
    null,
    null,
    'Portrait of MOTIC Vice President Nur Adriana Amni Binti Mohd Asrol',
    3
  )
on conflict (id) do nothing;

-- ============================================================
-- FIRST ADMIN SETUP
--
-- Create the account first in:
-- Supabase Dashboard -> Authentication -> Users -> Add user
--
-- Then uncomment ONE method below, replace its placeholder,
-- and run that statement in the SQL Editor.
-- ============================================================

-- Method A: authorize the first Owner by email (easiest)
-- insert into public.admin_users (user_id, role)
-- select id
--      , 'owner'
-- from auth.users
-- where lower(email) = lower('YOUR-ADMIN-EMAIL@example.com')
-- on conflict (user_id) do update
-- set role = 'owner', updated_at = now();

-- Method B: authorize the first Owner by Auth user UUID
-- insert into public.admin_users (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'owner')
-- on conflict (user_id) do update
-- set role = 'owner', updated_at = now();

notify pgrst, 'reload schema';

commit;
