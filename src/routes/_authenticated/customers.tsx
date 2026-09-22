/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "./leads.index";
import { formatDate, formatMoney, isValidEmail, isValidPhone, normalizePhone, waLink } from "@/lib/crm/constants";
import {
  deleteRow,
  insertRow,
  updateRow,
  useCategories,
  useInvalidate,
  useList,
  useSources,
  type Customer,
  type Payment,
  type Project,
} from "@/lib/crm/db";
import { Download, MessageCircle, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers · SoloCRM" },
      { name: "description", content: "Your won clients with their projects, revenue and contact details in one place." },
      { property: "og:title", content: "Customers · SoloCRM" },
      { property: "og:description", content: "Won clients with their projects, revenue and contact details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

const LIFECYCLES = ["LEAD", "QUALIFIED", "WON", "CUSTOMER", "REPEAT"];

function CustomersPage() {
  const invalidate = useInvalidate();
  const { data: customers = [], isLoading, error } = useList<Customer>("customers", {
    order: { column: "created_at" },
  });
  const { data: projects = [] } = useList<Project>("projects", { key: ["all"] });
  const { data: payments = [] } = useList<Payment>("payments", { key: ["all"] });
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();

  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const filtered = customers.filter((c) =>
    [c.name, c.company, c.phone, c.email, c.city].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  const revenueOf = (id: string) =>
    payments.filter((p) => p.customer_id === id && p.status === "PAID").reduce((s, p) => s + Number(p.amount), 0);
  const projectsOf = (id: string) => projects.filter((p) => p.customer_id === id);

  const fields = [
    { name: "name", label: "Customer name", required: true },
    { name: "company", label: "Company" },
    { name: "phone", label: "Phone", type: "tel" as const },
    { name: "whatsapp", label: "WhatsApp", type: "tel" as const },
    { name: "email", label: "Email", type: "email" as const },
    { name: "website", label: "Website" },
    { name: "city", label: "City" },
    { name: "state", label: "State" },
    { name: "country", label: "Country" },
    { name: "industry", label: "Industry" },
    {
      name: "lifecycle",
      label: "Lifecycle stage",
      type: "select" as const,
      required: true,
      options: LIFECYCLES.map((l) => ({ value: l, label: l.charAt(0) + l.slice(1).toLowerCase() })),
    },
    {
      name: "source_id",
      label: "Source",
      type: "select" as const,
      options: sources.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      name: "category_id",
      label: "Category",
      type: "select" as const,
      options: categories.map((c) => ({ value: c.id, label: c.name })),
    },
    { name: "address", label: "Address", colSpan: 2 as const },
    { name: "notes", label: "Notes", type: "textarea" as const },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customer${customers.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `customers-${new Date().toISOString().slice(0, 10)}.csv`,
                  filtered.map((c) => ({
                    Name: c.name,
                    Company: c.company,
                    Phone: c.phone,
                    Email: c.email,
                    City: c.city,
                    Industry: c.industry,
                    Lifecycle: c.lifecycle,
                    Revenue: revenueOf(c.id),
                    Created: c.created_at,
                  })),
                )
              }
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="size-4" /> Add customer
            </Button>
          </>
        }
      />

      <Surface className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="pl-9" />
        </div>
      </Surface>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Convert a won lead, or add a customer directly."
          icon={<Users className="size-6" />}
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add customer</Button>
              <Button size="sm" variant="outline" asChild><Link to="/leads">Go to leads</Link></Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Surface key={c.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.company, c.city].filter(Boolean).join(" · ") || "No company"}
                  </p>
                </div>
                <StatusPill label={c.lifecycle} tone={c.lifecycle === "REPEAT" ? "success" : "info"} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Projects: <b className="text-foreground">{projectsOf(c.id).length}</b></span>
                <span>Revenue: <b className="text-success">{formatMoney(revenueOf(c.id))}</b></span>
                <span className="col-span-2">Since {formatDate(c.created_at)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.phone && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:${c.phone}`}><Phone className="size-3.5" /> Call</a>
                  </Button>
                )}
                {waLink(c.whatsapp || c.phone) && (
                  <Button asChild size="sm" variant="outline">
                    <a href={waLink(c.whatsapp || c.phone)!} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => setToDelete(c)} aria-label="Delete customer">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </Surface>
          ))}
        </div>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit customer" : "Add customer"}
        fields={fields}
        initial={editing ?? { lifecycle: "CUSTOMER", country: "India" }}
        validate={(v) => {
          if (v.phone && !isValidPhone(v.phone)) return "Phone number needs at least 10 digits.";
          if (v.email && !isValidEmail(v.email)) return "Email address looks invalid.";
          const normalized = normalizePhone(v.phone);
          const clash = customers.find(
            (c) => c.id !== editing?.id && normalized && c.phone_normalized === normalized,
          );
          if (clash) return `${clash.name} already uses this phone number — edit that customer instead.`;
          return null;
        }}
        onSubmit={async (v) => {
          const payload = {
            name: v.name,
            company: v.company || null,
            phone: v.phone || null,
            whatsapp: v.whatsapp || null,
            email: v.email || null,
            website: v.website || null,
            city: v.city || null,
            state: v.state || null,
            country: v.country || null,
            industry: v.industry || null,
            lifecycle: v.lifecycle,
            source_id: v.source_id || null,
            category_id: v.category_id || null,
            address: v.address || null,
            notes: v.notes || null,
          };
          if (editing) await updateRow("customers", editing.id, payload);
          else await insertRow("customers", payload);
          toast.success(editing ? "Customer updated" : "Customer added");
          invalidate("customers", "dashboard");
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ""}?`}
        description="Their projects, payments and files will also be removed. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          if (toDelete) await deleteRow("customers", toDelete.id);
          setToDelete(null);
          toast.success("Customer deleted");
          invalidate("customers", "projects", "payments", "dashboard");
        }}
      />
    </div>
  );
}
