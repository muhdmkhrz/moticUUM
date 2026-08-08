-- MOTIC UUM — ADMIN OWNER AND HANDOVER UPDATE
-- Safe to run once or rerun on an existing MOTIC database.

begin;

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

comment on column public.admin_users.role is
  'Owner can invite, transfer ownership and remove admins; admin can manage website content.';

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

notify pgrst, 'reload schema';

commit;
