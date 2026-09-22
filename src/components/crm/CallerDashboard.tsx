/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard, PageHeader, Surface, EmptyState, LoadingRows } from "./Common";
import { StatusPill } from "./StatusPill";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUSES, formatDateTime, labelOf, toneOf, waLink } from "@/lib/crm/constants";
import { changeLeadStatus, updateRow, logActivity, useCategories } from "@/lib/crm/db";
import { useMe } from "@/lib/crm/roles";
import { Phone, MessageCircle, StickyNote, CalendarClock, Check } from "lucide-react";
import { toast } from "sonner";

function useMyDay(userId: string | undefined) {
  return useQuery({
    queryKey: ["caller-day", userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = supabase as any;
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const [leadsRes, fuRes, notesRes] = await Promise.all([
        db.from("leads").select("*").eq("assigned_to", userId).order("next_follow_up", { ascending: true }),
        db
          .from("follow_ups")
          .select("id,lead_id,due_at,type,notes,status")
          .eq("status", "PENDING")
          .order("due_at", { ascending: true }),
        db
          .from("lead_activities")
          .select("lead_id,title,body,occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(300),
      ]);

      const leads = (leadsRes.data ?? []) as any[];
      const lastNote = new Map<string, string>();
      ((notesRes.data ?? []) as any[]).forEach((a) => {
        if (a.lead_id && !lastNote.has(a.lead_id)) lastNote.set(a.lead_id, a.body || a.title);
      });

      const pending = ((fuRes.data ?? []) as any[]).filter((f) =>
        leads.some((l) => l.id === f.lead_id),
      );
      const now = Date.now();
      const overdue = pending.filter((f) => new Date(f.due_at).getTime() < now);
      const today = pending.filter(
        (f) =>
          new Date(f.due_at).getTime() >= now &&
          new Date(f.due_at).getTime() <= endOfDay.getTime(),
      );

      return {
        leads,
        lastNote,
        overdue,
        today,
        kpis: {
          total: leads.length,
          interested: leads.filter((l) => l.status === "INTERESTED").length,
          won: leads.filter((l) => l.status === "WON").length,
          hot: leads.filter((l) => l.temperature === "HOT").length,
        },
      };
    },
  });
}

export function CallerDashboard() {
  const { data: me } = useMe();
  const { data, isLoading } = useMyDay(me?.userId);
  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();
  const [noteFor, setNoteFor] = useState<any>(null);
  const [followUpFor, setFollowUpFor] = useState<any>(null);

  const refresh = () => void qc.invalidateQueries();
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "-";

  if (isLoading || !data) return <LoadingRows rows={6} />;

  const callList = [...data.overdue, ...data.today];
  const leadOf = (id: string) => data.leads.find((l) => l.id === id);

  const completeFollowUp = async (fu: any) => {
    await updateRow("follow_ups", fu.id, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    });
    if (fu.lead_id) {
      await updateRow("leads", fu.lead_id, {
        last_contact_at: new Date().toISOString(),
        next_follow_up: null,
      });
      await logActivity({ type: "FOLLOW_UP", title: "Follow-up completed", lead_id: fu.lead_id });
    }
    toast.success("Follow-up completed");
    refresh();
  };

  return (
    <div>
      <PageHeader
        title={`Hi ${me?.fullName?.split(" ")[0] ?? "there"}`}
        description="Your calls for today. Tap a lead to call, message or log what happened."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="My leads" value={data.kpis.total} to="/leads" />
        <KpiCard label="Today's follow-ups" value={data.today.length} tone="accent" />
        <KpiCard label="Overdue" value={data.overdue.length} tone="danger" />
        <KpiCard label="Interested" value={data.kpis.interested} tone="warning" />
        <KpiCard label="Won" value={data.kpis.won} tone="success" />
      </div>

      <h2 className="mb-2 text-base font-semibold">Today's calls</h2>
      {callList.length === 0 ? (
        <EmptyState
          title="Nothing due right now"
          description="No follow-ups are due today. You can still work through your lead list."
          action={
            <Button asChild>
              <Link to="/leads">Open my leads</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {callList.map((fu) => {
            const lead = leadOf(fu.lead_id);
            if (!lead) return null;
            const late = new Date(fu.due_at).getTime() < Date.now();
            return (
              <Surface key={fu.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: lead.id }}
                      className="text-base font-semibold hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {lead.company ?? "-"} · {categoryName(lead.category_id)}
                    </p>
                    <p className="mt-1 tabular-nums text-sm">{lead.phone ?? "No phone"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill
                      label={labelOf(LEAD_STATUSES, lead.status)}
                      tone={toneOf(LEAD_STATUSES, lead.status)}
                    />
                    <StatusPill
                      label={`${late ? "Overdue" : "Due"} ${formatDateTime(fu.due_at)}`}
                      tone={late ? "danger" : "warning"}
                    />
                  </div>
                </div>

                {data.lastNote.get(lead.id) && (
                  <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Last note: {data.lastNote.get(lead.id)}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Button asChild size="lg" disabled={!lead.phone} className="h-12">
                    <a href={`tel:${lead.phone ?? ""}`}>
                      <Phone className="size-4" /> Call
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-12">
                    <a
                      href={waLink(lead.whatsapp || lead.phone) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" className="h-12" onClick={() => setNoteFor(lead)}>
                    <StickyNote className="size-4" /> Note
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12"
                    onClick={() => setFollowUpFor(lead)}
                  >
                    <CalendarClock className="size-4" /> Follow-up
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-12"
                    onClick={() => void completeFollowUp(fu)}
                  >
                    <Check className="size-4" /> Done
                  </Button>
                </div>

                <Select
                  value={lead.status}
                  onValueChange={async (v) => {
                    await changeLeadStatus(lead, v);
                    toast.success("Status updated");
                    refresh();
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Surface>
            );
          })}
        </div>
      )}

      {noteFor && (
        <QuickNoteDialog
          open={!!noteFor}
          onOpenChange={(o) => !o && setNoteFor(null)}
          leadId={noteFor.id}
          leadName={noteFor.name}
          onSaved={refresh}
        />
      )}
      {followUpFor && (
        <FollowUpDialog
          open={!!followUpFor}
          onOpenChange={(o) => !o && setFollowUpFor(null)}
          leadId={followUpFor.id}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
