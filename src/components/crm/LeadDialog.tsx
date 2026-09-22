/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormDialog, type Field } from "./FormDialog";
import {
  LEAD_STATUSES,
  TEMPERATURES,
  customFieldInputType,
  isValidEmail,
  isValidPhone,
} from "@/lib/crm/constants";
import {
  emptyToNull,
  insertRow,
  logActivity,
  logAudit,
  numberOrNull,
  updateRow,
  useCategories,
  useCustomFields,
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
  stage = "MAIN",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: Lead | null;
  onSaved?: () => void;
  /** Where a newly created lead should land. Manually added leads skip Incoming. */
  stage?: "INCOMING" | "MAIN";
}) {
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();
  const { isAdmin } = useIsAdmin();
  const { data: callers = [] } = useCallers();
  const { data: customDefs = [] } = useCustomFields();

  const fields: Field[] = [
    { name: "name", label: "Lead name", placeholder: "Optional" },
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
    ...customDefs.map((d) => {
      const type = customFieldInputType(d.field_type);
      const field: Field = {
        name: `cf_${d.key}`,
        label: d.label,
        placeholder: d.is_required ? "" : "Optional",
      };
      field.type = type as NonNullable<Field["type"]>;
      if (d.is_required) field.required = true;
      if (type === "select") {
        field.options =
          d.field_type === "BOOLEAN"
            ? [
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" },
              ]
            : (d.options ?? []).map((o) => ({ value: o, label: o }));
      }
      return field;
    }),
  ];

  const existingCustom = ((lead?.custom_fields ?? {}) as Record<string, unknown>) || {};
  const customInitial = Object.fromEntries(
    customDefs.map((d) => [`cf_${d.key}`, existingCustom[d.key] ?? ""]),
  );

  const initial = lead
    ? {
        ...lead,
        ...customInitial,
        estimated_budget: lead.estimated_budget ?? "",
        deal_value: lead.deal_value ?? "",
        next_follow_up: lead.next_follow_up
          ? new Date(lead.next_follow_up).toISOString().slice(0, 16)
          : "",
      }
    : { status: "NEW", temperature: "WARM", country: "India", ...customInitial };

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
        if (v.deal_value !== "" && v.deal_value != null && Number(v.deal_value) < 0)
          return "Deal value cannot be negative.";
        if (!String(v.name ?? "").trim() && !String(v.company ?? "").trim())
          return "Enter at least a lead name or a company name.";
        return null;
      }}
      onSubmit={async (v) => {
        const custom: Record<string, unknown> = { ...existingCustom };
        customDefs.forEach((d) => {
          const raw = emptyToNull(v[`cf_${d.key}`]);
          if (raw === null) delete custom[d.key];
          else custom[d.key] = d.field_type === "NUMBER" ? numberOrNull(raw) : raw;
        });

        const payload: any = {
          name: emptyToNull(v.name) ?? emptyToNull(v.company),
          company: emptyToNull(v.company),
          contact_person: emptyToNull(v.contact_person),
          phone: emptyToNull(v.phone),
          whatsapp: emptyToNull(v.whatsapp),
          email: emptyToNull(v.email),
          website: emptyToNull(v.website),
          address: emptyToNull(v.address),
          city: emptyToNull(v.city),
          state: emptyToNull(v.state),
          country: emptyToNull(v.country),
          company_size: emptyToNull(v.company_size),
          service_interested: emptyToNull(v.service_interested),
          category_id: emptyToNull(v.category_id),
          ...(isAdmin ? { assigned_to: emptyToNull(v.assigned_to) } : {}),
          source_id: emptyToNull(v.source_id),
          status: v.status || "NEW",
          temperature: emptyToNull(v.temperature),
          estimated_budget: numberOrNull(v.estimated_budget),
          deal_value: numberOrNull(v.deal_value),
          expected_close_date: emptyToNull(v.expected_close_date),
          next_follow_up: v.next_follow_up ? new Date(v.next_follow_up).toISOString() : null,
          notes: emptyToNull(v.notes),
          custom_fields: custom,
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
          const created = await insertRow("leads", {
            ...payload,
            stage,
            qualification_status: stage === "MAIN" ? "QUALIFIED" : "UNQUALIFIED",
          });
          await logActivity({ type: "NOTE", title: "Lead created", lead_id: created.id });
          await logAudit("LEAD_CREATED", "lead", created.id, payload);
          toast.success("Lead added");
        }
        onSaved?.();
      }}
    />
  );
}
