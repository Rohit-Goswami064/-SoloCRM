revoke all on function public.has_role(uuid, public.app_role) from anon;
revoke all on function public.is_admin() from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.can_access_lead(_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.leads l where l.id = _lead_id and l.assigned_to = auth.uid()
  )
$$;
revoke all on function public.can_access_lead(uuid) from public, anon;
grant execute on function public.can_access_lead(uuid) to authenticated;

-- LEADS
drop policy if exists "own leads" on public.leads;
create policy "admin all leads" on public.leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "caller reads assigned leads" on public.leads for select to authenticated
  using (assigned_to = auth.uid());
create policy "caller updates assigned leads" on public.leads for update to authenticated
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- FOLLOW UPS
drop policy if exists "own follow_ups" on public.follow_ups;
create policy "admin all follow_ups" on public.follow_ups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "caller reads follow_ups" on public.follow_ups for select to authenticated
  using (lead_id is not null and public.can_access_lead(lead_id));
create policy "caller adds follow_ups" on public.follow_ups for insert to authenticated
  with check (user_id = auth.uid() and lead_id is not null and public.can_access_lead(lead_id));
create policy "caller updates follow_ups" on public.follow_ups for update to authenticated
  using (lead_id is not null and public.can_access_lead(lead_id))
  with check (lead_id is not null and public.can_access_lead(lead_id));

-- ACTIVITIES (append only for callers)
drop policy if exists "own activities" on public.lead_activities;
create policy "admin all activities" on public.lead_activities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "caller reads activities" on public.lead_activities for select to authenticated
  using (lead_id is not null and public.can_access_lead(lead_id));
create policy "caller adds activities" on public.lead_activities for insert to authenticated
  with check (user_id = auth.uid() and lead_id is not null and public.can_access_lead(lead_id));

-- NOTES
drop policy if exists "own notes" on public.notes;
create policy "admin all notes" on public.notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "caller reads notes" on public.notes for select to authenticated
  using (lead_id is not null and public.can_access_lead(lead_id));
create policy "caller adds notes" on public.notes for insert to authenticated
  with check (user_id = auth.uid() and lead_id is not null and public.can_access_lead(lead_id));

-- SOURCES / CATEGORIES : readable by all signed-in users, managed by admin
drop policy if exists "own sources" on public.lead_sources;
create policy "read sources" on public.lead_sources for select to authenticated using (true);
create policy "admin manages sources" on public.lead_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own categories" on public.lead_categories;
create policy "read categories" on public.lead_categories for select to authenticated using (true);
create policy "admin manages categories" on public.lead_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ADMIN-ONLY TABLES
drop policy if exists "own customers" on public.customers;
create policy "admin customers" on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own projects" on public.projects;
create policy "admin projects" on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own payments" on public.payments;
create policy "admin payments" on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own tasks" on public.tasks;
create policy "admin tasks" on public.tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own files" on public.files;
create policy "admin files" on public.files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own imports" on public.imports;
create policy "admin imports" on public.imports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own import_rows" on public.import_rows;
create policy "admin import_rows" on public.import_rows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- AUDIT
drop policy if exists "own audit read" on public.audit_logs;
create policy "admin audit read" on public.audit_logs for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- PROFILES
drop policy if exists "own profile" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admin manages profiles" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- New signups: first ever user becomes ADMIN, everyone else CALLER
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
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
    foreach s in array array['Google Maps','Google Ads','Meta Ads','Instagram','Justdial','Website','Referral','Cold Call','WhatsApp','Other'] loop
      insert into public.lead_sources (user_id, name) values (new.id, s) on conflict do nothing;
    end loop;
    foreach c in array array['Real Estate','Clinic','School','Coaching','Restaurant','Manufacturing','E-commerce','Agency','Local Business','Other'] loop
      insert into public.lead_categories (user_id, name) values (new.id, c) on conflict do nothing;
    end loop;
  end if;
  return new;
end $function$;
