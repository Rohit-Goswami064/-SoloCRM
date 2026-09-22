-- 1. Roles
do $$ begin
  create type public.app_role as enum ('ADMIN','CALLER');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'ADMIN')
$$;

create or replace function public.has_any_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'ADMIN')
$$;
revoke all on function public.has_any_admin() from public;
grant execute on function public.has_any_admin() to anon, authenticated;

drop policy if exists "roles readable" on public.user_roles;
create policy "roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin manages roles" on public.user_roles;
create policy "admin manages roles" on public.user_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. Lead assignment + profile fields
alter table public.leads add column if not exists assigned_to uuid references auth.users(id) on delete set null;
create index if not exists idx_leads_assigned_to on public.leads(assigned_to);
create index if not exists idx_follow_ups_lead on public.follow_ups(lead_id);
create index if not exists idx_activities_lead on public.lead_activities(lead_id);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists is_active boolean not null default true;

alter type public.lead_status add value if not exists 'FOLLOW_UP';
