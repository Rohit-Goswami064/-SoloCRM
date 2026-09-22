/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard, PageHeader, EmptyState, LoadingRows, Surface } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import {
  LEAD_STATUSES,
  PIPELINE_STATUSES,
  formatMoney,
  formatDateTime,
  labelOf,
  toneOf,
  waLink,
} from "@/lib/crm/constants";
import { useInvalidate, updateRow, logActivity } from "@/lib/crm/db";
import { useIsAdmin, useTeam } from "@/lib/crm/roles";
import { CallerDashboard } from "@/components/crm/CallerDashboard";
import { Phone, MessageCircle, Check, AlarmClock, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · SoloCRM" },
      { name: "description", content: "Your daily CRM action centre: follow-ups due, hot leads, pipeline value and revenue at a glance." },
      { property: "og:title", content: "Dashboard · SoloCRM" },
      { property: "og:description", content: "Follow-ups due, hot leads, pipeline value and revenue at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const db = supabase as any;
      const now = new Date();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const [leads, customers, projects, payments, followUps, sources, categories] =
        await Promise.all([
          db.from("leads").select("id,name,company,phone,whatsapp,status,temperature,deal_value,source_id,category_id,created_at,last_contact_at,assigned_to"),
          db.from("customers").select("id"),
          db.from("projects").select("id,status,project_value"),
          db.from("payments").select("amount,status"),
          db
            .from("follow_ups")
            .select("id,due_at,type,status,notes,lead_id")
            .eq("status", "PENDING")
            .order("due_at", { ascending: true }),
          db.from("lead_sources").select("id,name"),
          db.from("lead_categories").select("id,name"),
        ]);

      const allLeads = (leads.data ?? []) as any[];
      const fu = (followUps.data ?? []) as any[];
      const leadById = new Map(allLeads.map((l) => [l.id, l]));
      const sourceById = new Map((sources.data ?? []).map((s: any) => [s.id, s.name]));
      const categoryById = new Map((categories.data ?? []).map((c: any) => [c.id, c.name]));

      const count = (fn: (l: any) => boolean) => allLeads.filter(fn).length;
      const openStatuses = ["WON", "LOST", "NOT_INTERESTED"];
      const pipelineValue = allLeads
        .filter((l) => !openStatuses.includes(l.status))
        .reduce((s, l) => s + Number(l.deal_value ?? 0), 0);
      const revenueWon = allLeads
        .filter((l) => l.status === "WON")
        .reduce((s, l) => s + Number(l.deal_value ?? 0), 0);

      const paid = (payments.data ?? [])
        .filter((p: any) => p.status === "PAID")
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      const pendingPayments = (payments.data ?? [])
        .filter((p: any) => p.status === "PENDING" || p.status === "PARTIAL")
        .reduce((s: number, p: any) => s + Number(p.amount), 0);

      const byMonth: Record<string, { month: string; leads: number; qualified: number; proposals: number; won: number; lost: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("en-IN", { month: "short" });
        byMonth[key] = { month: key, leads: 0, qualified: 0, proposals: 0, won: 0, lost: 0 };
      }
      allLeads.forEach((l) => {
        const key = new Date(l.created_at).toLocaleString("en-IN", { month: "short" });
        const row = byMonth[key];
        if (!row) return;
        row.leads++;
        if (l.status === "QUALIFIED") row.qualified++;
        if (l.status === "PROPOSAL_SENT") row.proposals++;
        if (l.status === "WON") row.won++;
        if (l.status === "LOST") row.lost++;
      });

      const tally = (getKey: (l: any) => string) => {
        const map = new Map<string, number>();
        allLeads.forEach((l) => {
          const k = getKey(l);
          map.set(k, (map.get(k) ?? 0) + 1);
        });
        return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      };

      return {
        kpis: {
          total: allLeads.length,
          newLeads: count((l) => l.status === "NEW"),
          contacted: count((l) => l.status === "CONTACTED"),
          hot: count((l) => l.temperature === "HOT"),
          qualified: count((l) => l.status === "QUALIFIED"),
          converted: (customers.data ?? []).length,
          activeProjects: (projects.data ?? []).filter((p: any) =>
            ["PLANNING", "IN_PROGRESS", "REVIEW"].includes(p.status),
          ).length,
          pipelineValue,
          revenueWon,
          paid,
          pendingPayments,
          dueToday: fu.filter(
            (f) => new Date(f.due_at) >= startOfDay && new Date(f.due_at) <= endOfDay,
          ).length,
          overdue: fu.filter((f) => new Date(f.due_at) < startOfDay).length,
        },
        pipeline: PIPELINE_STATUSES.concat(["NOT_INTERESTED", "FOLLOW_UP_LATER"] as any).map((s) => ({
          status: s,
          count: allLeads.filter((l) => l.status === s).length,
          value: allLeads.filter((l) => l.status === s).reduce((a, l) => a + Number(l.deal_value ?? 0), 0),
        })),
        todays: fu
          .filter((f) => new Date(f.due_at) >= startOfDay && new Date(f.due_at) <= endOfDay)
          .map((f) => ({ ...f, lead: leadById.get(f.lead_id) })),
        overdue: fu
          .filter((f) => new Date(f.due_at) < startOfDay)
          .map((f) => ({ ...f, lead: leadById.get(f.lead_id) })),
        recent: [...allLeads]
          .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
          .slice(0, 6),
        sourceChart: tally((l) => String(sourceById.get(l.source_id) ?? "Unassigned")).slice(0, 8),
        categoryChart: tally((l) => String(categoryById.get(l.category_id) ?? "Uncategorised")).slice(0, 8),
        callerTally: tally((l) => String(l.assigned_to ?? "unassigned")),
        monthly: Object.values(byMonth),
      };
    },
  });
}

