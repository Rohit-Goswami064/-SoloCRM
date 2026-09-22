/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Surface, EmptyState, LoadingRows, ErrorState } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/crm/constants";
import { useList, type Activity, type Lead } from "@/lib/crm/db";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/activities")({
  head: () => ({
    meta: [
      { title: "Activity · SoloCRM" },
      { name: "description", content: "A permanent, chronological record of every call, message, note and status change." },
      { property: "og:title", content: "Activity · SoloCRM" },
      { property: "og:description", content: "A permanent record of every call, message, note and status change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivitiesPage,
});

const TYPES = [
  "ALL",
  "CALL",
  "WHATSAPP",
  "EMAIL",
  "MEETING",
  "NOTE",
  "FOLLOW_UP",
  "PROPOSAL",
  "STATUS_CHANGE",
  "PAYMENT",
  "TASK",
  "FILE",
];

function ActivitiesPage() {
  const [type, setType] = useState("ALL");
  const { data: activities = [], isLoading, error } = useList<Activity>("lead_activities", {
    order: { column: "occurred_at" },
  });
  const { data: leads = [] } = useList<Lead>("leads", { select: "id,name", key: ["mini"] });
  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.name;

  const filtered = type === "ALL" ? activities : activities.filter((a) => a.type === type);

  return (
    <div>
      <PageHeader title="Activity" description="Nothing here is ever deleted — it is your complete sales history." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <Button key={t} size="sm" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>
            {t.replaceAll("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <LoadingRows rows={8} />
      ) : error ? (
        <ErrorState error={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Calls, WhatsApp messages, notes and status changes are recorded here automatically."
          icon={<History className="size-6" />}
        />
      ) : (
        <Surface>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {filtered.slice(0, 300).map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={a.type.replaceAll("_", " ")} tone="info" />
                  <span className="text-sm font-medium">{a.title}</span>
                  {a.lead_id && leadName(a.lead_id) && (
                    <Link to="/leads/$leadId" params={{ leadId: a.lead_id }} className="text-xs text-accent hover:underline">
                      {leadName(a.lead_id)}
                    </Link>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.occurred_at)}</span>
                </div>
                {a.body && <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>}
                {a.outcome && <p className="mt-1 text-xs text-muted-foreground">Outcome: {a.outcome}</p>}
              </li>
            ))}
          </ol>
        </Surface>
      )}
    </div>
  );
}
