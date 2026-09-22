/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminOnly } from "@/components/crm/AdminOnly";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, Surface, EmptyState, KpiCard, LoadingRows } from "@/components/crm/Common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv } from "./leads.index";
import { LEAD_STATUSES, formatMoney, labelOf } from "@/lib/crm/constants";
import {
  useCategories,
  useList,
  useSources,
  type Customer,
  type FollowUp,
  type Lead,
  type Payment,
} from "@/lib/crm/db";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports · SoloCRM" },
      { name: "description", content: "See which sources convert, how your pipeline is moving and what revenue is still outstanding." },
      { property: "og:title", content: "Reports · SoloCRM" },
      { property: "og:description", content: "Source performance, pipeline movement, revenue and outstanding payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <ReportsPage />
    </AdminOnly>
  ),
});

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "this", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

const COLORS = ["#2563EB", "#06B6D4", "#22C55E", "#F59E0B", "#EF4444", "#94A3B8", "#8B5CF6", "#14B8A6"];

function rangeBounds(key: string, from: string, to: string): [Date, Date] {
  const now = new Date();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return [start, end];
    case "7":
    case "30":
    case "90":
      start.setDate(start.getDate() - Number(key));
      return [start, end];
    case "this":
      return [new Date(now.getFullYear(), now.getMonth(), 1), end];
    case "last":
      return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)];
    case "custom":
      return [from ? new Date(from) : new Date(2000, 0, 1), to ? new Date(`${to}T23:59:59`) : end];
    default:
      return [new Date(2000, 0, 1), end];
  }
}

