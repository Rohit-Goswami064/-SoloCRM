/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDateTime,
  labelOf,
  toneOf,
} from "@/lib/crm/constants";
import {
  deleteRow,
  insertRow,
  logActivity,
  updateRow,
  useInvalidate,
  useList,
  type Customer,
  type Lead,
  type Project,
  type Task,
} from "@/lib/crm/db";
import { ListTodo, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · SoloCRM" },
      { name: "description", content: "Track today's, overdue and upcoming tasks linked to leads, customers and projects." },
      { property: "og:title", content: "Tasks · SoloCRM" },
      { property: "og:description", content: "Track today's, overdue and upcoming tasks across your work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

type View = "today" | "overdue" | "upcoming" | "all" | "completed";

function TasksPage() {
  const invalidate = useInvalidate();
  const { data: tasks = [], isLoading, error } = useList<Task>("tasks", {
    order: { column: "due_date", asc: true },
  });
  const { data: leads = [] } = useList<Lead>("leads", { select: "id,name", key: ["mini"] });
  const { data: customers = [] } = useList<Customer>("customers", { select: "id,name", key: ["mini"] });
  const { data: projects = [] } = useList<Project>("projects", { select: "id,name", key: ["mini"] });

  const [view, setView] = useState<View>("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const match = (t: Task, v: View) => {
    const open = t.status === "TODO" || t.status === "IN_PROGRESS";
    const due = t.due_date ? new Date(t.due_date) : null;
    if (v === "all") return true;
    if (v === "completed") return t.status === "COMPLETED" || t.status === "CANCELLED";
    if (!open) return false;
    if (v === "today") return !!due && due >= start && due <= end;
    if (v === "overdue") return !!due && due < start;
    return !due || due > end;
  };

  const filtered = tasks.filter((t) => match(t, view));
  const refresh = () => invalidate("tasks", "dashboard");

  const fields = [
    { name: "title", label: "Title", required: true, colSpan: 2 as const },
    { name: "description", label: "Description", type: "textarea" as const },
    { name: "due_date", label: "Due", type: "datetime-local" as const },
    {
      name: "priority",
      label: "Priority",
      type: "select" as const,
      required: true,
      options: TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
    },
    {
      name: "status",
      label: "Status",
      type: "select" as const,
      required: true,
      options: TASK_STATUSES.map((p) => ({ value: p.value, label: p.label })),
    },
    { name: "category", label: "Category" },
    {
      name: "lead_id",
      label: "Related lead",
      type: "select" as const,
      options: leads.map((l) => ({ value: l.id, label: l.name ?? l.company ?? "Lead" })),
    },
    {
      name: "customer_id",
      label: "Related customer",
      type: "select" as const,
      options: customers.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "project_id",
      label: "Related project",
      type: "select" as const,
      options: projects.map((p) => ({ value: p.id, label: p.name })),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Everything you owe your leads, customers and projects."
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-4" /> Add task
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "overdue", "upcoming", "all", "completed"] as View[]).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
            <span className="capitalize">{v}</span>
            <span className="ml-1 tabular-nums opacity-70">{tasks.filter((t) => match(t, v)).length}</span>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No tasks here"
          description="Add a task to keep track of what needs doing."
          icon={<ListTodo className="size-6" />}
          action={<Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>Add task</Button>}
        />
      ) : (
        <Surface className="space-y-2">
          {filtered.map((t) => {
            const overdue = t.due_date && new Date(t.due_date) < start && t.status !== "COMPLETED";
            const lead = leads.find((l) => l.id === t.lead_id);
            const project = projects.find((p) => p.id === t.project_id);
            return (
              <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.due_date ? `Due ${formatDateTime(t.due_date)}` : "No due date"}
                    {lead ? " · " : ""}
                    {lead && (
                      <Link to="/leads/$leadId" params={{ leadId: lead.id }} className="hover:underline">
                        {lead.name}
                      </Link>
                    )}
                    {project ? ` · ${project.name}` : ""}
                    {t.description ? ` · ${t.description}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {overdue && <StatusPill label="Overdue" tone="danger" />}
                  <StatusPill label={labelOf(TASK_PRIORITIES, t.priority)} tone={toneOf(TASK_PRIORITIES, t.priority)} />
                  <StatusPill label={labelOf(TASK_STATUSES, t.status)} tone={toneOf(TASK_STATUSES, t.status)} />
                  {t.status !== "COMPLETED" && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await updateRow("tasks", t.id, { status: "COMPLETED" });
                        if (t.lead_id) await logActivity({ type: "TASK", title: `Task completed: ${t.title}`, lead_id: t.lead_id });
                        toast.success("Task completed");
                        refresh();
                      }}
                    >
                      Complete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                    Edit
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(t)} aria-label="Delete task">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Surface>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit task" : "Add task"}
        fields={fields}
        initial={
          editing
            ? {
                ...editing,
                due_date: editing.due_date ? new Date(editing.due_date).toISOString().slice(0, 16) : "",
              }
            : { priority: "MEDIUM", status: "TODO" }
        }
        onSubmit={async (v) => {
          const payload = {
            title: v.title,
            description: v.description || null,
            due_date: v.due_date ? new Date(v.due_date).toISOString() : null,
            priority: v.priority,
            status: v.status,
            category: v.category || null,
            lead_id: v.lead_id || null,
            customer_id: v.customer_id || null,
            project_id: v.project_id || null,
          };
          if (editing) await updateRow("tasks", editing.id, payload);
          else await insertRow("tasks", payload);
          toast.success(editing ? "Task updated" : "Task added");
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this task?"
        description={`"${toDelete?.title ?? ""}" will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (toDelete) await deleteRow("tasks", toDelete.id);
          setToDelete(null);
          toast.success("Task deleted");
          refresh();
        }}
      />
    </div>
  );
}
