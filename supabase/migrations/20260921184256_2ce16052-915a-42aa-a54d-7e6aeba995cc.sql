
-- ===== helpers =====
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(right(regexp_replace(coalesce(p,''), '[^0-9]', '', 'g'), 10), '')
$$;

-- ===== enums =====
create type public.lead_status as enum ('NEW','CONTACTED','INTERESTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST','NOT_INTERESTED','FOLLOW_UP_LATER');
create type public.lead_temp as enum ('HOT','WARM','COLD');
create type public.activity_type as enum ('CALL','WHATSAPP','EMAIL','MEETING','NOTE','FOLLOW_UP','PROPOSAL','STATUS_CHANGE','PAYMENT','TASK','FILE');
create type public.followup_type as enum ('CALL','WHATSAPP','EMAIL','MEETING','OTHER');
create type public.followup_status as enum ('PENDING','COMPLETED','SKIPPED','RESCHEDULED');
create type public.task_priority as enum ('LOW','MEDIUM','HIGH','URGENT');
create type public.task_status as enum ('TODO','IN_PROGRESS','COMPLETED','CANCELLED');
create type public.project_status as enum ('PLANNING','IN_PROGRESS','REVIEW','COMPLETED','ON_HOLD','CANCELLED');
create type public.payment_status as enum ('PENDING','PARTIAL','PAID','REFUNDED');

-- ===== profiles =====
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  company text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ===== settings =====
create table public.settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "own settings" on public.settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== sources / categories =====
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create table public.lead_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
grant select, insert, update, delete on public.lead_sources to authenticated;
grant select, insert, update, delete on public.lead_categories to authenticated;
grant all on public.lead_sources to service_role;
grant all on public.lead_categories to service_role;
alter table public.lead_sources enable row level security;
alter table public.lead_categories enable row level security;
create policy "own sources" on public.lead_sources for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own categories" on public.lead_categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== customers =====
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  company text,
  phone text,
  phone_normalized text,
  whatsapp text,
  email text,
  website text,
  address text,
  city text,
  state text,
  country text,
  industry text,
  source_id uuid references public.lead_sources on delete set null,
  category_id uuid references public.lead_categories on delete set null,
  lifecycle text not null default 'CUSTOMER',
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "own customers" on public.customers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== leads =====
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  company text,
  contact_person text,
  phone text,
  phone_normalized text,
  whatsapp text,
  email text,
  website text,
  address text,
  city text,
  state text,
  country text,
  company_size text,
  source_id uuid references public.lead_sources on delete set null,
  category_id uuid references public.lead_categories on delete set null,
  status public.lead_status not null default 'NEW',
  temperature public.lead_temp not null default 'WARM',
  estimated_budget numeric(14,2),
  deal_value numeric(14,2) not null default 0,
  service_interested text,
  notes text,
  lost_reason text,
  proposal_status text,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up timestamptz,
  expected_close_date date,
  converted_customer_id uuid references public.customers on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "own leads" on public.leads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index leads_user_idx on public.leads(user_id);
create index leads_phone_idx on public.leads(phone_normalized);
create index leads_email_idx on public.leads(lower(email));
create index leads_company_idx on public.leads(lower(company));
create index leads_status_idx on public.leads(status);
create index leads_source_idx on public.leads(source_id);
create index leads_category_idx on public.leads(category_id);
create index leads_next_fu_idx on public.leads(next_follow_up);
create index leads_created_idx on public.leads(created_at desc);

create or replace function public.leads_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone_normalized = public.normalize_phone(new.phone);
  new.updated_at = now();
  return new;
end $$;
create trigger leads_norm before insert or update on public.leads for each row execute function public.leads_normalize();

create or replace function public.customers_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone_normalized = public.normalize_phone(new.phone);
  new.updated_at = now();
  return new;
end $$;
create trigger customers_norm before insert or update on public.customers for each row execute function public.customers_normalize();

