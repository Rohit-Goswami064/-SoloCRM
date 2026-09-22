/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState, KpiCard } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import {
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  formatDate,
  formatMoney,
  labelOf,
  toneOf,
} from "@/lib/crm/constants";
import {
  deleteRow,
  insertRow,
  updateRow,
  useInvalidate,
  useList,
  type Customer,
  type Payment,
  type Project,
} from "@/lib/crm/db";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects · SoloCRM" },
      { name: "description", content: "Track client projects with deadlines, status, value, payments received and what is still outstanding." },
      { property: "og:title", content: "Projects · SoloCRM" },
      { property: "og:description", content: "Client projects with deadlines, value, payments and outstanding balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

export function projectFields(customers: Customer[]) {
  return [
    { name: "name", label: "Project name", required: true },
    {
      name: "customer_id",
      label: "Customer",
      type: "select" as const,
      required: true,
      options: customers.map((c) => ({ value: c.id, label: c.name })),
    },
    { name: "service", label: "Service" },
    { name: "description", label: "Description", type: "textarea" as const },
    { name: "start_date", label: "Start date", type: "date" as const },
    { name: "deadline", label: "Deadline", type: "date" as const },
    {
      name: "status",
      label: "Status",
      type: "select" as const,
      required: true,
      options: PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      name: "priority",
      label: "Priority",
      type: "select" as const,
      required: true,
      options: TASK_PRIORITIES.map((s) => ({ value: s.value, label: s.label })),
    },
    { name: "project_value", label: "Project value", type: "number" as const },
  ];
}

function ProjectsPage() {
  const invalidate = useInvalidate();
  const { data: projects = [], isLoading, error } = useList<Project>("projects", {
    order: { column: "created_at" },
  });
  const { data: customers = [] } = useList<Customer>("customers", { select: "id,name", key: ["mini"] });
  const { data: payments = [] } = useList<Payment>("payments", { key: ["all"] });

  const [status, setStatus] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const paidFor = (id: string) =>
    payments
      .filter((p) => p.project_id === id && (p.status === "PAID" || p.status === "PARTIAL"))
      .reduce((s, p) => s + Number(p.amount), 0);

  const filtered = status === "ALL" ? projects : projects.filter((p) => p.status === status);
  const totalValue = projects.reduce((s, p) => s + Number(p.project_value ?? 0), 0);
  const totalPaid = projects.reduce((s, p) => s + paidFor(p.id), 0);

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Delivery tracking for the work you have won."
        actions={
          <Button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            disabled={customers.length === 0}
          >
            <Plus className="size-4" /> Add project
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Projects" value={projects.length} />
        <KpiCard label="Active" value={projects.filter((p) => ["PLANNING", "IN_PROGRESS", "REVIEW"].includes(p.status)).length} tone="accent" />
        <KpiCard label="Total value" value={formatMoney(totalValue)} />
        <KpiCard label="Outstanding" value={formatMoney(Math.max(0, totalValue - totalPaid))} tone="warning" />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {["ALL", ...PROJECT_STATUSES.map((s) => s.value)].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "ALL" ? "All" : labelOf(PROJECT_STATUSES, s as any)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={customers.length === 0 ? "Add a customer first" : "No projects here"}
          description={
            customers.length === 0
              ? "Projects belong to a customer. Convert a won lead or add a customer to get started."
              : "Create a project to track delivery, tasks and payments."
          }
          icon={<FolderKanban className="size-6" />}
          action={
            customers.length === 0 ? (
              <Button size="sm" asChild><Link to="/customers">Go to customers</Link></Button>
            ) : (
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add project</Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const paid = paidFor(p.id);
            const value = Number(p.project_value ?? 0);
            const pct = value ? Math.min(100, Math.round((paid / value) * 100)) : 0;
            const late = p.deadline && new Date(p.deadline) < new Date() && p.status !== "COMPLETED";
            return (
              <Surface key={p.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/projects/$projectId" params={{ projectId: p.id }} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {customers.find((c) => c.id === p.customer_id)?.name ?? "No customer"} · {p.service ?? "—"}
                    </p>
                  </div>
                  <StatusPill label={labelOf(PROJECT_STATUSES, p.status)} tone={toneOf(PROJECT_STATUSES, p.status)} />
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(paid)} received of {formatMoney(value)} · {formatMoney(Math.max(0, value - paid))} outstanding
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Start {formatDate(p.start_date)}</span>
                  <span>Deadline {formatDate(p.deadline)}</span>
                  {late && <StatusPill label="Past deadline" tone="danger" />}
                  <StatusPill label={labelOf(TASK_PRIORITIES, p.priority)} tone={toneOf(TASK_PRIORITIES, p.priority)} />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/projects/$projectId" params={{ projectId: p.id }}>Open</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setDialogOpen(true); }}>Edit</Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(p)} aria-label="Delete project">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit project" : "Add project"}
        fields={projectFields(customers)}
        initial={editing ?? { status: "PLANNING", priority: "MEDIUM" }}
        onSubmit={async (v) => {
          const payload = {
            name: v.name,
            customer_id: v.customer_id,
            service: v.service || null,
            description: v.description || null,
            start_date: v.start_date || null,
            deadline: v.deadline || null,
            status: v.status,
            priority: v.priority,
            project_value: v.project_value === "" || v.project_value == null ? 0 : Number(v.project_value),
          };
          if (editing) await updateRow("projects", editing.id, payload);
          else await insertRow("projects", payload);
          toast.success(editing ? "Project updated" : "Project created");
          invalidate("projects", "dashboard");
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ""}?`}
        description="Tasks, files and payments linked to this project will also be removed."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          if (toDelete) await deleteRow("projects", toDelete.id);
          setToDelete(null);
          toast.success("Project deleted");
          invalidate("projects", "payments", "dashboard");
        }}
      />
    </div>
  );
}
