/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, LoadingRows, ErrorState, EmptyState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { ConfirmDialog } from "@/components/crm/FormDialog";
import {
  LEAD_STATUSES,
  PIPELINE_STATUSES,
  TEMPERATURES,
  formatMoney,
  labelOf,
  toneOf,
} from "@/lib/crm/constants";
import {
  changeLeadStatus,
  convertLeadToCustomer,
  useInvalidate,
  useLeads,
  type Lead,
} from "@/lib/crm/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Sales pipeline · SoloCRM" },
      { name: "description", content: "Drag leads between pipeline stages from New to Won and see the value at each stage." },
      { property: "og:title", content: "Sales pipeline · SoloCRM" },
      { property: "og:description", content: "Drag leads between pipeline stages from New to Won." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pipeline,
});

function Pipeline() {
  const invalidate = useInvalidate();
  const { data, isLoading, error } = useLeads({ pageSize: 500, page: 1, stage: "MAIN" });
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [pending, setPending] = useState<{ lead: Lead; status: string } | null>(null);

  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <ErrorState error={error} />;
  const leads = data?.rows ?? [];

  const apply = async () => {
    if (!pending) return;
    if (pending.status === "WON") {
      await convertLeadToCustomer(pending.lead);
      toast.success("Lead won and converted to a customer");
    } else {
      await changeLeadStatus(pending.lead, pending.status);
      toast.success("Stage updated");
    }
    setPending(null);
    invalidate("leads", "lead", "dashboard", "customers");
  };

  return (
    <div>
      <PageHeader
        title="Sales pipeline"
        description="Drag a lead onto another stage. Every change is confirmed and recorded in the timeline."
      />
      {leads.length === 0 ? (
        <EmptyState title="Your pipeline is empty" description="Add or import leads to see them here." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STATUSES.map((status) => {
            const column = leads.filter((l) => l.status === status);
            const value = column.reduce((s, l) => s + Number(l.deal_value ?? 0), 0);
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging && dragging.status !== status) setPending({ lead: dragging, status });
                  setDragging(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/60 p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <StatusPill label={labelOf(LEAD_STATUSES, status)} tone={toneOf(LEAD_STATUSES, status)} />
                  <span className="text-xs text-muted-foreground tabular-nums">{column.length}</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground tabular-nums">{formatMoney(value)}</p>
                <div className="space-y-2">
                  {column.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      Drop leads here
                    </p>
                  )}
                  {column.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragging(l)}
                      className="cursor-grab rounded-lg border border-border bg-card p-3 active:cursor-grabbing"
                    >
                      <Link to="/leads/$leadId" params={{ leadId: l.id }} className="text-sm font-medium hover:underline">
                        {l.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{l.company ?? "No company"}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StatusPill
                          label={labelOf(TEMPERATURES, l.temperature)}
                          tone={toneOf(TEMPERATURES, l.temperature)}
                        />
                        <span className="text-xs tabular-nums">{formatMoney(l.deal_value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(v) => !v && setPending(null)}
        title="Move this lead?"
        description={
          pending
            ? pending.status === "WON"
              ? `${pending.lead.name} will be marked Won and converted into a customer.`
              : `${pending.lead.name} moves to ${labelOf(LEAD_STATUSES, pending.status as any)}. This is recorded in the activity timeline.`
            : ""
        }
        confirmLabel="Move lead"
        onConfirm={apply}
      />
    </div>
  );
}