-- ===== projects =====
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  customer_id uuid references public.customers on delete set null,
  name text not null,
  service text,
  description text,
  start_date date,
  deadline date,
  status public.project_status not null default 'PLANNING',
  priority public.task_priority not null default 'MEDIUM',
  project_value numeric(14,2) not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "own projects" on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== payments =====
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  customer_id uuid references public.customers on delete set null,
  project_id uuid references public.projects on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  payment_date date not null default current_date,
  method text,
  reference text,
  notes text,
  status public.payment_status not null default 'PAID',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "own payments" on public.payments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index payments_project_idx on public.payments(project_id);

-- ===== tasks =====
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  lead_id uuid references public.leads on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  project_id uuid references public.projects on delete cascade,
  due_date timestamptz,
  priority public.task_priority not null default 'MEDIUM',
  status public.task_status not null default 'TODO',
  category text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "own tasks" on public.tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index tasks_due_idx on public.tasks(due_date);

-- ===== follow_ups =====
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lead_id uuid references public.leads on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  due_at timestamptz not null,
  type public.followup_type not null default 'CALL',
  notes text,
  status public.followup_status not null default 'PENDING',
  completed_at timestamptz,
  outcome text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.follow_ups to authenticated;
grant all on public.follow_ups to service_role;
alter table public.follow_ups enable row level security;
create policy "own follow_ups" on public.follow_ups for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index follow_ups_due_idx on public.follow_ups(due_at);

-- ===== activities =====
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lead_id uuid references public.leads on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  project_id uuid references public.projects on delete cascade,
  type public.activity_type not null,
  title text not null,
  body text,
  outcome text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;
alter table public.lead_activities enable row level security;
create policy "own activities" on public.lead_activities for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index activities_lead_idx on public.lead_activities(lead_id, occurred_at desc);

-- ===== notes =====
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lead_id uuid references public.leads on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  project_id uuid references public.projects on delete cascade,
  body text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "own notes" on public.notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== files =====
create table public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lead_id uuid references public.leads on delete cascade,
  customer_id uuid references public.customers on delete cascade,
  project_id uuid references public.projects on delete cascade,
  path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  doc_type text default 'OTHER',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.files to authenticated;
grant all on public.files to service_role;
alter table public.files enable row level security;
create policy "own files" on public.files for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== imports =====
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  file_name text not null,
  source_id uuid references public.lead_sources on delete set null,
  total_rows int not null default 0,
  imported_rows int not null default 0,
  updated_rows int not null default 0,
  skipped_rows int not null default 0,
  failed_rows int not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  import_id uuid not null references public.imports on delete cascade,
  row_number int,
  status text not null,
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.imports to authenticated;
grant select, insert, update, delete on public.import_rows to authenticated;
grant all on public.imports to service_role;
grant all on public.import_rows to service_role;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;
create policy "own imports" on public.imports for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own import_rows" on public.import_rows for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== notifications =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  body text,
  kind text not null default 'INFO',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== audit log =====
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  action text not null,
  entity text not null,
  entity_id uuid,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "own audit read" on public.audit_logs for select to authenticated using (user_id = auth.uid());
create policy "own audit insert" on public.audit_logs for insert to authenticated with check (user_id = auth.uid());

-- ===== updated_at triggers =====
create trigger t1 before update on public.profiles for each row execute function public.set_updated_at();
create trigger t2 before update on public.settings for each row execute function public.set_updated_at();
create trigger t3 before update on public.lead_sources for each row execute function public.set_updated_at();
create trigger t4 before update on public.lead_categories for each row execute function public.set_updated_at();
create trigger t5 before update on public.projects for each row execute function public.set_updated_at();
create trigger t6 before update on public.payments for each row execute function public.set_updated_at();
create trigger t7 before update on public.tasks for each row execute function public.set_updated_at();
create trigger t8 before update on public.follow_ups for each row execute function public.set_updated_at();
create trigger t9 before update on public.notes for each row execute function public.set_updated_at();

