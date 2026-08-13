-- MOTIC UUM — CONTACT US CONTENT MANAGEMENT WITH PHONE NUMBERS
-- Safe to run again. Existing contact edits are preserved.

begin;

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

notify pgrst, 'reload schema';

commit;
