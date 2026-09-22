/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { LeadDialog } from "@/components/crm/LeadDialog";
import { FollowUpDialog } from "@/components/crm/FollowUpDialog";
import { FileManager } from "@/components/crm/FileManager";
import { ConfirmDialog, FormDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LEAD_STATUSES,
  TEMPERATURES,
  WHATSAPP_TEMPLATES,
  FOLLOWUP_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  formatDate,
  formatDateTime,
  formatMoney,
  labelOf,
  leadScore,
  toneOf,
  waLink,
} from "@/lib/crm/constants";
import {
  changeLeadStatus,
  convertLeadToCustomer,
  deleteRow,
  insertRow,
  logActivity,
  updateRow,
  useCategories,
  useInvalidate,
  useLead,
  useList,
  useSources,
  type Activity,
  type FollowUp,
  type Task,
} from "@/lib/crm/db";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Trash2,
  UserCheck,
  CalendarClock,
  ListTodo,
  Pencil,
  Info,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({
    meta: [
      { title: "Lead details · SoloCRM" },
      { name: "description", content: "Contact details, sales information and the full activity timeline for this lead." },
      { property: "og:title", content: "Lead details · SoloCRM" },
      { property: "og:description", content: "Contact details, sales information and the full activity timeline for this lead." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadDetail,
});

const CALL_OUTCOMES = [
  { value: "Completed — interested", status: "INTERESTED" },
  { value: "Completed — not interested", status: "NOT_INTERESTED" },
  { value: "Call back later", status: "FOLLOW_UP_LATER" },
  { value: "No answer", status: null },
  { value: "Wrong number", status: null },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value ?? "-"}</p>
    </div>
  );
}

