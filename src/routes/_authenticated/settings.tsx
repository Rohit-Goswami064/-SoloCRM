/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdminOnly } from "@/components/crm/AdminOnly";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Surface } from "@/components/crm/Common";
import { ConfirmDialog } from "@/components/crm/FormDialog";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LEAD_STATUSES, WHATSAPP_TEMPLATES, labelOf, toneOf } from "@/lib/crm/constants";
import {
  currentUserId,
  deleteDemoData,
  seedDemoData,
  updateRow,
  useInvalidate,
} from "@/lib/crm/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · SoloCRM" },
      { name: "description", content: "Your profile, follow-up defaults, WhatsApp message templates, demo data and account security." },
      { property: "og:title", content: "Settings · SoloCRM" },
      { property: "og:description", content: "Profile, follow-up defaults, WhatsApp templates, demo data and security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <SettingsPage />
    </AdminOnly>
  ),
});

type Prefs = {
  defaultFollowUpDays?: number;
  notifyFollowUps?: boolean;
  notifyTasks?: boolean;
  notifyPayments?: boolean;
  notifyDeadlines?: boolean;
  duplicateMode?: string;
  whatsappTemplates?: Record<string, string>;
};

function SettingsPage() {
  const invalidate = useInvalidate();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const uid = await currentUserId();
      const { data, error } = await (supabase as any).from("profiles").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const uid = await currentUserId();
      const { data, error } = await (supabase as any).from("settings").select("*").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: email } = useQuery({
    queryKey: ["auth-email"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? "",
  });

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({});
  const [seeding, setSeeding] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setCompany(profile.company ?? "");
    }
  }, [profile]);

  useEffect(() => {
    if (settings) {
      const d = (settings.data ?? {}) as Prefs;
      setPrefs({
        defaultFollowUpDays: d.defaultFollowUpDays ?? 3,
        notifyFollowUps: d.notifyFollowUps ?? true,
        notifyTasks: d.notifyTasks ?? true,
        notifyPayments: d.notifyPayments ?? true,
        notifyDeadlines: d.notifyDeadlines ?? true,
        duplicateMode: d.duplicateMode ?? "skip",
        whatsappTemplates: d.whatsappTemplates ?? Object.fromEntries(WHATSAPP_TEMPLATES.map((t) => [t.name, t.body])),
      });
    }
  }, [settings]);

  const savePrefs = async (next: Prefs) => {
    setPrefs(next);
    const uid = await currentUserId();
    const { error } = await (supabase as any)
      .from("settings")
      .upsert({ user_id: uid, data: next }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else invalidate("settings");
  };

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, defaults and account controls." />

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="prefs">Preferences</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp templates</TabsTrigger>
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="data">Demo data</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Surface className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label>Your name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Business name</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">Your sign-in email cannot be changed here.</p>
            </div>
            <Button
              onClick={async () => {
                const uid = await currentUserId();
                await updateRow("profiles", uid, { full_name: fullName, company });
                toast.success("Profile saved");
                invalidate("profile");
              }}
            >
              Save profile
            </Button>
          </Surface>
        </TabsContent>

        <TabsContent value="prefs" className="mt-4">
          <Surface className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label>Default days until the next follow-up</Label>
              <Input
                type="number"
                min={1}
                value={prefs.defaultFollowUpDays ?? 3}
                onChange={(e) => setPrefs({ ...prefs, defaultFollowUpDays: Number(e.target.value) })}
                onBlur={() => savePrefs(prefs)}
                className="w-32"
              />
            </div>
            <div className="space-y-3">
              <Label>Reminders</Label>
              {([
                ["notifyFollowUps", "Follow-ups due and overdue"],
                ["notifyTasks", "Tasks due"],
                ["notifyPayments", "Payments still pending"],
                ["notifyDeadlines", "Project deadlines approaching"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={(prefs as any)[key] ?? true}
                    onCheckedChange={(v) => savePrefs({ ...prefs, [key]: v })}
                  />
                </div>
              ))}
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <Surface className="max-w-2xl space-y-4">
            <p className="text-sm text-muted-foreground">
              These open a pre-filled WhatsApp chat. Messages are never sent automatically — you always press send yourself.
            </p>
            {WHATSAPP_TEMPLATES.map((t) => (
              <div key={t.name} className="space-y-1.5">
                <Label>{t.name}</Label>
                <Textarea
                  rows={3}
                  value={prefs.whatsappTemplates?.[t.name] ?? t.body}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      whatsappTemplates: { ...(prefs.whatsappTemplates ?? {}), [t.name]: e.target.value },
                    })
                  }
                  onBlur={() => savePrefs(prefs)}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Use {"{name}"} and {"{company}"} to drop in the lead's details.
            </p>
          </Surface>
        </TabsContent>

        <TabsContent value="statuses" className="mt-4">
          <Surface className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sales stages are fixed so the pipeline and reports stay consistent. Sources and categories are fully yours to edit.
            </p>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => (
                <StatusPill key={s.value} label={labelOf(LEAD_STATUSES, s.value)} tone={toneOf(LEAD_STATUSES, s.value)} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link to="/sources">Edit lead sources</Link></Button>
              <Button variant="outline" asChild><Link to="/categories">Edit categories</Link></Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Surface className="space-y-3">
            {[
              ["WhatsApp Business API", "Send messages automatically instead of opening a chat window."],
              ["Email sending", "Send proposals and reminders from your own address."],
              ["Payment gateway", "Collect online payments and reconcile them here."],
              ["Google Calendar", "Push follow-ups into your calendar."],
            ].map(([name, desc]) => (
              <div key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill label="Not connected" tone="neutral" />
                  <Button size="sm" variant="outline" onClick={() => toast.info("Tell me which account to connect and I'll set it up.")}>
                    Connect integration
                  </Button>
                </div>
              </div>
            ))}
          </Surface>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <Surface className="max-w-xl space-y-3">
            <p className="text-sm text-muted-foreground">
              Demo data is clearly marked and can be removed in one click. It never mixes with your real records.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={seeding} onClick={() => setConfirmSeed(true)}>Load demo data</Button>
              <Button variant="outline" className="text-destructive" disabled={seeding} onClick={() => setConfirmWipe(true)}>
                Delete demo data
              </Button>
            </div>
          </Surface>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Surface className="max-w-xl space-y-4">
            <p className="text-sm text-muted-foreground">
              Every record is tied to your account and no one else can read it. Send yourself a reset link to change your password.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                if (!email) return;
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/auth`,
                });
                if (error) toast.error(error.message);
                else toast.success("Password reset link sent to your email");
              }}
            >
              Send password reset link
            </Button>
            <Button variant="ghost" onClick={async () => { await supabase.auth.signOut(); }}>
              Sign out of this device
            </Button>
          </Surface>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmSeed}
        onOpenChange={setConfirmSeed}
        title="Load demo data?"
        description="Adds 10 sample leads, 3 customers, 2 projects, follow-ups, tasks and payments. Any existing demo records are replaced; your real data is untouched."
        confirmLabel="Load demo data"
        onConfirm={async () => {
          setSeeding(true);
          try {
            await seedDemoData();
            toast.success("Demo data loaded");
            invalidate();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not load demo data");
          }
          setSeeding(false);
        }}
      />

      <ConfirmDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete all demo data?"
        description="Only records marked as demo are removed. Your real leads, customers and payments stay exactly as they are."
        confirmLabel="Delete demo data"
        onConfirm={async () => {
          setSeeding(true);
          try {
            await deleteDemoData();
            toast.success("Demo data removed");
            invalidate();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete demo data");
          }
          setSeeding(false);
        }}
      />
    </div>
  );
}
