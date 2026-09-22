/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormDialog } from "./FormDialog";
import { logActivity, updateRow } from "@/lib/crm/db";
import { toast } from "sonner";

const OUTCOMES = [
  { value: "Interested", label: "Interested" },
  { value: "Not interested", label: "Not interested" },
  { value: "Call later", label: "Call later" },
  { value: "No answer", label: "No answer" },
  { value: "Wrong number", label: "Wrong number" },
  { value: "Other", label: "Other" },
];

/** Records a call note against a lead. Notes are appended, never overwritten. */
export function QuickNoteDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  leadName?: string;
  onSaved?: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Add call note${leadName ? ` · ${leadName}` : ""}`}
      description="Saved to this lead's history. Previous notes are never replaced."
      submitLabel="Save note"
      fields={[
        { name: "outcome", label: "Call outcome", type: "select", required: true, options: OUTCOMES },
        {
          name: "body",
          label: "What happened?",
          type: "textarea",
          required: true,
          placeholder: "Client is interested. Asked me to call Friday.",
        },
      ]}
      initial={{ outcome: "Interested" }}
      onSubmit={async (v: any) => {
        await logActivity({
          type: "CALL",
          title: `Called ${leadName ?? "lead"} — ${v.outcome}`,
          body: v.body,
          outcome: v.outcome,
          lead_id: leadId,
        });
        await updateRow("leads", leadId, { last_contact_at: new Date().toISOString() });
        toast.success("Call note saved");
        onSaved?.();
      }}
    />
  );
}
