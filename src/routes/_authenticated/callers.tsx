/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminOnly } from "@/components/crm/AdminOnly";
import { PageHeader, Surface, EmptyState, LoadingRows } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { ConfirmDialog, FormDialog } from "@/components/crm/FormDialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTeam, type CallerAccount } from "@/lib/crm/roles";
import { createCaller, deleteCaller, setCallerActive, setCallerPassword } from "@/lib/crm/team.functions";
import { Plus, KeyRound, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/callers")({
  head: () => ({
    meta: [
      { title: "Callers · SoloCRM" },
      { name: "description", content: "Create and manage the calling staff accounts that work your leads." },
      { property: "og:title", content: "Callers · SoloCRM" },
      { property: "og:description", content: "Create and manage the calling staff accounts that work your leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <CallersPage />
    </AdminOnly>
  ),
});

function useLeadCounts() {
  return useQuery({
    queryKey: ["caller-lead-counts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("leads").select("assigned_to,status");
      const map = new Map<string, { total: number; won: number }>();
      (data ?? []).forEach((l: any) => {
        if (!l.assigned_to) return;
        const cur = map.get(l.assigned_to) ?? { total: 0, won: 0 };
        cur.total++;
        if (l.status === "WON") cur.won++;
        map.set(l.assigned_to, cur);
      });
      return map;
    },
  });
}

function CallersPage() {
  const { data: team = [], isLoading } = useTeam();
  const { data: counts } = useLeadCounts();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pwFor, setPwFor] = useState<CallerAccount | null>(null);
  const [removing, setRemoving] = useState<CallerAccount | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["team"] });
    void qc.invalidateQueries({ queryKey: ["caller-lead-counts"] });
  };

  const callers = team.filter((m) => m.role === "CALLER");
  const admins = team.filter((m) => m.role === "ADMIN");

  return (
    <div>
      <PageHeader
        title="Callers"
        description="Create login accounts for your calling staff. Each caller only sees the leads you assign to them."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add caller
          </Button>
        }
      />

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : callers.length === 0 ? (
        <EmptyState
          title="No callers yet"
          description="Add your first caller so you can start assigning leads."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add caller
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {callers.map((c) => {
            const stat = counts?.get(c.id);
            return (
              <Surface key={c.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.full_name ?? "Caller"}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.email}</p>
                  </div>
                  <StatusPill
                    label={c.is_active ? "Active" : "Disabled"}
                    tone={c.is_active ? "success" : "neutral"}
                  />
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{stat?.total ?? 0} leads</span>
                  <span>{stat?.won ?? 0} won</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPwFor(c)}>
                    <KeyRound className="size-4" /> Password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await setCallerActive({ data: { userId: c.id, active: !c.is_active } });
                        toast.success(c.is_active ? "Caller disabled" : "Caller enabled");
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not update the account");
                      }
                    }}
                  >
                    <Power className="size-4" /> {c.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoving(c)}>
                    <Trash2 className="size-4" /> Remove
                  </Button>
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      {admins.length > 0 && (
        <Surface className="mt-4">
          <p className="mb-2 text-sm font-medium">Admins</p>
          {admins.map((a) => (
            <p key={a.id} className="text-sm text-muted-foreground">
              {a.full_name ?? "Admin"} · {a.email}
            </p>
          ))}
        </Surface>
      )}

      <FormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add caller"
        description="The caller signs in with this email and password. They will only see the leads you assign to them."
        submitLabel="Create caller"
        fields={[
          { name: "fullName", label: "Full name", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", required: false },
          { name: "password", label: "Password", type: "password", required: true, help: "At least 6 characters." },
        ]}
        onSubmit={async (values: any) => {
          await createCaller({
            data: {
              fullName: String(values.fullName ?? "").trim(),
              email: String(values.email ?? "").trim(),
              password: String(values.password ?? ""),
              phone: values.phone ? String(values.phone) : undefined,
            },
          });
          toast.success("Caller account created");
          refresh();
        }}
      />

      <FormDialog
        open={!!pwFor}
        onOpenChange={(o) => !o && setPwFor(null)}
        title={`Set password · ${pwFor?.full_name ?? ""}`}
        description="Share the new password with your caller."
        submitLabel="Update password"
        fields={[{ name: "password", label: "New password", type: "password", required: true }]}
        onSubmit={async (values: any) => {
          await setCallerPassword({
            data: { userId: pwFor!.id, password: String(values.password ?? "") },
          });
          toast.success("Password updated");
          setPwFor(null);
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this caller?"
        description="Their login is deleted and their leads become unassigned. Lead history is kept."
        confirmLabel="Remove caller"
        destructive
        onConfirm={async () => {
          try {
            await deleteCaller({ data: { userId: removing!.id } });
            toast.success("Caller removed");
            setRemoving(null);
            refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not remove the caller");
          }
        }}
      />
    </div>
  );
}
