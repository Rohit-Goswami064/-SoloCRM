/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState, KpiCard } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { FileManager } from "@/components/crm/FileManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectFields } from "./projects.index";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDate,
  formatDateTime,
  formatMoney,
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
  type Activity,
  type Customer,
  type Note,
  type Payment,
  type Task,
} from "@/lib/crm/db";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project details · SoloCRM" },
      { name: "description", content: "Tasks, notes, files, payments and the delivery timeline for this project." },
      { property: "og:title", content: "Project details · SoloCRM" },
      { property: "og:description", content: "Tasks, notes, files, payments and the delivery timeline for this project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: customers = [] } = useList<Customer>("customers", { select: "id,name", key: ["mini"] });
  const { data: tasks = [] } = useList<Task>("tasks", {
    key: ["project", projectId],
    order: { column: "due_date", asc: true },
    filters: (q) => q.eq("project_id", projectId),
  });
  const { data: payments = [] } = useList<Payment>("payments", {
    key: ["project", projectId],
    order: { column: "payment_date" },
    filters: (q) => q.eq("project_id", projectId),
  });
  const { data: notes = [] } = useList<Note>("notes", {
    key: ["project", projectId],
    order: { column: "created_at" },
    filters: (q) => q.eq("project_id", projectId),
  });
  const { data: activities = [] } = useList<Activity>("lead_activities", {
    key: ["project", projectId],
    order: { column: "occurred_at" },
    filters: (q) => q.eq("project_id", projectId),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [overpay, setOverpay] = useState<any>(null);

  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <ErrorState error={error} />;
  if (!project)
    return (
      <EmptyState
        title="Project not found"
        action={<Button asChild><Link to="/projects">Back to projects</Link></Button>}
      />
    );

  const value = Number(project.project_value ?? 0);
  const paid = payments
    .filter((p) => p.status === "PAID" || p.status === "PARTIAL")
    .reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(0, value - paid);
  const refresh = () => invalidate("project", "projects", "tasks", "payments", "notes", "lead_activities", "dashboard");

  const savePayment = async (v: any) => {
    const amount = Number(v.amount);
    const duplicate = payments.find(
      (p) =>
        Number(p.amount) === amount &&
        p.payment_date === v.payment_date &&
        (p.reference ?? "") === (v.reference ?? ""),
    );
    if (duplicate) throw new Error("A payment with the same amount, date and reference already exists.");
    await insertRow("payments", {
      customer_id: project.customer_id,
      project_id: project.id,
      amount,
      payment_date: v.payment_date,
      method: v.method || null,
      reference: v.reference || null,
      notes: v.notes || null,
      status: v.status,
    });
    await logActivity({
      type: "PAYMENT",
      title: `Payment recorded: ${formatMoney(amount)}`,
      project_id: project.id,
      customer_id: project.customer_id,
    });
    toast.success("Payment recorded");
    refresh();
  };

  const paymentFields = [
    { name: "amount", label: "Amount", type: "number" as const, required: true },
    { name: "payment_date", label: "Payment date", type: "date" as const, required: true },
    {
      name: "status",
      label: "Status",
      type: "select" as const,
      required: true,
      options: PAYMENT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      name: "method",
      label: "Method",
      type: "select" as const,
      options: PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
    },
    { name: "reference", label: "Reference" },
    { name: "notes", label: "Notes", type: "textarea" as const },
  ];

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/projects"><ArrowLeft className="size-4" /> All projects</Link>
      </Button>

      <PageHeader
        title={project.name}
        description={`${customers.find((c) => c.id === project.customer_id)?.name ?? "No customer"} · ${project.service ?? "No service"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="size-4" /> Edit</Button>
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Status" value={labelOf(PROJECT_STATUSES, project.status)} />
        <KpiCard label="Value" value={formatMoney(value)} />
        <KpiCard label="Received" value={formatMoney(paid)} tone="success" />
        <KpiCard label="Outstanding" value={formatMoney(outstanding)} tone={outstanding ? "warning" : "success"} />
        <KpiCard label="Deadline" value={formatDate(project.deadline)} />
      </div>

      {project.description && (
        <Surface>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </Surface>
      )}

      <Tabs defaultValue="tasks">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <Surface className="space-y-2">
            <Button size="sm" onClick={() => setTaskOpen(true)}><Plus className="size-4" /> Add task</Button>
            {tasks.length === 0 ? (
              <EmptyState title="No tasks yet" description="Break the project into steps you can tick off." />
            ) : (
              tasks.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDateTime(t.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill label={labelOf(TASK_PRIORITIES, t.priority)} tone={toneOf(TASK_PRIORITIES, t.priority)} />
                    <StatusPill label={labelOf(TASK_STATUSES, t.status)} tone={toneOf(TASK_STATUSES, t.status)} />
                    {t.status !== "COMPLETED" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await updateRow("tasks", t.id, { status: "COMPLETED" });
                          toast.success("Task completed");
                          refresh();
                        }}
                      >
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Surface className="space-y-2">
            <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="size-4" /> Record payment</Button>
            {payments.length === 0 ? (
              <EmptyState title="No payments recorded" description="Balances are always calculated from recorded payments." />
            ) : (
              payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium tabular-nums">{formatMoney(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)} · {p.method ?? "—"} {p.reference ? `· ${p.reference}` : ""}
                    </p>
                  </div>
                  <StatusPill label={labelOf(PAYMENT_STATUSES, p.status)} tone={toneOf(PAYMENT_STATUSES, p.status)} />
                </div>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Surface className="space-y-2">
            <Button size="sm" onClick={() => setNoteOpen(true)}><Plus className="size-4" /> Add note</Button>
            {notes.length === 0 ? (
              <EmptyState title="No notes yet" />
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Surface><FileManager projectId={project.id} /></Surface>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Surface>
            {activities.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill label={a.type.replaceAll("_", " ")} tone="info" />
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(a.occurred_at)}</span>
                    </div>
                    {a.body && <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Surface>
        </TabsContent>
      </Tabs>

      <FormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit project"
        fields={projectFields(customers)}
        initial={project}
        onSubmit={async (v) => {
          const before = project.status;
          await updateRow("projects", project.id, {
            name: v.name,
            customer_id: v.customer_id,
            service: v.service || null,
            description: v.description || null,
            start_date: v.start_date || null,
            deadline: v.deadline || null,
            status: v.status,
            priority: v.priority,
            project_value: v.project_value === "" ? 0 : Number(v.project_value),
          });
          if (before !== v.status) {
            await logActivity({
              type: "STATUS_CHANGE",
              title: `Project status changed to ${labelOf(PROJECT_STATUSES, v.status)}`,
              project_id: project.id,
            });
          }
          toast.success("Project updated");
          refresh();
        }}
      />

      <FormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="Add project task"
        fields={[
          { name: "title", label: "Title", required: true, colSpan: 2 },
          { name: "description", label: "Description", type: "textarea" },
          { name: "due_date", label: "Due", type: "datetime-local" },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            required: true,
            options: TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
          },
        ]}
        initial={{ priority: "MEDIUM" }}
        onSubmit={async (v) => {
          await insertRow("tasks", {
            title: v.title,
            description: v.description || null,
            project_id: project.id,
            customer_id: project.customer_id,
            due_date: v.due_date ? new Date(v.due_date).toISOString() : null,
            priority: v.priority,
            status: "TODO",
          });
          toast.success("Task added");
          refresh();
        }}
      />

      <FormDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Add note"
        fields={[{ name: "body", label: "Note", type: "textarea", required: true }]}
        onSubmit={async (v) => {
          await insertRow("notes", { project_id: project.id, customer_id: project.customer_id, body: v.body });
          toast.success("Note added");
          refresh();
        }}
      />

      <FormDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Record payment"
        description={`${formatMoney(outstanding)} outstanding on this project.`}
        fields={paymentFields}
        initial={{ status: "PAID", payment_date: new Date().toISOString().slice(0, 10) }}
        validate={(v) => {
          if (Number(v.amount) <= 0) return "Amount must be greater than zero.";
          return null;
        }}
        onSubmit={async (v) => {
          if (Number(v.amount) > outstanding && (v.status === "PAID" || v.status === "PARTIAL")) {
            setOverpay(v);
            setPayOpen(false);
            return;
          }
          await savePayment(v);
        }}
      />

      <ConfirmDialog
        open={!!overpay}
        onOpenChange={(v) => !v && setOverpay(null)}
        title="Payment is more than the outstanding balance"
        description={`You are recording ${formatMoney(Number(overpay?.['amount'] ?? 0))} against ${formatMoney(outstanding)} outstanding. Record it anyway?`}
        confirmLabel="Record payment"
        onConfirm={async () => {
          if (overpay) {
            try {
              await savePayment(overpay);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not record payment");
            }
          }
          setOverpay(null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${project.name}?`}
        description="Tasks, notes, files and payments for this project are removed too."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          await deleteRow("projects", project.id);
          toast.success("Project deleted");
          navigate({ to: "/projects" });
        }}
      />
    </div>
  );
}
