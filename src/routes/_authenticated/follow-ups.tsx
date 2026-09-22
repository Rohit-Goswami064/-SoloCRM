/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { FollowUpDialog } from "@/components/crm/FollowUpDialog";
import { Button } from "@/components/ui/button";
import {
  FOLLOWUP_STATUSES,
  formatDateTime,
  labelOf,
  toneOf,
  waLink,
} from "@/lib/crm/constants";
import { insertRow, logActivity, updateRow, useInvalidate } from "@/lib/crm/db";
import { CalendarClock, Check, MessageCircle, Phone, SkipForward } from "lucide-react";
import { toast } from "sonner";

type View = "today" | "tomorrow" | "week" | "overdue" | "upcoming" | "completed";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: (typeof s['view'] === "string" ? s['view'] : "today") as View,
  }),
  head: () => ({
    meta: [
      { title: "Follow-ups · SoloCRM" },
      { name: "description", content: "Today, tomorrow, this week, overdue and upcoming follow-ups in one action centre." },
      { property: "og:title", content: "Follow-ups · SoloCRM" },
      { property: "og:description", content: "Today, tomorrow, overdue and upcoming follow-ups in one action centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FollowUpsPage,
});

const VIEWS: { key: View; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

function useFollowUps() {
  return useQuery({
    queryKey: ["follow_ups", "all"],
    queryFn: async () => {
      const db = supabase as any;
      const [fu, leads] = await Promise.all([
        db.from("follow_ups").select("*").order("due_at", { ascending: true }),
        db.from("leads").select("id,name,company,phone,whatsapp,status"),
      ]);
      if (fu.error) throw fu.error;
      const leadById = new Map((leads.data ?? []).map((l: any) => [l.id, l]));
      return (fu.data ?? []).map((f: any) => ({ ...f, lead: leadById.get(f.lead_id) }));
    },
  });
}

function inRange(d: Date, from: Date, to: Date) {
  return d >= from && d <= to;
}

function FollowUpsPage() {
  const { view } = Route.useSearch();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data = [], isLoading, error } = useFollowUps();
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  const startTomorrow = new Date(startToday.getTime() + 86400000);
  const endTomorrow = new Date(endToday.getTime() + 86400000);
  const endWeek = new Date(endToday.getTime() + 6 * 86400000);

  const filtered = data.filter((f: any) => {
    const due = new Date(f.due_at);
    const pending = f.status === "PENDING";
    switch (view) {
      case "today":
        return pending && inRange(due, startToday, endToday);
      case "tomorrow":
        return pending && inRange(due, startTomorrow, endTomorrow);
      case "week":
        return pending && inRange(due, startToday, endWeek);
      case "overdue":
        return pending && due < startToday;
      case "upcoming":
        return pending && due > endToday;
      case "completed":
        return f.status !== "PENDING";
      default:
        return true;
    }
  });

  const counts = (v: View) =>
    data.filter((f: any) => {
      const due = new Date(f.due_at);
      const pending = f.status === "PENDING";
      if (v === "today") return pending && inRange(due, startToday, endToday);
      if (v === "tomorrow") return pending && inRange(due, startTomorrow, endTomorrow);
      if (v === "week") return pending && inRange(due, startToday, endWeek);
      if (v === "overdue") return pending && due < startToday;
      if (v === "upcoming") return pending && due > endToday;
      return f.status !== "PENDING";
    }).length;

  const complete = async (f: any) => {
    await updateRow("follow_ups", f.id, { status: "COMPLETED", completed_at: new Date().toISOString() });
    if (f.lead_id) {
      await logActivity({ type: "FOLLOW_UP", title: "Follow-up completed", body: f.notes, lead_id: f.lead_id });
      await updateRow("leads", f.lead_id, { last_contact_at: new Date().toISOString() });
    }
    toast.success("Completed. Schedule the next step?");
    invalidate("follow_ups", "leads", "dashboard");
    setScheduleFor(f.lead_id ?? null);
  };

  const skip = async (f: any) => {
    await updateRow("follow_ups", f.id, { status: "SKIPPED" });
    toast.success("Follow-up skipped");
    invalidate("follow_ups", "dashboard");
  };

  const snooze = async (f: any) => {
    const next = new Date(Date.now() + 86400000);
    await updateRow("follow_ups", f.id, { status: "RESCHEDULED" });
    await insertRow("follow_ups", {
      lead_id: f.lead_id,
      customer_id: f.customer_id,
      due_at: next.toISOString(),
      type: f.type,
      notes: f.notes,
      status: "PENDING",
    });
    if (f.lead_id) await updateRow("leads", f.lead_id, { next_follow_up: next.toISOString() });
    toast.success("Moved to tomorrow");
    invalidate("follow_ups", "leads", "dashboard");
  };

  return (
    <div>
      <PageHeader title="Follow-ups" description="Your action centre — never lose a conversation." />

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button
            key={v.key}
            size="sm"
            variant={view === v.key ? "default" : "outline"}
            onClick={() => navigate({ to: "/follow-ups", search: { view: v.key } })}
          >
            {v.label}
            <span className="ml-1 tabular-nums opacity-70">{counts(v.key)}</span>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="Schedule follow-ups from any lead to build your daily action list."
          icon={<CalendarClock className="size-6" />}
        />
      ) : (
        <Surface className="space-y-2">
          {filtered.map((f: any) => {
            const overdue = f.status === "PENDING" && new Date(f.due_at) < startToday;
            return (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {f.lead ? (
                      <Link to="/leads/$leadId" params={{ leadId: f.lead.id }} className="font-medium hover:underline">
                        {f.lead.name}
                      </Link>
                    ) : (
                      <span className="font-medium">Follow-up</span>
                    )}
                    <StatusPill label={f.type} tone="info" />
                    <StatusPill
                      label={overdue ? "Overdue" : labelOf(FOLLOWUP_STATUSES, f.status)}
                      tone={overdue ? "danger" : toneOf(FOLLOWUP_STATUSES, f.status)}
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDateTime(f.due_at)}
                    {f.lead?.company ? ` · ${f.lead.company}` : ""}
                    {f.notes ? ` · ${f.notes}` : ""}
                  </p>
                </div>
                {f.status === "PENDING" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {f.lead?.phone && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${f.lead.phone}`}><Phone className="size-3.5" /> Call</a>
                      </Button>
                    )}
                    {waLink(f.lead?.whatsapp || f.lead?.phone) && (
                      <Button asChild size="sm" variant="outline">
                        <a href={waLink(f.lead?.whatsapp || f.lead?.phone)!} target="_blank" rel="noreferrer">
                          <MessageCircle className="size-3.5" /> WhatsApp
                        </a>
                      </Button>
                    )}
                    <Button size="sm" onClick={() => complete(f)}><Check className="size-3.5" /> Done</Button>
                    <Button size="sm" variant="ghost" onClick={() => snooze(f)}>Tomorrow</Button>
                    <Button size="sm" variant="ghost" onClick={() => skip(f)}>
                      <SkipForward className="size-3.5" /> Skip
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </Surface>
      )}

      <FollowUpDialog
        open={!!scheduleFor}
        onOpenChange={(v) => !v && setScheduleFor(null)}
        leadId={scheduleFor}
        onSaved={() => invalidate("follow_ups", "leads", "dashboard")}
      />
    </div>
  );
}
