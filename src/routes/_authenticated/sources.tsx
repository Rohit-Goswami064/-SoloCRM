/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminOnly } from "@/components/crm/AdminOnly";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows } from "@/components/crm/Common";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { deleteRow, insertRow, updateRow, useInvalidate, useLeads, useSources, type Source } from "@/lib/crm/db";
import { Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({
    meta: [
      { title: "Lead sources · SoloCRM" },
      { name: "description", content: "Configure where your leads come from and see how many leads each source brought in." },
      { property: "og:title", content: "Lead sources · SoloCRM" },
      { property: "og:description", content: "Configure lead sources and see how many leads each one brought in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <SourcesPage />
    </AdminOnly>
  ),
});

function SourcesPage() {
  const invalidate = useInvalidate();
  const { data: sources = [], isLoading } = useSources();
  const { data: leadPage } = useLeads({ pageSize: 1000 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [toDelete, setToDelete] = useState<Source | null>(null);

  const countFor = (id: string) => (leadPage?.rows ?? []).filter((l) => l.source_id === id).length;

  return (
    <div>
      <PageHeader
        title="Lead sources"
        description="Fully configurable — add the channels you actually use."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Add source</Button>}
      />
      {isLoading ? (
        <LoadingRows />
      ) : sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Add your first channel, e.g. Referral or Google Ads." icon={<Radio className="size-6" />} />
      ) : (
        <Surface className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{countFor(s.id)} leads</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => setToDelete(s)} aria-label="Delete source">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </Surface>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Rename source" : "Add lead source"}
        fields={[{ name: "name", label: "Source name", required: true, colSpan: 2 }]}
        initial={editing ?? {}}
        onSubmit={async (v) => {
          if (sources.some((s) => s.name.toLowerCase() === String(v.name).toLowerCase() && s.id !== editing?.id))
            throw new Error("A source with that name already exists.");
          if (editing) await updateRow("lead_sources", editing.id, { name: v.name });
          else await insertRow("lead_sources", { name: v.name });
          toast.success("Saved");
          invalidate("lead_sources");
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        description="Leads using this source keep their history but lose the source label."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (toDelete) await deleteRow("lead_sources", toDelete.id);
          setToDelete(null);
          toast.success("Source deleted");
          invalidate("lead_sources", "leads");
        }}
      />
    </div>
  );
}