function FollowUpRow({ f, overdue }: { f: any; overdue?: boolean }) {
  const invalidate = useInvalidate();
  const lead = f.lead;
  const complete = async () => {
    await updateRow("follow_ups", f.id, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    });
    if (lead) {
      await logActivity({
        type: "FOLLOW_UP",
        title: "Follow-up completed",
        lead_id: lead.id,
        body: f.notes ?? undefined,
      });
      await updateRow("leads", lead.id, { last_contact_at: new Date().toISOString() });
    }
    toast.success("Follow-up marked complete");
    invalidate("dashboard", "follow_ups", "leads");
  };
  const reschedule = async () => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await updateRow("follow_ups", f.id, { status: "RESCHEDULED" });
    if (lead) {
      const { insertRow } = await import("@/lib/crm/db");
      await insertRow("follow_ups", {
        lead_id: lead.id,
        due_at: next.toISOString(),
        type: f.type,
        notes: f.notes,
        status: "PENDING",
      });
      await updateRow("leads", lead.id, { next_follow_up: next.toISOString() });
    }
    toast.success("Rescheduled to tomorrow");
    invalidate("dashboard", "follow_ups", "leads");
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {lead ? (
            <Link to="/leads/$leadId" params={{ leadId: lead.id }} className="font-medium hover:underline">
              {lead.name}
            </Link>
          ) : (
            <span className="font-medium">Follow-up</span>
          )}
          {overdue && <StatusPill label="Overdue" tone="danger" icon={<AlarmClock className="size-3" />} />}
          {lead && (
            <StatusPill label={labelOf(LEAD_STATUSES, lead.status)} tone={toneOf(LEAD_STATUSES, lead.status)} />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[lead?.company, lead?.phone].filter(Boolean).join(" · ")} · Due {formatDateTime(f.due_at)}
          {lead?.last_contact_at ? ` · Last contact ${formatDateTime(lead.last_contact_at)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {lead?.phone && (
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${lead.phone}`}>
              <Phone className="size-3.5" /> Call
            </a>
          </Button>
        )}
        {waLink(lead?.whatsapp || lead?.phone) && (
          <Button asChild size="sm" variant="outline">
            <a href={waLink(lead?.whatsapp || lead?.phone)!} target="_blank" rel="noreferrer">
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
          </Button>
        )}
        <Button size="sm" onClick={complete}>
          <Check className="size-3.5" /> Done
        </Button>
        <Button size="sm" variant="ghost" onClick={reschedule}>
          Reschedule
        </Button>
      </div>
    </div>
  );
}

function Dashboard() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <LoadingRows rows={6} />;
  return isAdmin ? <AdminDashboard /> : <CallerDashboard />;
}