-- ===== new user bootstrap =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text; c text;
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
  insert into public.settings (user_id) values (new.id) on conflict (user_id) do nothing;
  foreach s in array array['Google Maps','Google Ads','Meta Ads','Instagram','Justdial','Website','Referral','Upwork','Cold Call','WhatsApp','LinkedIn','Other'] loop
    insert into public.lead_sources (user_id, name) values (new.id, s) on conflict do nothing;
  end loop;
  foreach c in array array['Real Estate','Healthcare','Clinic','Education','School','Coaching','Manufacturing','Restaurant','Hotel','E-commerce','Finance','Professional Services','Agency','Construction','Local Business','Other'] loop
    insert into public.lead_categories (user_id, name) values (new.id, c) on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== demo data =====
create or replace function public.seed_demo_data()
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); i int; cust uuid; proj uuid; ld uuid; src uuid; cat uuid;
begin
  if u is null then raise exception 'not authenticated'; end if;
  perform public.delete_demo_data();
  for i in 1..10 loop
    select id into src from public.lead_sources where user_id=u order by random() limit 1;
    select id into cat from public.lead_categories where user_id=u order by random() limit 1;
    insert into public.leads (user_id,name,company,phone,whatsapp,email,city,source_id,category_id,status,temperature,deal_value,is_demo,next_follow_up,service_interested)
    values (u,'Demo Lead '||i,'Demo Company '||i,'98765'||lpad(i::text,5,'0'),'98765'||lpad(i::text,5,'0'),'demo'||i||'@example.com','Mumbai',src,cat,
      (array['NEW','CONTACTED','INTERESTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST','FOLLOW_UP_LATER','NEW'])[i]::public.lead_status,
      (array['HOT','WARM','COLD'])[1+(i%3)]::public.lead_temp, (i*15000)::numeric, true, now() + ((i-4) || ' days')::interval, 'Website Development')
    returning id into ld;
    insert into public.lead_activities (user_id,lead_id,type,title,body,is_demo) values (u,ld,'NOTE','Demo lead created','Sample activity for testing.',true);
    if i <= 5 then
      insert into public.follow_ups (user_id,lead_id,due_at,type,notes,status,is_demo)
      values (u,ld, now() + ((i-3) || ' days')::interval, 'CALL','Demo follow-up '||i, 'PENDING', true);
    end if;
  end loop;
  for i in 1..3 loop
    insert into public.customers (user_id,name,company,phone,email,city,industry,is_demo)
    values (u,'Demo Customer '||i,'Client Co '||i,'99887'||lpad(i::text,5,'0'),'client'||i||'@example.com','Delhi','Agency',true)
    returning id into cust;
    if i <= 2 then
      insert into public.projects (user_id,customer_id,name,service,status,project_value,start_date,deadline,is_demo)
      values (u,cust,'Demo Project '||i,'Website','IN_PROGRESS',(i*120000)::numeric,current_date - 10, current_date + 20,true)
      returning id into proj;
      insert into public.payments (user_id,customer_id,project_id,amount,status,method,is_demo)
      values (u,cust,proj,(i*40000)::numeric,'PAID','UPI',true);
      insert into public.tasks (user_id,project_id,title,due_date,priority,status,is_demo)
      values (u,proj,'Demo task for project '||i, now() + (i||' days')::interval,'HIGH','TODO',true);
    end if;
  end loop;
  insert into public.payments (user_id,amount,status,notes,is_demo)
  select u, 25000, 'PENDING', 'Demo pending payment', true;
  insert into public.tasks (user_id,title,due_date,priority,status,is_demo)
  values (u,'Demo task: call back hot leads', now(), 'URGENT','TODO',true);
end $$;

create or replace function public.delete_demo_data()
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not authenticated'; end if;
  delete from public.payments where user_id=u and is_demo;
  delete from public.tasks where user_id=u and is_demo;
  delete from public.follow_ups where user_id=u and is_demo;
  delete from public.lead_activities where user_id=u and is_demo;
  delete from public.notes where user_id=u and is_demo;
  delete from public.projects where user_id=u and is_demo;
  delete from public.customers where user_id=u and is_demo;
  delete from public.leads where user_id=u and is_demo;
end $$;

grant execute on function public.seed_demo_data() to authenticated;
grant execute on function public.delete_demo_data() to authenticated;
