
-- Stage + qualification enums
create type public.lead_stage as enum ('INCOMING','MAIN','NOT_INTERESTED','INVALID');
create type public.qualification_status as enum ('UNQUALIFIED','CALLING','QUALIFIED','NOT_INTERESTED','INVALID','NO_RESPONSE');

alter table public.leads
  add column stage public.lead_stage not null default 'INCOMING',
  add column qualification_status public.qualification_status not null default 'UNQUALIFIED',
  add column qualification_notes text,
  add column qualification_date timestamptz,
  add column qualified_by uuid references auth.users(id) on delete set null,
  add column disposition_reason text,
  add column requirement text,
  add column expected_timeline text,
  add column import_id uuid references public.imports(id) on delete set null,
  add column import_row_number integer,
  add column custom_fields jsonb not null default '{}'::jsonb;

-- Everything that already exists is an established (main) lead
update public.leads set stage = 'MAIN';

create index if not exists idx_leads_stage on public.leads(stage);
create index if not exists idx_leads_qualification_status on public.leads(qualification_status);
create index if not exists idx_leads_import_id on public.leads(import_id);

alter table public.imports
  add column category_id uuid references public.lead_categories(id) on delete set null,
  add column assigned_to uuid references auth.users(id) on delete set null;

-- Reusable definitions for extra Excel columns
create table public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.custom_field_defs to authenticated;
grant all on public.custom_field_defs to service_role;

alter table public.custom_field_defs enable row level security;

create policy "read custom fields" on public.custom_field_defs
  for select to authenticated using (true);
create policy "admin manages custom fields" on public.custom_field_defs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger custom_field_defs_updated_at
  before update on public.custom_field_defs
  for each row execute function public.set_updated_at();

-- New accounts get LinkedIn and Upwork as default sources too
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s text; c text; first_admin boolean;
begin
  select not exists (select 1 from public.user_roles where role = 'ADMIN') into first_admin;
  insert into public.profiles (id, full_name, email)
    values (new.id, new.raw_user_meta_data->>'full_name', new.email)
    on conflict (id) do nothing;
  insert into public.settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
    values (new.id, case when first_admin then 'ADMIN'::public.app_role else 'CALLER'::public.app_role end)
    on conflict do nothing;
  if first_admin then
    foreach s in array array['Google Maps','Google Ads','Meta Ads','Instagram','Justdial','Website','Referral','Cold Call','LinkedIn','WhatsApp','Upwork','Other'] loop
      insert into public.lead_sources (user_id, name) values (new.id, s) on conflict do nothing;
    end loop;
    foreach c in array array['Real Estate','Clinic','School','Coaching','Restaurant','Manufacturing','E-commerce','Agency','Local Business','Other'] loop
      insert into public.lead_categories (user_id, name) values (new.id, c) on conflict do nothing;
    end loop;
  end if;
  return new;
end $function$;
