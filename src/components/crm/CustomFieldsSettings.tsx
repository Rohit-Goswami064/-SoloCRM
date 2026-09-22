/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Surface, EmptyState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOM_FIELD_TYPES } from "@/lib/crm/constants";
import {
  currentUserId,
  slugifyFieldKey,
  useCustomFields,
  useInvalidate,
  type CustomFieldDef,
} from "@/lib/crm/db";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const typeLabel = (t: string) => CUSTOM_FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

/** Admin screen for extra lead fields. Values are stored on the lead, no new database column. */
export function CustomFieldsSettings() {
  const { data: fields = [] } = useCustomFields(false);
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);
  const [removing, setRemoving] = useState<CustomFieldDef | null>(null);

  const refresh = () => invalidate("custom_field_defs");

  return (
    <Surface className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Custom fields</h2>
          <p className="text-sm text-muted-foreground">
            Extra information you want to keep on a lead — Instagram, Google rating, property type and so on.
            They appear on the Add lead form, the lead page and the Excel import.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Add custom field
        </Button>
      </div>

      {fields.length === 0 ? (
        <EmptyState
          title="No custom fields yet"
          description="Add one to start collecting information the standard lead form does not cover."
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusPill label={typeLabel(f.field_type)} tone="info" />
                  {f.is_required && <StatusPill label="Required" tone="warning" />}
                  <StatusPill label={f.is_active ? "Active" : "Hidden"} tone={f.is_active ? "success" : "neutral"} />
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(f);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(f)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${editing.label}` : "Add custom field"}
        description="Choose a name and what kind of information it holds. Nothing already saved is lost."
        submitLabel={editing ? "Save field" : "Add field"}
        initial={
          editing
            ? {
                label: editing.label,
                field_type: editing.field_type,
                options: (editing.options ?? []).join(", "),
                is_required: editing.is_required ? "yes" : "no",
                is_active: editing.is_active ? "yes" : "no",
              }
            : { field_type: "TEXT", is_required: "no", is_active: "yes" }
        }
        fields={[
          { name: "label", label: "Field name", required: true, placeholder: "Instagram" },
          {
            name: "field_type",
            label: "Field type",
            type: "select",
            required: true,
            options: CUSTOM_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label })),
          },
          {
            name: "options",
            label: "Choices (only for a choice list)",
            placeholder: "Residential, Commercial, Plot",
            colSpan: 2,
            help: "Separate each choice with a comma.",
          },
          {
            name: "is_required",
            label: "Required?",
            type: "select",
            required: true,
            options: [
              { value: "no", label: "No — optional" },
              { value: "yes", label: "Yes — must be filled" },
            ],
          },
          {
            name: "is_active",
            label: "Show this field?",
            type: "select",
            required: true,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "Hide it" },
            ],
          },
        ]}
        onSubmit={async (v) => {
          const label = String(v.label).trim();
          const payload: any = {
            label,
            field_type: v.field_type,
            options: String(v.options ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            is_required: v.is_required === "yes",
            is_active: v.is_active === "yes",
          };
          const db = supabase as any;
          if (editing) {
            const { error } = await db.from("custom_field_defs").update(payload).eq("id", editing.id);
            if (error) throw error;
          } else {
            const key = slugifyFieldKey(label);
            if (!key) throw new Error("Please use letters or numbers in the field name.");
            const { error } = await db
              .from("custom_field_defs")
              .upsert({ ...payload, key, created_by: await currentUserId() }, { onConflict: "key" });
            if (error) throw error;
          }
          toast.success(editing ? "Custom field updated" : `"${label}" added`);
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing?.label ?? "field"}?`}
        description="The field disappears from the forms. Information already saved on your leads is kept."
        confirmLabel="Remove field"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          const { error } = await (supabase as any).from("custom_field_defs").delete().eq("id", removing.id);
          if (error) toast.error(error.message);
          else {
            toast.success("Custom field removed");
            refresh();
          }
          setRemoving(null);
        }}
      />
    </Surface>
  );
}