function LeadDetail() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: lead, isLoading, error } = useLead(leadId);
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useCategories();

  const { data: activities = [] } = useList<Activity>("lead_activities", {
    key: ["lead", leadId],
    order: { column: "occurred_at" },
    filters: (q) => q.eq("lead_id", leadId),
  });
  const { data: followUps = [] } = useList<FollowUp>("follow_ups", {
    key: ["lead", leadId],
    order: { column: "due_at", asc: true },
    filters: (q) => q.eq("lead_id", leadId),
  });
  const { data: tasks = [] } = useList<Task>("tasks", {
    key: ["lead", leadId],
    order: { column: "due_date", asc: true },
    filters: (q) => q.eq("lead_id", leadId),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <LoadingRows rows={6} />;
  if (error) return <ErrorState error={error} />;
  if (!lead)
    return (
      <EmptyState
        title="Lead not found"
        description="It may have been deleted."
        action={<Button asChild><Link to="/leads">Back to leads</Link></Button>}
      />
    );

  const score = leadScore(lead);
  const refresh = () => invalidate("lead", "leads", "lead_activities", "follow_ups", "tasks", "dashboard");

  const applyStatus = async (status: string) => {
    if (status === "WON") {
      setConfirmConvert(true);
      return;
    }
    setConfirmStatus(status);
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/leads"><ArrowLeft className="size-4" /> All leads</Link>
      </Button>

      <PageHeader
        title={lead.name}
        description={[lead.company, lead.city].filter(Boolean).join(" · ") || "No company recorded"}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </>
        }
      />

      <Surface className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={labelOf(LEAD_STATUSES, lead.status)} tone={toneOf(LEAD_STATUSES, lead.status)} />
          <StatusPill label={labelOf(TEMPERATURES, lead.temperature)} tone={toneOf(TEMPERATURES, lead.temperature)} />
          <span className="text-sm font-semibold tabular-nums">{formatMoney(lead.deal_value)}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost">
                Score {score.score}/100 <Info className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <p className="mb-2 text-sm font-medium">Why this score?</p>
              {score.factors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No scoring factors yet — add a phone number or email to start.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {score.factors.map((f) => (
                    <li key={f.label} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="tabular-nums text-success">+{f.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <div className="ml-auto w-48">
            <Select value={lead.status} onValueChange={applyStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${lead.phone}`}><Phone className="size-4" /> Call {lead.phone}</a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCallOpen(true)}>
            <CheckCircle2 className="size-4" /> Record call
          </Button>
          {waLink(lead.whatsapp || lead.phone) && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><MessageCircle className="size-4" /> WhatsApp</Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2">
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Opens WhatsApp with the message ready — nothing is sent automatically.
                </p>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={async () => {
                      const msg = t.body.replaceAll("{name}", lead.name.split(" ")[0] ?? lead.name);
                      window.open(waLink(lead.whatsapp || lead.phone, msg)!, "_blank", "noopener");
                      await logActivity({
                        type: "WHATSAPP",
                        title: `WhatsApp opened — ${t.name}`,
                        body: msg,
                        lead_id: lead.id,
                      });
                      await updateRow("leads", lead.id, { last_contact_at: new Date().toISOString() });
                      refresh();
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {lead.email && (
            <Button
              asChild
              variant="outline"
              size="sm"
              onClick={() => {
                void logActivity({ type: "EMAIL", title: "Email opened", lead_id: lead.id }).then(refresh);
              }}
            >
              <a href={`mailto:${lead.email}`}><Mail className="size-4" /> Email</a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
            <NotebookPen className="size-4" /> Add note
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFollowUpOpen(true)}>
            <CalendarClock className="size-4" /> Follow-up
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
            <ListTodo className="size-4" /> Task
          </Button>
          {!lead.converted_customer_id && (
            <Button size="sm" onClick={() => setConfirmConvert(true)}>
              <UserCheck className="size-4" /> Convert to customer
            </Button>
          )}
          {lead.converted_customer_id && (
            <Button size="sm" variant="ghost" asChild>
              <Link to="/customers">View customer</Link>
            </Button>
          )}
        </div>
      </Surface>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({activities.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({followUps.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
          <Surface className="space-y-3">
            <h2 className="text-sm font-semibold">Contact information</h2>
            <Field label="Contact person" value={lead.contact_person} />
            <Field label="Phone" value={lead.phone} />
            <Field label="WhatsApp" value={lead.whatsapp} />
            <Field label="Email" value={lead.email} />
            <Field label="Website" value={lead.website} />
            <Field label="Address" value={[lead.address, lead.city, lead.state, lead.country].filter(Boolean).join(", ")} />
          </Surface>
          <Surface className="space-y-3">
            <h2 className="text-sm font-semibold">Business information</h2>
            <Field label="Company" value={lead.company} />
            <Field label="Company size" value={lead.company_size} />
            <Field label="Category" value={categories.find((c) => c.id === lead.category_id)?.name} />
            <Field label="Source" value={sources.find((s) => s.id === lead.source_id)?.name} />
            <Field label="Service interested in" value={lead.service_interested} />
            <Field label="Notes" value={lead.notes} />
          </Surface>
          <Surface className="space-y-3">
            <h2 className="text-sm font-semibold">Sales information</h2>
            <Field label="First contact" value={formatDateTime(lead.first_contact_at)} />
            <Field label="Last contact" value={formatDateTime(lead.last_contact_at)} />
            <Field label="Next follow-up" value={formatDateTime(lead.next_follow_up)} />
            <Field label="Expected closing date" value={formatDate(lead.expected_close_date)} />
            <Field label="Estimated budget" value={lead.estimated_budget ? formatMoney(lead.estimated_budget) : "-"} />
            <Field label="Proposal status" value={lead.proposal_status} />
            <Field label="Lost reason" value={lead.lost_reason} />
          </Surface>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Surface>
            {activities.length === 0 ? (
              <EmptyState title="No activity yet" description="Calls, messages, notes and status changes appear here automatically." />
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
                    {a.outcome && <p className="mt-1 text-xs text-muted-foreground">Outcome: {a.outcome}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="followups" className="mt-4">
          <Surface className="space-y-2">
            {followUps.length === 0 ? (
              <EmptyState
                title="No follow-ups scheduled"
                action={<Button size="sm" onClick={() => setFollowUpOpen(true)}>Schedule follow-up</Button>}
              />
            ) : (
              followUps.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{formatDateTime(f.due_at)} · {f.type}</p>
                    {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill label={labelOf(FOLLOWUP_STATUSES, f.status)} tone={toneOf(FOLLOWUP_STATUSES, f.status)} />
                    {f.status === "PENDING" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await updateRow("follow_ups", f.id, {
                            status: "COMPLETED",
                            completed_at: new Date().toISOString(),
                          });
                          await logActivity({ type: "FOLLOW_UP", title: "Follow-up completed", lead_id: lead.id });
                          await updateRow("leads", lead.id, { last_contact_at: new Date().toISOString() });
                          toast.success("Follow-up completed. Schedule the next one?");
                          refresh();
                          setFollowUpOpen(true);
                        }}
                      >
                        Mark done
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Surface className="space-y-2">
            {tasks.length === 0 ? (
              <EmptyState title="No tasks" action={<Button size="sm" onClick={() => setTaskOpen(true)}>Add task</Button>} />
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
                  </div>
                </div>
              ))
            )}
          </Surface>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Surface>
            <FileManager leadId={lead.id} />
          </Surface>
        </TabsContent>
      </Tabs>

      <LeadDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} onSaved={refresh} />
      <FollowUpDialog open={followUpOpen} onOpenChange={setFollowUpOpen} leadId={lead.id} onSaved={refresh} />

      <FormDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Add note"
        fields={[{ name: "body", label: "Note", type: "textarea", required: true }]}
        onSubmit={async (v) => {
          await insertRow("notes", { lead_id: lead.id, body: v.body });
          await logActivity({ type: "NOTE", title: "Note added", body: v.body, lead_id: lead.id });
          toast.success("Note added");
          refresh();
        }}
      />

      <FormDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        title="Add task"
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
            lead_id: lead.id,
            due_date: v.due_date ? new Date(v.due_date).toISOString() : null,
            priority: v.priority,
            status: "TODO",
          });
          await logActivity({ type: "TASK", title: `Task created: ${v.title}`, lead_id: lead.id });
          toast.success("Task added");
          refresh();
        }}
      />

      <FormDialog
        open={callOpen}
        onOpenChange={setCallOpen}
        title="Record call outcome"
        description="The lead status is only updated when you pick an outcome that implies it."
        fields={[
          {
            name: "outcome",
            label: "Outcome",
            type: "select",
            required: true,
            options: CALL_OUTCOMES.map((o) => ({ value: o.value, label: o.value })),
          },
          { name: "body", label: "Call notes", type: "textarea" },
          { name: "next", label: "Schedule next follow-up", type: "datetime-local" },
        ]}
        submitLabel="Save call"
        onSubmit={async (v) => {
          const outcome = CALL_OUTCOMES.find((o) => o.value === v.outcome);
          const now = new Date().toISOString();
          await logActivity({
            type: "CALL",
            title: "Call logged",
            body: v.body || null,
            outcome: v.outcome,
            lead_id: lead.id,
          });
          const patch: Record<string, any> = {
            last_contact_at: now,
            first_contact_at: lead.first_contact_at ?? now,
          };
          if (outcome?.status && lead.status === "NEW") patch['status'] = outcome.status;
          else if (!outcome?.status && lead.status === "NEW") patch['status'] = "CONTACTED";
          else if (outcome?.status && outcome.status !== lead.status) patch['status'] = outcome.status;
          if (v.next) patch['next_follow_up'] = new Date(v.next).toISOString();
          await updateRow("leads", lead.id, patch);
          if (patch['status'] && patch['status'] !== lead.status) {
            await logActivity({
              type: "STATUS_CHANGE",
              title: `Status changed to ${String(patch['status']).replaceAll("_", " ")}`,
              body: "Automatically set from the recorded call outcome",
              lead_id: lead.id,
            });
          }
          if (v.next) {
            await insertRow("follow_ups", {
              lead_id: lead.id,
              due_at: new Date(v.next).toISOString(),
              type: "CALL",
              notes: v.body || null,
              status: "PENDING",
            });
          }
          toast.success("Call recorded");
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!confirmStatus}
        onOpenChange={(v) => !v && setConfirmStatus(null)}
        title="Change lead status?"
        description={`This moves ${lead.name} to "${labelOf(LEAD_STATUSES, (confirmStatus ?? "NEW") as any)}" and records it in the activity timeline.`}
        confirmLabel="Change status"
        onConfirm={async () => {
          if (!confirmStatus) return;
          await changeLeadStatus(lead, confirmStatus);
          toast.success("Status updated");
          setConfirmStatus(null);
          refresh();
        }}
      />

      <ConfirmDialog
        open={confirmConvert}
        onOpenChange={setConfirmConvert}
        title="Convert to customer?"
        description="The lead is marked Won and linked to a customer record. An existing customer with the same phone or email is reused instead of creating a duplicate."
        confirmLabel="Convert"
        onConfirm={async () => {
          await convertLeadToCustomer(lead);
          toast.success("Lead converted to customer");
          setConfirmConvert(false);
          refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${lead.name}?`}
        description="This permanently removes the lead with its follow-ups, tasks and activity history."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          await deleteRow("leads", lead.id);
          toast.success("Lead deleted");
          navigate({ to: "/leads" });
        }}
      />
    </div>
  );
}
