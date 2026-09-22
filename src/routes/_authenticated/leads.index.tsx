/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { LeadDialog } from "@/components/crm/LeadDialog";
import { ConfirmDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LEAD_STATUSES,
  TEMPERATURES,
  formatDate,
  formatDateTime,
  formatMoney,
  labelOf,
  toneOf,
  waLink,
} from "@/lib/crm/constants";
import {
  deleteRows,
  logActivity,
  logAudit,
  updateRow,
  useCategories,
  useInvalidate,
  useLeads,
  useSources,
  type Lead,
} from "@/lib/crm/db";
import {
  Download,
  Filter,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCallers, useIsAdmin } from "@/lib/crm/roles";

type LeadSearch = {
  status?: string | undefined;
  temperature?: string | undefined;
  source?: string | undefined;
  category?: string | undefined;
  caller?: string | undefined;
  q?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (s: Record<string, unknown>): LeadSearch => ({
    status: typeof s['status'] === "string" ? s['status'] : undefined,
    temperature: typeof s['temperature'] === "string" ? s['temperature'] : undefined,
    source: typeof s['source'] === "string" ? s['source'] : undefined,
    category: typeof s['category'] === "string" ? s['category'] : undefined,
    caller: typeof s['caller'] === "string" ? s['caller'] : undefined,
    q: typeof s['q'] === "string" ? s['q'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Leads · SoloCRM" },
      { name: "description", content: "Search, filter, score and manage every lead in your pipeline." },
      { property: "og:title", content: "Leads · SoloCRM" },
      { property: "og:description", content: "Search, filter, score and manage every lead in your pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.error("Nothing to export");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();
  const { isAdmin } = useIsAdmin();
  const { data: callers = [] } = useCallers();

  const [q, setQ] = useState(search.q ?? "");
  const [debounced, setDebounced] = useState(search.q ?? "");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ column: "created_at", asc: false });
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = {
    search: debounced,
    status: search.status ? [search.status] : undefined,
    temperature: search.temperature ? [search.temperature] : undefined,
    sourceId: search.source ?? null,
    categoryId: search.category ?? null,
    assignedTo: search.caller ?? null,
    page,
    pageSize: 25,
    sort,
  };
  const { data, isLoading, error } = useLeads(filters);
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const setSearchParam = (patch: Partial<LeadSearch>) => {
    setPage(1);
    navigate({ to: "/leads", search: { ...search, ...patch } as never });
  };

  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? "-";
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "-";
  const callerName = (id: string | null) =>
    id ? (callers.find((c) => c.id === id)?.full_name ?? "Caller") : "Unassigned";

  const allChecked = rows.length > 0 && selected.length === rows.length;

  const bulkUpdate = async (patch: Record<string, any>, label: string) => {
    for (const id of selected) {
      const lead = rows.find((r) => r.id === id);
      await updateRow("leads", id, patch);
      if (patch['status'] && lead) {
        await logActivity({
          type: "STATUS_CHANGE",
          title: `Status changed to ${String(patch['status']).replaceAll("_", " ")}`,
          body: `Bulk update from ${lead.status}`,
          lead_id: id,
        });
      }
    }
    await logAudit("BULK_UPDATE", "lead", null, { ids: selected, patch });
    toast.success(`${selected.length} leads updated — ${label}`);
    setSelected([]);
    invalidate("leads", "dashboard");
  };

  const bulkDelete = async () => {
    await deleteRows("leads", selected);
    await logAudit("BULK_DELETE", "lead", null, { ids: selected });
    toast.success(`${selected.length} leads deleted`);
    setSelected([]);
    invalidate("leads", "dashboard");
  };

  const exportCsv = () =>
    downloadCsv(
      `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((l) => ({
        Name: l.name,
        Company: l.company,
        Phone: l.phone,
        WhatsApp: l.whatsapp,
        Email: l.email,
        City: l.city,
        Category: categoryName(l.category_id),
        Source: sourceName(l.source_id),
        Status: l.status,
        Temperature: l.temperature,
        "Deal Value": l.deal_value,
        "Last Contact": l.last_contact_at,
        "Next Follow-up": l.next_follow_up,
        Created: l.created_at,
      })),
    );

  const activeFilters =
    !!search.status || !!search.temperature || !!search.source || !!search.category;

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Leads" : "My leads"}
        description={
          isAdmin
            ? `${total} lead${total === 1 ? "" : "s"} in your database`
            : `${total} lead${total === 1 ? "" : "s"} assigned to you`
        }
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={exportCsv}>
                <Download className="size-4" /> Export
              </Button>
              <Button variant="outline" asChild>
                <Link to="/import">
                  <Upload className="size-4" /> Import
                </Link>
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" /> Add lead
              </Button>
            </>
          ) : null
        }
      />

      <Surface className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, company, phone, email or city…"
              className="pl-9"
            />
          </div>
          <Button variant={showFilters || activeFilters ? "default" : "outline"} onClick={() => setShowFilters((v) => !v)}>
            <Filter className="size-4" /> Filters
          </Button>
        </div>

        {(showFilters || activeFilters) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={search.status ?? "all"} onValueChange={(v) => setSearchParam({ status: v === "all" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={search.temperature ?? "all"} onValueChange={(v) => setSearchParam({ temperature: v === "all" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="Temperature" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All temperatures</SelectItem>
                {TEMPERATURES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={search.source ?? "all"} onValueChange={(v) => setSearchParam({ source: v === "all" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={search.category ?? "all"} onValueChange={(v) => setSearchParam({ category: v === "all" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select
                value={search.caller ?? "all"}
                onValueChange={(v) => setSearchParam({ caller: v === "all" ? undefined : v })}
              >
                <SelectTrigger><SelectValue placeholder="Caller" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All callers</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {callers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={`${sort.column}:${sort.asc}`}
              onValueChange={(v) => {
                const [column, asc] = v.split(":");
                setSort({ column: column!, asc: asc === "true" });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at:false">Newest first</SelectItem>
                <SelectItem value="created_at:true">Oldest first</SelectItem>
                <SelectItem value="name:true">Name A–Z</SelectItem>
                <SelectItem value="deal_value:false">Highest deal value</SelectItem>
                <SelectItem value="next_follow_up:true">Next follow-up</SelectItem>
              </SelectContent>
            </Select>
            {activeFilters && (
              <Button variant="ghost" onClick={() => navigate({ to: "/leads", search: {} as never })}>
                <X className="size-4" /> Clear filters
              </Button>
            )}
          </div>
        )}
      </Surface>

      {selected.length > 0 && (
        <Surface className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Change status</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {LEAD_STATUSES.map((s) => (
                <DropdownMenuItem key={s.value} onClick={() => bulkUpdate({ status: s.value }, s.label)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Set source</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              {sources.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => bulkUpdate({ source_id: s.id }, s.name)}>
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Set category</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => bulkUpdate({ category_id: c.id }, c.name)}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Assign caller</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-y-auto">
                <DropdownMenuItem onClick={() => bulkUpdate({ assigned_to: null }, "Unassigned")}>
                  Unassigned
                </DropdownMenuItem>
                {callers.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => bulkUpdate({ assigned_to: c.id }, c.full_name ?? c.email ?? "caller")}
                  >
                    {c.full_name ?? c.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {isAdmin && (
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </Surface>
      )}

      {isLoading ? (
        <LoadingRows rows={8} />
      ) : error ? (
        <ErrorState error={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No leads found"
          description={
            debounced || activeFilters
              ? "Try a different search or clear your filters."
              : "Add your first lead or import an Excel/CSV file."
          }
          action={
            <div className="flex gap-2">
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="size-4" /> Add lead
              </Button>
              <Button variant="outline" asChild>
                <Link to="/import">Import file</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Temp</th>
                  {isAdmin && <th className="px-3 py-2">Caller</th>}
                  <th className="px-3 py-2 text-right">Deal value</th>
                  <th className="px-3 py-2">Next follow-up</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.includes(l.id)}
                        onCheckedChange={(c) =>
                          setSelected((s) => (c ? [...s, l.id] : s.filter((x) => x !== l.id)))
                        }
                        aria-label={`Select ${l.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link to="/leads/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.company ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="tabular-nums">{l.phone ?? "-"}</span>
                        {l.phone && (
                          <a href={`tel:${l.phone}`} className="text-muted-foreground hover:text-primary" aria-label="Call">
                            <Phone className="size-3.5" />
                          </a>
                        )}
                        {waLink(l.whatsapp || l.phone) && (
                          <a
                            href={waLink(l.whatsapp || l.phone)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-success"
                            aria-label="WhatsApp"
                          >
                            <MessageCircle className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.city ?? "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{categoryName(l.category_id)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{sourceName(l.source_id)}</td>
                    <td className="px-3 py-2">
                      <StatusPill label={labelOf(LEAD_STATUSES, l.status)} tone={toneOf(LEAD_STATUSES, l.status)} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill label={labelOf(TEMPERATURES, l.temperature)} tone={toneOf(TEMPERATURES, l.temperature)} />
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-muted-foreground">{callerName(l.assigned_to)}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.deal_value)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(l.next_follow_up)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(l.created_at)}</td>
                    <td className="px-3 py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{l.name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link to="/leads/$leadId" params={{ leadId: l.id }}>View details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(l); setDialogOpen(true); }}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => { setSelected([l.id]); setConfirmDelete(true); }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {rows.map((l) => (
              <div key={l.id} className="card-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {[l.company, l.city].filter(Boolean).join(" · ") || "No company"}
                    </p>
                  </div>
                  <Checkbox
                    checked={selected.includes(l.id)}
                    onCheckedChange={(c) =>
                      setSelected((s) => (c ? [...s, l.id] : s.filter((x) => x !== l.id)))
                    }
                    aria-label={`Select ${l.name}`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusPill label={labelOf(LEAD_STATUSES, l.status)} tone={toneOf(LEAD_STATUSES, l.status)} />
                  <StatusPill label={labelOf(TEMPERATURES, l.temperature)} tone={toneOf(TEMPERATURES, l.temperature)} />
                  <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(l.deal_value)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  {l.phone && (
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <a href={`tel:${l.phone}`}><Phone className="size-3.5" /> Call</a>
                    </Button>
                  )}
                  {waLink(l.whatsapp || l.phone) && (
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <a href={waLink(l.whatsapp || l.phone)!} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-3.5" /> WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Page {page} of {pages} · {total} leads
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={editing}
        onSaved={() => invalidate("leads", "dashboard")}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selected.length} lead${selected.length === 1 ? "" : "s"}?`}
        description="This permanently removes the lead and its related follow-ups, tasks and activity. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={bulkDelete}
      />
    </div>
  );
}
