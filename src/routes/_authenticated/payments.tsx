/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState, KpiCard } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FormDialog, ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "./leads.index";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  formatDate,
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
  type Customer,
  type Payment,
  type Project,
} from "@/lib/crm/db";
import { Download, IndianRupee, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments · SoloCRM" },
      { name: "description", content: "Record client payments, track what is collected and see outstanding balances per project." },
      { property: "og:title", content: "Payments · SoloCRM" },
      { property: "og:description", content: "Record payments, track collections and outstanding balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const invalidate = useInvalidate();
  const { data: payments = [], isLoading, error } = useList<Payment>("payments", {
    order: { column: "payment_date" },
  });
  const { data: customers = [] } = useList<Customer>("customers", { select: "id,name", key: ["mini"] });
  const { data: projects = [] } = useList<Project>("projects", { key: ["all"] });

  const [status, setStatus] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [toDelete, setToDelete] = useState<Payment | null>(null);
  const [overpay, setOverpay] = useState<any>(null);

  const filtered = status === "ALL" ? payments : payments.filter((p) => p.status === status);
  const sum = (s: string) =>
    payments.filter((p) => p.status === s).reduce((a, p) => a + Number(p.amount), 0);

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? "—";
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";

  const outstandingFor = (projectId?: string | null) => {
    if (!projectId) return Infinity;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return Infinity;
    const paid = payments
      .filter((p) => p.project_id === projectId && p.id !== editing?.id && (p.status === "PAID" || p.status === "PARTIAL"))
      .reduce((s, p) => s + Number(p.amount), 0);
    return Math.max(0, Number(project.project_value ?? 0) - paid);
  };

  const fields = [
    {
      name: "customer_id",
      label: "Customer",
      type: "select" as const,
      required: true,
      options: customers.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "project_id",
      label: "Project",
      type: "select" as const,
      options: projects.map((p) => ({ value: p.id, label: p.name })),
    },
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

  const save = async (v: any) => {
    const amount = Number(v.amount);
    const payload = {
      customer_id: v.customer_id,
      project_id: v.project_id || null,
      amount,
      payment_date: v.payment_date,
      status: v.status,
      method: v.method || null,
      reference: v.reference || null,
      notes: v.notes || null,
    };
    const duplicate = payments.find(
      (p) =>
        p.id !== editing?.id &&
        Number(p.amount) === amount &&
        p.payment_date === v.payment_date &&
        p.customer_id === v.customer_id &&
        (p.reference ?? "") === (v.reference ?? ""),
    );
    if (duplicate) throw new Error("An identical payment already exists for this customer and date.");
    if (editing) await updateRow("payments", editing.id, payload);
    else await insertRow("payments", payload);
    await logActivity({
      type: "PAYMENT",
      title: `${editing ? "Payment updated" : "Payment recorded"}: ${formatMoney(amount)}`,
      customer_id: v.customer_id,
      project_id: v.project_id || null,
    });
    toast.success(editing ? "Payment updated" : "Payment recorded");
    invalidate("payments", "projects", "dashboard");
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Balances are always calculated from these records — they are never typed in by hand."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `payments-${new Date().toISOString().slice(0, 10)}.csv`,
                  filtered.map((p) => ({
                    Customer: customerName(p.customer_id),
                    Project: projectName(p.project_id),
                    Amount: p.amount,
                    Date: p.payment_date,
                    Method: p.method,
                    Reference: p.reference,
                    Status: p.status,
                  })),
                )
              }
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }} disabled={customers.length === 0}>
              <Plus className="size-4" /> Record payment
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Collected" value={formatMoney(sum("PAID"))} tone="success" />
        <KpiCard label="Partial" value={formatMoney(sum("PARTIAL"))} tone="warning" />
        <KpiCard label="Pending" value={formatMoney(sum("PENDING"))} tone="warning" />
        <KpiCard label="Refunded" value={formatMoney(sum("REFUNDED"))} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {["ALL", ...PAYMENT_STATUSES.map((s) => s.value)].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "ALL" ? "All" : labelOf(PAYMENT_STATUSES, s as any)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No payments recorded"
          description={customers.length === 0 ? "Add a customer first, then record their payments." : "Record your first payment to start tracking revenue."}
          icon={<IndianRupee className="size-6" />}
        />
      ) : (
        <Surface className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">{formatMoney(p.amount)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {customerName(p.customer_id)} · {projectName(p.project_id)} · {formatDate(p.payment_date)}
                  {p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusPill label={labelOf(PAYMENT_STATUSES, p.status)} tone={toneOf(PAYMENT_STATUSES, p.status)} />
                <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setDialogOpen(true); }}>Edit</Button>
                <Button size="icon" variant="ghost" onClick={() => setToDelete(p)} aria-label="Delete payment">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </Surface>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit payment" : "Record payment"}
        fields={fields}
        initial={editing ?? { status: "PAID", payment_date: new Date().toISOString().slice(0, 10) }}
        validate={(v) => (Number(v.amount) > 0 ? null : "Amount must be greater than zero.")}
        onSubmit={async (v) => {
          const limit = outstandingFor(v.project_id);
          if ((v.status === "PAID" || v.status === "PARTIAL") && Number(v.amount) > limit) {
            setOverpay(v);
            setDialogOpen(false);
            return;
          }
          await save(v);
        }}
      />

      <ConfirmDialog
        open={!!overpay}
        onOpenChange={(v) => !v && setOverpay(null)}
        title="Payment is more than the outstanding balance"
        description={`You are recording ${formatMoney(Number(overpay?.['amount'] ?? 0))} against ${formatMoney(outstandingFor(overpay?.['project_id']))} outstanding on that project. Record it anyway?`}
        confirmLabel="Record payment"
        onConfirm={async () => {
          if (overpay) {
            try {
              await save(overpay);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not record payment");
            }
          }
          setOverpay(null);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this payment?"
        description="Project balances will be recalculated. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (toDelete) await deleteRow("payments", toDelete.id);
          setToDelete(null);
          toast.success("Payment deleted");
          invalidate("payments", "projects", "dashboard");
        }}
      />
    </div>
  );
}