function LeadsByCaller({ tally }: { tally: { name: string; value: number }[] }) {
  const { data: team = [] } = useTeam();
  const nameOf = (id: string) =>
    id === "unassigned"
      ? "Unassigned"
      : (team.find((t) => t.id === id)?.full_name ?? "Removed caller");
  return (
    <Surface>
      <h2 className="mb-3 text-sm font-semibold">Leads by caller</h2>
      {tally.length === 0 ? (
        <EmptyState title="No leads yet" description="Import or add leads, then assign them to a caller." />
      ) : (
        <ul className="divide-y divide-border">
          {tally.map((row) => (
            <li key={row.name} className="flex items-center justify-between py-2 text-sm">
              <span>{nameOf(row.name)}</span>
              <span className="tabular-nums text-muted-foreground">{row.value} leads</span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

function AdminDashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <LoadingRows rows={8} />;
  if (error) return <p className="text-sm text-destructive">Could not load the dashboard.</p>;
  if (!data) return null;
  const k = data.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Everything that needs your attention today."
        actions={
          <Button asChild>
            <Link to="/import">
              <Upload className="size-4" /> Import leads
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total Leads" value={k.total} to="/leads" />
        <KpiCard label="New" value={k.newLeads} to="/leads" search={{ status: "NEW" }} tone="accent" />
        <KpiCard label="Contacted" value={k.contacted} to="/leads" search={{ status: "CONTACTED" }} />
        <KpiCard label="Hot Leads" value={k.hot} to="/leads" search={{ temperature: "HOT" }} tone="danger" />
        <KpiCard label="Qualified" value={k.qualified} to="/leads" search={{ status: "QUALIFIED" }} />
        <KpiCard label="Customers" value={k.converted} to="/customers" tone="success" />
        <KpiCard label="Follow-up Due" value={k.dueToday} to="/follow-ups" search={{ view: "today" }} tone="warning" />
        <KpiCard label="Overdue" value={k.overdue} to="/follow-ups" search={{ view: "overdue" }} tone="danger" />
        <KpiCard label="Active Projects" value={k.activeProjects} to="/projects" />
        <KpiCard label="Pipeline Value" value={formatMoney(k.pipelineValue)} to="/pipeline" tone="accent" />
        <KpiCard label="Revenue Won" value={formatMoney(k.revenueWon)} to="/reports" tone="success" />
        <KpiCard label="Pending Payments" value={formatMoney(k.pendingPayments)} to="/payments" tone="warning" />
      </div>

      <Surface>
        <h2 className="mb-3 text-sm font-semibold">Lead pipeline</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {data.pipeline.map((p) => (
            <Link
              key={p.status}
              to="/leads"
              search={{ status: p.status } as never}
              className="rounded-lg border border-border p-3 transition-colors hover:border-primary/50"
            >
              <p className="text-xs text-muted-foreground">{labelOf(LEAD_STATUSES, p.status as any)}</p>
              <p className="text-lg font-semibold tabular-nums">{p.count}</p>
              <p className="text-[11px] text-muted-foreground">{formatMoney(p.value)}</p>
            </Link>
          ))}
        </div>
      </Surface>

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface>
          <h2 className="mb-3 text-sm font-semibold">Today&apos;s follow-ups</h2>
          {data.todays.length === 0 ? (
            <EmptyState title="No follow-ups today 🎉" description="Schedule one from any lead." />
          ) : (
            <div className="space-y-2">
              {data.todays.map((f: any) => (
                <FollowUpRow key={f.id} f={f} />
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <h2 className="mb-3 text-sm font-semibold text-destructive">Overdue follow-ups</h2>
          {data.overdue.length === 0 ? (
            <EmptyState title="Nothing overdue" description="You are on top of your pipeline." />
          ) : (
            <div className="space-y-2">
              {data.overdue.map((f: any) => (
                <FollowUpRow key={f.id} f={f} overdue />
              ))}
            </div>
          )}
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface>
          <h2 className="mb-3 text-sm font-semibold">Lead sources</h2>
          {data.sourceChart.length === 0 ? (
            <EmptyState title="No leads yet" description="Import your Excel file to add your first leads." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.sourceChart} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.sourceChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Surface>

        <Surface>
          <h2 className="mb-3 text-sm font-semibold">Category distribution</h2>
          {data.categoryChart.length === 0 ? (
            <EmptyState title="No categories used yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.categoryChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" />
                <RTooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="value" fill="var(--color-chart-1)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Surface>
      </div>

      <LeadsByCaller tally={data.callerTally} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface>
          <h2 className="mb-3 text-sm font-semibold">Monthly conversion</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" />
              <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" />
              <RTooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
              <Bar dataKey="leads" fill="var(--color-chart-1)" radius={3} />
              <Bar dataKey="qualified" fill="var(--color-chart-2)" radius={3} />
              <Bar dataKey="proposals" fill="var(--color-chart-4)" radius={3} />
              <Bar dataKey="won" fill="var(--color-chart-3)" radius={3} />
              <Bar dataKey="lost" fill="var(--color-chart-5)" radius={3} />
            </BarChart>
          </ResponsiveContainer>
        </Surface>

        <Surface>
          <h2 className="mb-3 text-sm font-semibold">Recent leads</h2>
          {data.recent.length === 0 ? (
            <EmptyState
              title="No leads yet"
              description="Import your Excel file to add your first leads."
              action={
                <Button asChild size="sm">
                  <Link to="/import">Import leads</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.recent.map((l: any) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.company, l.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatusPill label={labelOf(LEAD_STATUSES, l.status)} tone={toneOf(LEAD_STATUSES, l.status)} />
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>

      <Surface>
        <h2 className="mb-3 text-sm font-semibold">Revenue</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Potential revenue" value={formatMoney(k.pipelineValue)} tone="accent" />
          <KpiCard label="Won revenue" value={formatMoney(k.revenueWon)} tone="success" />
          <KpiCard label="Collected" value={formatMoney(k.paid)} tone="success" />
          <KpiCard label="Pending payments" value={formatMoney(k.pendingPayments)} tone="warning" />
        </div>
      </Surface>
    </div>
  );
}
