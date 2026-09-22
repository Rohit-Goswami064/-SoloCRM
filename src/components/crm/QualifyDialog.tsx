/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormDialog } from "./FormDialog";
import { dispositionLead, qualifyLead, type Lead } from "@/lib/crm/db";
import { toast } from "sonner";

/** Short qualification form the caller fills in after speaking to the business. */
export function QualifyDialog({
  open,
  onOpenChange,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  onSaved?: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Qualify ${lead.name}`}
      description="This moves the lead into Main leads. The same record is kept — nothing is duplicated."
      submitLabel="Qualify lead"
      initial={{
        interested: "yes",
        service_interested: lead.service_interested ?? "",
        estimated_budget: lead.estimated_budget ?? "",
      }}
      fields={[
        {
          name: "interested",
          label: "Is the business interested?",
          type: "select",
          required: true,
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "Not yet, but worth keeping" },
          ],
        },
        { name: "service_interested", label: "Service required", placeholder: "Website, Ads, SEO…" },
        { name: "estimated_budget", label: "Budget (optional)", type: "number" },
        { name: "expected_timeline", label: "Expected timeline (optional)", placeholder: "This month, next quarter…" },
        { name: "requirement", label: "Requirement", type: "textarea", placeholder: "What exactly do they need?" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      onSubmit={async (v) => {
        await qualifyLead(lead, {
          interested: v.interested !== "no",
          service_interested: v.service_interested || null,
          estimated_budget: v.estimated_budget ? Number(v.estimated_budget) : null,
          requirement: v.requirement || null,
          expected_timeline: v.expected_timeline || null,
          notes: v.notes || null,
        });
        toast.success("Lead qualified — it is now in Main leads");
        onSaved?.();
      }}
    />
  );
}

const COPY: Record<string, { title: string; description: string; label: string }> = {
  NOT_INTERESTED: {
    title: "Mark as not interested",
    description: "The lead stays in your database and moves to the Not interested list.",
    label: "Why are they not interested?",
  },
  INVALID: {
    title: "Mark as invalid",
    description: "Wrong number, closed business, duplicate or fake data. The record is kept, never deleted.",
    label: "What is wrong with this lead?",
  },
  NO_RESPONSE: {
    title: "No response",
    description: "The lead stays in Incoming leads so you can try again later.",
    label: "Note (optional)",
  },
};

/** Records a not-interested / invalid / no-response outcome without deleting anything. */
export function DispositionDialog({
  open,
  onOpenChange,
  lead,
  outcome,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  outcome: "NOT_INTERESTED" | "INVALID" | "NO_RESPONSE";
  onSaved?: () => void;
}) {
  const copy = COPY[outcome]!;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${copy.title} · ${lead.name}`}
      description={copy.description}
      submitLabel="Save"
      fields={[{ name: "reason", label: copy.label, type: "textarea" }]}
      onSubmit={async (v) => {
        await dispositionLead(lead, outcome, v.reason || null);
        toast.success(copy.title);
        onSaved?.();
      }}
    />
  );
}
