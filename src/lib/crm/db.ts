/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]["Row"];

export type Lead = Row<"leads">;
export type Customer = Row<"customers">;
export type Project = Row<"projects">;
export type Payment = Row<"payments">;
export type Task = Row<"tasks">;
export type FollowUp = Row<"follow_ups">;
export type Activity = Row<"lead_activities">;
export type CrmFile = Row<"files">;
export type Note = Row<"notes">;
export type Source = Row<"lead_sources">;
export type Category = Row<"lead_categories">;
export type ImportRun = Row<"imports">;

const client = () => supabase as any;

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You need to be signed in.");
  return data.user.id;
}

export async function insertRows(table: TableName, values: Record<string, any>[]) {
  const user_id = await currentUserId();
  const { data, error } = await client()
    .from(table)
    .insert(values.map((v) => ({ ...v, user_id })))
    .select();
  if (error) throw error;
  return data as any[];
}

export async function insertRow(table: TableName, values: Record<string, any>) {
  const rows = await insertRows(table, [values]);
  return rows[0];
}

export async function updateRow(table: TableName, id: string, values: Record<string, any>) {
  const { data, error } = await client()
    .from(table)
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table: TableName, id: string) {
  const { error } = await client().from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function deleteRows(table: TableName, ids: string[]) {
  const { error } = await client().from(table).delete().in("id", ids);
  if (error) throw error;
}

/** Append an immutable entry to the activity timeline. */
export async function logActivity(entry: {
  type: Database["public"]["Enums"]["activity_type"];
  title: string;
  body?: string | null;
  outcome?: string | null;
  lead_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  meta?: Record<string, any>;
}) {
  const user_id = await currentUserId();
  const { error } = await client()
    .from("lead_activities")
    .insert({ ...entry, user_id });
  if (error) throw error;
}

export async function logAudit(
  action: string,
  entity: string,
  entityId?: string | null,
  changes: Record<string, any> = {},
) {
  const user_id = await currentUserId();
  await client().from("audit_logs").insert({ user_id, action, entity, entity_id: entityId ?? null, changes });
}

export async function notify(title: string, body?: string, kind = "INFO", link?: string) {
  const user_id = await currentUserId();
  await client().from("notifications").insert({ user_id, title, body, kind, link });
}

/* ------------------------------------------------------------------ */
/* Query hooks                                                         */
/* ------------------------------------------------------------------ */

export function useSources() {
  return useQuery({
    queryKey: ["lead_sources"],
    queryFn: async () => {
      const { data, error } = await client().from("lead_sources").select("*").order("name");
      if (error) throw error;
      return data as Source[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["lead_categories"],
    queryFn: async () => {
      const { data, error } = await client().from("lead_categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
}

export type LeadFilters = {
  search?: string | undefined;
  stage?: string | undefined;
  qualification?: string | undefined;
  importId?: string | undefined;
  status?: string[] | undefined;
  temperature?: string[] | undefined;
  sourceId?: string | null | undefined;
  categoryId?: string | null | undefined;
  city?: string | undefined;
  assignedTo?: string | null | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  sort?: { column: string; asc: boolean } | undefined;
  overdueOnly?: boolean | undefined;
  dueTodayOnly?: boolean | undefined;
};

export function buildLeadQuery(filters: LeadFilters) {
  let q = client().from("leads").select("*", { count: "exact" });
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,]/g, " ");
    q = q.or(
      `name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`,
    );
  }
  if (filters.stage) q = q.eq("stage", filters.stage);
  if (filters.qualification) q = q.eq("qualification_status", filters.qualification);
  if (filters.importId) q = q.eq("import_id", filters.importId);
  if (filters.status?.length) q = q.in("status", filters.status);
  if (filters.temperature?.length) q = q.in("temperature", filters.temperature);
  if (filters.sourceId) q = q.eq("source_id", filters.sourceId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (filters.city?.trim()) q = q.ilike("city", `%${filters.city.trim()}%`);
  if (filters.assignedTo === "unassigned") q = q.is("assigned_to", null);
  else if (filters.assignedTo) q = q.eq("assigned_to", filters.assignedTo);
  if (filters.overdueOnly) q = q.lt("next_follow_up", new Date().toISOString());
  if (filters.dueTodayOnly) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    q = q.gte("next_follow_up", start.toISOString()).lte("next_follow_up", end.toISOString());
  }
  const sort = filters.sort ?? { column: "created_at", asc: false };
  q = q.order(sort.column, { ascending: sort.asc, nullsFirst: false });
  return q;
}

export function useLeads(filters: LeadFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const { data, error, count } = await buildLeadQuery(filters).range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Lead[], count: count ?? 0 };
    },
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await client().from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Lead | null;
    },
  });
}

