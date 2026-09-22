/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminOnly } from "@/components/crm/AdminOnly";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows } from "@/components/crm/Common";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { deleteRow, insertRow, updateRow, useCategories, useInvalidate, useLeads, type Category } from "@/lib/crm/db";
import { Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({
    meta: [
      { title: "Lead categories · SoloCRM" },
      { name: "description", content: "Group leads by industry or segment with categories you define yourself." },
      { property: "og:title", content: "Lead categories · SoloCRM" },
      { property: "og:description", content: "Group leads by industry or segment with your own categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <CategoriesPage />
    </AdminOnly>
  ),
});

function CategoriesPage() {
  const invalidate = useInvalidate();
  const { data: categories = [], isLoading } = useCategories();
  const { data: leadPage } = useLeads({ pageSize: 1000 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const countFor = (id: string) => (leadPage?.rows ?? []).filter((l) => l.category_id === id).length;

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Never hardcoded — shape them around the industries you sell to."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4" /> Add category</Button>}
      />
      {isLoading ? (
        <LoadingRows />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Add your first category, e.g. Healthcare." icon={<Tags className="size-6" />} />
      ) : (
        <Surface className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{countFor(c.id)} leads</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => setToDelete(c)} aria-label="Delete category">
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
        title={editing ? "Rename category" : "Add category"}
        fields={[{ name: "name", label: "Category name", required: true, colSpan: 2 }]}
        initial={editing ?? {}}
        onSubmit={async (v) => {
          if (categories.some((c) => c.name.toLowerCase() === String(v.name).toLowerCase() && c.id !== editing?.id))
            throw new Error("A category with that name already exists.");
          if (editing) await updateRow("lead_categories", editing.id, { name: v.name });
          else await insertRow("lead_categories", { name: v.name });
          toast.success("Saved");
          invalidate("lead_categories");
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        description="Leads in this category keep their history but lose the category label."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (toDelete) await deleteRow("lead_categories", toDelete.id);
          setToDelete(null);
          toast.success("Category deleted");
          invalidate("lead_categories", "leads");
        }}
      />
    </div>
  );
}
