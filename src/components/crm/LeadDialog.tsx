/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormDialog, type Field } from "./FormDialog";
import {
  LEAD_STATUSES,
  TEMPERATURES,
  isValidEmail,
  isValidPhone,
} from "@/lib/crm/constants";
import {
  insertRow,
  logActivity,
  logAudit,
  updateRow,
  useCategories,
  useSources,
  type Lead,
} from "@/lib/crm/db";
import { toast } from "sonner";
import { useCallers, useIsAdmin } from "@/lib/crm/roles";

export function LeadDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: Lead | null;
  onSaved?: () => void;
}) {
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();
  const { isAdmin } = useIsAdmin();
  const { data: callers = [] } = useCallers();

  const fields: Field[] = [
    { name: "name", label: "Lead name", required: true },
    { name: "company", label: "Company" },
    { name: "contact_person", label: "Contact person" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "whatsapp", label: "WhatsApp", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "website", label: "Website" },
    { name: "city", label: "City" },
    { name: "state", label: "State" },
    { name: "country", label: "Country" },
    { name: "address", label: "Address", colSpan: 2 },
    {
      name: "category_id",
      label: "Category",
      type: "select",
      options: categories.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "source_id",
      label: "Source",
      type: "select",
      options: sources.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      name: "temperature",
      label: "Temperature",
      type: "select",
      required: true,
      options: TEMPERATURES.map((s) => ({ value: s.value, label: s.label })),
    },
    ...(isAdmin
      ? ([
          {
            name: "assigned_to",
            label: "Assigned caller",
            type: "select",
            options: callers.map((c) => ({ value: c.id, label: c.full_name ?? c.email ?? "Caller" })),
          },
        ] as Field[])
      : []),
    { name: "company_size", label: "Company size" },
    { name: "service_interested", label: "Service interested in" },
    { name: "estimated_budget", label: "Estimated budget", type: "number" },
    { name: "deal_value", label: "Deal value", type: "number" },
    { name: "expected_close_date", label: "Expected closing date", type: "date" },
    { name: "next_follow_up", label: "Next follow-up", type: "datetime-local" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial = lead
    ? {
        ...lead,
        estimated_budget: lead.estimated_budget ?? "",
        deal_value: lead.deal_value ?? "",
        next_follow_up: lead.next_follow_up
          ? new Date(lead.next_follow_up).toISOString().slice(0, 16)
          : "",
      }
    : { status: "NEW", temperature: "WARM", country: "India" };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={lead ? "Edit lead" : "Add lead"}
      description="Contact, business and sales information for this lead."
      fields={fields}
      initial={initial as any}
      validate={(v) => {
        if (v.phone && !isValidPhone(v.phone)) return "Phone number needs at least 10 digits.";
        if (v.email && !isValidEmail(v.email)) return "Email address looks invalid.";
        if (v.deal_value && Number(v.deal_value) < 0) return "Deal value cannot be negative.";
        return null;
      }}
      onSubmit={async (v) => {
        const payload: any = {
          name: String(v.name).trim(),
          company: v.company || null,
          contact_person: v.contact_person || null,
          phone: v.phone || null,
          whatsapp: v.whatsapp || null,
          email: v.email || null,
          website: v.website || null,
          address: v.address || null,
          city: v.city || null,
          state: v.state || null,
          country: v.country || null,
          company_size: v.company_size || null,
          service_interested: v.service_interested || null,
          category_id: v.category_id || null,
          ...(isAdmin ? { assigned_to: v.assigned_to || null } : {}),
          source_id: v.source_id || null,
          status: v.status,
          temperature: v.temperature,
          estimated_budget: v.estimated_budget === "" ? null : Number(v.estimated_budget),
          deal_value: v.deal_value === "" ? 0 : Number(v.deal_value),
          expected_close_date: v.expected_close_date || null,
          next_follow_up: v.next_follow_up ? new Date(v.next_follow_up).toISOString() : null,
          notes: v.notes || null,
        };
        if (lead) {
          await updateRow("leads", lead.id, payload);
          if (lead.status !== payload.status) {
            await logActivity({
              type: "STATUS_CHANGE",
              title: `Status changed to ${String(payload.status).replaceAll("_", " ")}`,
              lead_id: lead.id,
            });
          }
          await logAudit("LEAD_UPDATED", "lead", lead.id, payload);
          toast.success("Lead updated");
        } else {
          const created = await insertRow("leads", payload);
          await logActivity({ type: "NOTE", title: "Lead created", lead_id: created.id });
          await logAudit("LEAD_CREATED", "lead", created.id, payload);
          toast.success("Lead added");
        }
        onSaved?.();
      }}
    />
  );
}