function ReportsPage() {
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: leads = [], isLoading } = useList<Lead>("leads", { key: ["report"], order: { column: "created_at" } });
  const { data: payments = [] } = useList<Payment>("payments", { key: ["report"] });
  const { data: customers = [] } = useList<Customer>("customers", { key: ["report"] });
  const { data: followUps = [] } = useList<FollowUp>("follow_ups", { key: ["report"] });
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();

  const [start, end] = rangeBounds(range, from, to);
  const within = (d?: string | null) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  };

  const rLeads = useMemo(() => leads.filter((l) => within(l.created_at)), [leads, range, from, to]);
  const rPayments = useMemo(() => payments.filter((p) => within(p.payment_date)), [payments, range, from, to]);
  const rCustomers = useMemo(() => customers.filter((c) => within(c.created_at)), [customers, range, from, to]);
  const rFollowUps = useMemo(() => followUps.filter((f) => within(f.due_at)), [followUps, range, from, to]);

  const won = rLeads.filter((l) => l.status === "WON");
  const lost = rLeads.filter((l) => l.status === "LOST" || l.status === "NOT_INTERESTED");
  const revenue = rPayments.filter((p) => p.status === "PAID").reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = payments
    .filter((p) => p.status === "PENDING" || p.status === "PARTIAL")
    .reduce((s, p) => s + Number(p.amount), 0);
  const pipelineValue = rLeads
    .filter((l) => !["WON", "LOST", "NOT_INTERESTED"].includes(l.status))
    .reduce((s, l) => s + Number(l.deal_value ?? 0), 0);
  const conversion = rLeads.length ? Math.round((won.length / rLeads.length) * 100) : 0;

  const bySource = sources
    .map((s) => ({
      name: s.name,
      leads: rLeads.filter((l) => l.source_id === s.id).length,
      won: rLeads.filter((l) => l.source_id === s.id && l.status === "WON").length,
    }))
    .filter((r) => r.leads > 0)
    .sort((a, b) => b.leads - a.leads);

  const byCategory = categories
    .map((c) => ({ name: c.name, value: rLeads.filter((l) => l.category_id === c.id).length }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const funnel = LEAD_STATUSES.filter((s) => !["LOST", "NOT_INTERESTED", "FOLLOW_UP_LATER"].includes(s.value)).map((s) => ({
    name: s.label,
    value: rLeads.filter((l) => l.status === s.value).length,
  }));

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; leads: number; customers: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      map.set(key, { month: key, leads: 0, customers: 0 });
    }
    const keyOf = (v: string) =>
      new Date(v).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    leads.forEach((l) => {
      const e = map.get(keyOf(l.created_at));
      if (e) e.leads++;
    });
    customers.forEach((c) => {
      const e = map.get(keyOf(c.created_at));
      if (e) e.customers++;
    });
    return [...map.values()];
  }, [leads, customers]);

  const fuCompleted = rFollowUps.filter((f) => f.status === "COMPLETED").length;
  const fuOverdue = rFollowUps.filter((f) => f.status === "PENDING" && new Date(f.due_at) < new Date()).length;
  const fuRate = rFollowUps.length ? Math.round((fuCompleted / rFollowUps.length) * 100) : 0;

  const exportAll = () =>
    downloadCsv(`report-${new Date().toISOString().slice(0, 10)}.csv`, [
      { Metric: "New leads", Value: rLeads.length },
      { Metric: "Won", Value: won.length },
      { Metric: "Lost", Value: lost.length },
      { Metric: "Conversion rate %", Value: conversion },
      { Metric: "Revenue collected", Value: revenue },
      { Metric: "Outstanding payments", Value: outstanding },
      { Metric: "Open pipeline value", Value: pipelineValue },
      { Metric: "New customers", Value: rCustomers.length },
      { Metric: "Follow-ups completed", Value: fuCompleted },
      { Metric: "Follow-ups overdue", Value: fuOverdue },
      ...bySource.map((s) => ({ Metric: `Source: ${s.name}`, Value: `${s.leads} leads / ${s.won} won` })),
    ]);

  const chartTooltip = {
    contentStyle: {
      background: "oklch(0.24 0.03 264)",
      border: "1px solid oklch(0.32 0.03 264)",
      borderRadius: 8,
      color: "#F8FAFC",
      fontSize: 12,
    },
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Everything below is calculated live from your CRM data."
        actions={<Button variant="outline" onClick={exportAll}><Download className="size-4" /> Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {RANGES.map((r) => (
          <Button key={r.key} size="sm" variant={range === r.key ? "default" : "outline"} onClick={() => setRange(r.key)}>
            {r.label}
          </Button>
        ))}
        {range === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="New leads" value={rLeads.length} />
            <KpiCard label="Won" value={won.length} tone="success" />
            <KpiCard label="Conversion rate" value={`${conversion}%`} tone="accent" />
            <KpiCard label="Lost" value={lost.length} tone="danger" />
            <KpiCard label="Revenue collected" value={formatMoney(revenue)} tone="success" />
            <KpiCard label="Outstanding" value={formatMoney(outstanding)} tone="warning" />
            <KpiCard label="Open pipeline" value={formatMoney(pipelineValue)} />
            <KpiCard label="New customers" value={rCustomers.length} tone="accent" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface>
              <h2 className="mb-3 text-sm font-semibold">Leads by source</h2>
              {bySource.length === 0 ? (
                <EmptyState title="No leads in this period" description="Try a wider date range." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={bySource}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 264)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} interval={0} angle={-20} height={50} textAnchor="end" />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="leads" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="won" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Surface>

            <Surface>
              <h2 className="mb-3 text-sm font-semibold">Leads by category</h2>
              {byCategory.length === 0 ? (
                <EmptyState title="No categorised leads yet" description="Set a category on your leads to see this split." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Surface>

            <Surface>
              <h2 className="mb-3 text-sm font-semibold">Conversion funnel</h2>
              <div className="space-y-2">
                {funnel.map((f) => {
                  const max = Math.max(1, ...funnel.map((x) => x.value));
                  return (
                    <div key={f.name}>
                      <div className="flex justify-between text-xs">
                        <span>{f.name}</span>
                        <span className="tabular-nums text-muted-foreground">{f.value}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${(f.value / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Surface>

            <Surface>
              <h2 className="mb-3 text-sm font-semibold">Leads and customers over 6 months</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 264)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...chartTooltip} />
                  <Line type="monotone" dataKey="leads" stroke="#2563EB" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="customers" stroke="#06B6D4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Surface>
          </div>

          <Surface>
            <h2 className="mb-3 text-sm font-semibold">Follow-up performance</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Scheduled" value={rFollowUps.length} />
              <KpiCard label="Completed" value={fuCompleted} tone="success" />
              <KpiCard label="Overdue" value={fuOverdue} tone="danger" />
              <KpiCard label="Completion rate" value={`${fuRate}%`} tone="accent" />
            </div>
          </Surface>

          <Surface>
            <h2 className="mb-3 text-sm font-semibold">Won vs lost by status</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LEAD_STATUSES.map((s) => (
                <div key={s.value} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{labelOf(LEAD_STATUSES, s.value)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {rLeads.filter((l) => l.status === s.value).length}
                  </span>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