export function useList<T = any>(
  table: TableName,
  opts?: {
    select?: string;
    order?: { column: string; asc?: boolean };
    filters?: (q: any) => any;
    key?: any[];
    enabled?: boolean;
  },
) {
  return useQuery({
    queryKey: [table, ...(opts?.key ?? [])],
    enabled: opts?.enabled ?? true,
    queryFn: async () => {
      let q = client().from(table).select(opts?.select ?? "*");
      if (opts?.filters) q = opts.filters(q);
      if (opts?.order) q = q.order(opts.order.column, { ascending: opts.order.asc ?? false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => {
    if (!keys.length) {
      void qc.invalidateQueries();
      return;
    }
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}

export function useCrmMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  opts?: { invalidate?: string[]; onDone?: () => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      (opts?.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      opts?.onDone?.();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Domain operations                                                   */
/* ------------------------------------------------------------------ */

export async function changeLeadStatus(lead: Lead, status: string) {
  await updateRow("leads", lead.id, { status });
  await logActivity({
    type: "STATUS_CHANGE",
    title: `Status changed to ${status.replaceAll("_", " ")}`,
    body: `Previous status: ${lead.status.replaceAll("_", " ")}`,
    lead_id: lead.id,
  });
  await logAudit("STATUS_CHANGED", "lead", lead.id, { from: lead.status, to: status });
}

/** Moves a lead out of Incoming into the main pipeline. Same record — only the stage changes. */
export async function qualifyLead(
  lead: Lead,
  input: {
    interested: boolean;
    service_interested?: string | null;
    estimated_budget?: number | null;
    requirement?: string | null;
    expected_timeline?: string | null;
    notes?: string | null;
  },
) {
  const userId = await currentUserId();
  await updateRow("leads", lead.id, {
    stage: "MAIN",
    qualification_status: "QUALIFIED",
    status: "QUALIFIED",
    temperature: input.interested ? "HOT" : "WARM",
    service_interested: input.service_interested || lead.service_interested,
    estimated_budget: input.estimated_budget ?? lead.estimated_budget,
    requirement: input.requirement ?? null,
    expected_timeline: input.expected_timeline ?? null,
    qualification_notes: input.notes ?? null,
    qualification_date: new Date().toISOString(),
    qualified_by: userId,
    last_contact_at: new Date().toISOString(),
  });
  await logActivity({
    type: "STATUS_CHANGE",
    title: "Lead qualified",
    body: [
      input.interested ? "Business is interested." : "Business is not sure yet.",
      input.service_interested ? `Service: ${input.service_interested}` : null,
      input.requirement ? `Requirement: ${input.requirement}` : null,
      input.expected_timeline ? `Timeline: ${input.expected_timeline}` : null,
      input.notes,
    ]
      .filter(Boolean)
      .join("\n"),
    lead_id: lead.id,
  });
  await logAudit("LEAD_QUALIFIED", "lead", lead.id, { from: lead.stage });
}

/** Records a call outcome that does not qualify the lead. Nothing is ever deleted. */
export async function dispositionLead(
  lead: Lead,
  outcome: "NOT_INTERESTED" | "INVALID" | "NO_RESPONSE" | "CALLING",
  reason?: string | null,
) {
  const patch: Record<string, any> = {
    qualification_status: outcome,
    disposition_reason: reason ?? null,
    last_contact_at: new Date().toISOString(),
  };
  if (outcome === "NOT_INTERESTED") {
    patch['stage'] = "NOT_INTERESTED";
    patch['status'] = "NOT_INTERESTED";
  } else if (outcome === "INVALID") {
    patch['stage'] = "INVALID";
  } else {
    patch['stage'] = "INCOMING";
    if (outcome === "CALLING") patch['status'] = "CONTACTED";
  }
  await updateRow("leads", lead.id, patch);
  const labels: Record<string, string> = {
    NOT_INTERESTED: "Marked not interested",
    INVALID: "Marked invalid",
    NO_RESPONSE: "No response",
    CALLING: "Calling in progress",
  };
  await logActivity({
    type: "CALL",
    title: labels[outcome] ?? outcome,
    body: reason ?? null,
    lead_id: lead.id,
  });
  await logAudit("LEAD_DISPOSITION", "lead", lead.id, { outcome, reason });
}

/** Converts a WON lead into a customer, reusing an existing customer when one matches. */
export async function convertLeadToCustomer(lead: Lead) {
  if (lead.converted_customer_id) return lead.converted_customer_id as string;
  const normalized = (lead.phone ?? "").replace(/\D/g, "").slice(-10);
  let existingId: string | null = null;
  if (normalized) {
    const { data } = await client()
      .from("customers")
      .select("id")
      .eq("phone_normalized", normalized)
      .maybeSingle();
    existingId = data?.id ?? null;
  }
  if (!existingId && lead.email) {
    const { data } = await client()
      .from("customers")
      .select("id")
      .ilike("email", lead.email)
      .maybeSingle();
    existingId = data?.id ?? null;
  }
  let customerId = existingId;
  if (!customerId) {
    const customer = await insertRow("customers", {
      name: lead.name,
      company: lead.company,
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      email: lead.email,
      website: lead.website,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      country: lead.country,
      industry: lead.service_interested,
      source_id: lead.source_id,
      category_id: lead.category_id,
      lifecycle: "CUSTOMER",
    });
    customerId = customer.id as string;
  }
  await updateRow("leads", lead.id, { status: "WON", converted_customer_id: customerId });
  await logActivity({
    type: "STATUS_CHANGE",
    title: "Lead converted to customer",
    lead_id: lead.id,
    customer_id: customerId,
  });
  await logAudit("LEAD_CONVERTED", "lead", lead.id, { customer_id: customerId });
  return customerId as string;
}

export async function projectFinancials(projectId: string, projectValue: number) {
  const { data } = await client()
    .from("payments")
    .select("amount,status")
    .eq("project_id", projectId);
  const paid = (data ?? [])
    .filter((p: any) => p.status === "PAID" || p.status === "PARTIAL")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  return { paid, outstanding: Math.max(0, Number(projectValue) - paid) };
}

export async function seedDemoData() {
  const { error } = await client().rpc("seed_demo_data");
  if (error) throw error;
}

export async function deleteDemoData() {
  const { error } = await client().rpc("delete_demo_data");
  if (error) throw error;
}
