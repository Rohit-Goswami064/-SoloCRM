/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormDialog } from "./FormDialog";
import { FOLLOWUP_TYPES } from "@/lib/crm/constants";
import { insertRow, logActivity, updateRow } from "@/lib/crm/db";
import { toast } from "sonner";

export function FollowUpDialog({
  open,
  onOpenChange,
  leadId,
  customerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId?: string | null;
  customerId?: string | null;
  onSaved?: () => void;
}) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(10, 0, 0, 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule follow-up"
      description="You will see this in the Action Centre on the dashboard."
      fields={[
        { name: "due_at", label: "Date & time", type: "datetime-local", required: true },
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: FOLLOWUP_TYPES.map((t) => ({ value: t.value, label: t.label })),
        },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      initial={{ due_at: tomorrow.toISOString().slice(0, 16), type: "CALL" }}
      submitLabel="Schedule"
      onSubmit={async (v) => {
        const due = new Date(v.due_at).toISOString();
        await insertRow("follow_ups", {
          lead_id: leadId ?? null,
          customer_id: customerId ?? null,
          due_at: due,
          type: v.type,
          notes: v.notes || null,
          status: "PENDING",
        });
        if (leadId) {
          await updateRow("leads", leadId, { next_follow_up: due });
          await logActivity({
            type: "FOLLOW_UP",
            title: `Follow-up scheduled (${String(v.type).toLowerCase()})`,
            body: v.notes || null,
            lead_id: leadId,
          });
        }
        toast.success("Follow-up scheduled");
        onSaved?.();
      }}
    />
  );
}
