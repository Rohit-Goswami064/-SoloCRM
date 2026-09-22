/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { QualifyDialog, DispositionDialog } from "@/components/crm/QualifyDialog";
import { FollowUpDialog } from "@/components/crm/FollowUpDialog";
import { QuickNoteDialog } from "@/components/crm/QuickNoteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUALIFICATION_STATUSES,
  formatDate,
  labelOf,
  toneOf,
  waLink,
} from "@/lib/crm/constants";
import { useCategories, useInvalidate, useLeads, useSources, type Lead } from "@/lib/crm/db";
import { useCallers, useIsAdmin } from "@/lib/crm/roles";
import {
  BadgeCheck,
  CalendarClock,
  MessageCircle,
  Phone,
  PhoneOff,
  Search,
  StickyNote,
  Upload,
  XCircle,
} from "lucide-react";

type IncomingSearch = {
  stage?: string | undefined;
  qualification?: string | undefined;
  caller?: string | undefined;
  source?: string | undefined;
  category?: string | undefined;
  importId?: string | undefined;
  q?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/incoming")({
  validateSearch: (s: Record<string, unknown>): IncomingSearch => ({
    stage: typeof s['stage'] === "string" ? s['stage'] : undefined,
    qualification: typeof s['qualification'] === "string" ? s['qualification'] : undefined,
    caller: typeof s['caller'] === "string" ? s['caller'] : undefined,
    source: typeof s['source'] === "string" ? s['source'] : undefined,
    category: typeof s['category'] === "string" ? s['category'] : undefined,
    importId: typeof s['importId'] === "string" ? s['importId'] : undefined,
    q: typeof s['q'] === "string" ? s['q'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Incoming leads · SoloCRM" },
      { name: "description", content: "Newly imported leads waiting to be called and qualified." },
      { property: "og:title", content: "Incoming leads · SoloCRM" },
      { property: "og:description", content: "Newly imported leads waiting to be called and qualified." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IncomingPage,
});

const TABS: { value: string; label: string }[] = [
  { value: "INCOMING", label: "Incoming" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "INVALID", label: "Invalid" },
];

function IncomingPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { isAdmin } = useIsAdmin();
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();
  const { data: callers = [] } = useCallers();

  const stage = search.stage ?? "INCOMING";
  const [q, setQ] = useState(search.q ?? "");
  const [debounced, setDebounced] = useState(search.q ?? "");
  const [page, setPage] = useState(1);
  const [qualifyFor, setQualifyFor] = useState<Lead | null>(null);
  const [noteFor, setNoteFor] = useState<Lead | null>(null);
  const [followUpFor, setFollowUpFor] = useState<Lead | null>(null);
  const [disposition, setDisposition] = useState<{
    lead: Lead;
    outcome: "NOT_INTERESTED" | "INVALID" | "NO_RESPONSE";
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, error } = useLeads({
    search: debounced,
    stage,
    qualification: search.qualification ?? undefined,
    importId: search.importId ?? undefined,
    sourceId: search.source ?? null,
    categoryId: search.category ?? null,
    assignedTo: search.caller ?? null,
    page,
    pageSize: 25,
    sort: { column: "created_at", asc: false },
  });
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const setParam = (patch: Partial<IncomingSearch>) => {
    setPage(1);
    navigate({ to: "/incoming", search: { ...search, ...patch } as never });
  };

  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? "-";
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "-";
  const callerName = (id: string | null) =>
    id ? (callers.find((c) => c.id === id)?.full_name ?? "Caller") : "Unassigned";

  const refresh = () => invalidate("leads", "dashboard", "caller-day");

  const actions = (lead: Lead) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Button asChild size="lg" className="h-11" disabled={!lead.phone}>
        <a href={`tel:${lead.phone ?? ""}`}>
          <Phone className="size-4" /> Call
        </a>
      </Button>
      <Button asChild size="lg" variant="outline" className="h-11">
        <a href={waLink(lead.whatsapp || lead.phone) ?? "#"} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" /> WhatsApp
        </a>
      </Button>
      <Button size="lg" variant="secondary" className="h-11" onClick={() => setQualifyFor(lead)}>
        <BadgeCheck className="size-4" /> Qualify
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="h-11"
        onClick={() => setDisposition({ lead, outcome: "NO_RESPONSE" })}
      >
        <PhoneOff className="size-4" /> No response
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="h-11"
        onClick={() => setDisposition({ lead, outcome: "NOT_INTERESTED" })}
      >
        <XCircle className="size-4" /> Not interested
      </Button>
      <Button size="lg" variant="outline" className="h-11" onClick={() => setFollowUpFor(lead)}>
        <CalendarClock className="size-4" /> Follow-up
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Incoming leads" : "My incoming leads"}
        description={`${total} lead${total === 1 ? "" : "s"} waiting to be called and qualified`}
        actions={
          isAdmin ? (
            <Button asChild>
              <Link to="/import">
                <Upload className="size-4" /> Import leads
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={stage === t.value ? "default" : "outline"}
            onClick={() => setParam({ stage: t.value, qualification: undefined })}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Surface className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, company, phone or email…"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={search.qualification ?? "all"}
            onValueChange={(v) => setParam({ qualification: v === "all" ? undefined : v })}
          >
            <SelectTrigger><SelectValue placeholder="Qualification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any qualification status</SelectItem>
              {QUALIFICATION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.source ?? "all"} onValueChange={(v) => setParam({ source: v === "all" ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.category ?? "all"} onValueChange={(v) => setParam({ category: v === "all" ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={search.caller ?? "all"} onValueChange={(v) => setParam({ caller: v === "all" ? undefined : v })}>
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
        </div>
        {search.importId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Showing leads from one import.
            <Button size="sm" variant="ghost" onClick={() => setParam({ importId: undefined })}>
              Show all
            </Button>
          </div>
        )}
      </Surface>

      {isLoading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={stage === "INCOMING" ? "No incoming leads" : "Nothing here"}
          description={
            stage === "INCOMING"
              ? isAdmin
                ? "Import an Excel or CSV file to bring in new leads."
                : "You have no unqualified leads right now."
              : "Leads you park here stay saved and can be reopened any time."
          }
          action={
            isAdmin && stage === "INCOMING" ? (
              <Button asChild>
                <Link to="/import">Import leads</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Source</th>
                  {isAdmin && <th className="px-3 py-2">Caller</th>}
                  <th className="px-3 py-2">Imported</th>
                  <th className="px-3 py-2">Qualification</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((l) => (
                  <tr key={l.id} className="align-top hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link to="/leads/$leadId" params={{ leadId: l.id }} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.company ?? "-"}</td>
                    <td className="px-3 py-2 tabular-nums">{l.phone ?? "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{categoryName(l.category_id)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{sourceName(l.source_id)}</td>
                    {isAdmin && <td className="px-3 py-2 text-muted-foreground">{callerName(l.assigned_to)}</td>}
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(l.created_at)}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        label={labelOf(QUALIFICATION_STATUSES, (l as any).qualification_status)}
                        tone={toneOf(QUALIFICATION_STATUSES, (l as any).qualification_status)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setQualifyFor(l)}>
                          Qualify
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setNoteFor(l)}>
                          <StickyNote className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setFollowUpFor(l)}>
                          <CalendarClock className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile calling cards */}
          <div className="space-y-3 lg:hidden">
            {rows.map((l) => (
              <Surface key={l.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="text-base font-semibold hover:underline">
                      {l.company || l.name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {l.name} · {categoryName(l.category_id)}
                    </p>
                    <p className="mt-1 tabular-nums text-sm">{l.phone ?? "No phone"}</p>
                    <p className="text-xs text-muted-foreground">Source: {sourceName(l.source_id)}</p>
                  </div>
                  <StatusPill
                    label={labelOf(QUALIFICATION_STATUSES, (l as any).qualification_status)}
                    tone={toneOf(QUALIFICATION_STATUSES, (l as any).qualification_status)}
                  />
                </div>
                {actions(l)}
              </Surface>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>
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

      {qualifyFor && (
        <QualifyDialog
          open={!!qualifyFor}
          onOpenChange={(o) => !o && setQualifyFor(null)}
          lead={qualifyFor}
          onSaved={refresh}
        />
      )}
      {disposition && (
        <DispositionDialog
          open={!!disposition}
          onOpenChange={(o) => !o && setDisposition(null)}
          lead={disposition.lead}
          outcome={disposition.outcome}
          onSaved={refresh}
        />
      )}
      {noteFor && (
        <QuickNoteDialog
          open={!!noteFor}
          onOpenChange={(o) => !o && setNoteFor(null)}
          leadId={noteFor.id}
          leadName={noteFor.name ?? noteFor.company ?? "Lead"}
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
