/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Generates due/overdue reminders in Supabase. Runs once per session (and at
 * most once an hour) so the notification centre stays useful without a cron job.
 * Each reminder is de-duplicated by a stable key stored on the notification link.
 */
export function useGenerateReminders() {
  useEffect(() => {
    const last = Number(localStorage.getItem("crm.reminders.lastRun") ?? 0);
    if (Date.now() - last < 60 * 60 * 1000) return;
    localStorage.setItem("crm.reminders.lastRun", String(Date.now()));
    void run();
  }, []);
}

async function run() {
  try {
    const db = supabase as any;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [followUps, tasks, projects, payments] = await Promise.all([
      db
        .from("follow_ups")
        .select("id,due_at,status,lead_id")
        .eq("status", "PENDING")
        .lte("due_at", endOfDay.toISOString()),
      db
        .from("tasks")
        .select("id,title,due_date,status")
        .in("status", ["TODO", "IN_PROGRESS"])
        .lte("due_date", endOfDay.toISOString()),
      db
        .from("projects")
        .select("id,name,deadline,status")
        .in("status", ["PLANNING", "IN_PROGRESS", "REVIEW"])
        .not("deadline", "is", null)
        .lte("deadline", soon.toISOString().slice(0, 10)),
      db.from("payments").select("id,amount,status").eq("status", "PENDING"),
    ]);

    const candidates: { key: string; title: string; body: string; kind: string; link: string }[] = [];
    const overdue = (followUps.data ?? []).filter((f: any) => new Date(f.due_at) < now).length;
    const dueToday = (followUps.data ?? []).length - overdue;
    if (overdue > 0)
      candidates.push({
        key: `fu-overdue-${now.toDateString()}`,
        title: `${overdue} overdue follow-up${overdue > 1 ? "s" : ""}`,
        body: "These contacts are waiting to hear back from you.",
        kind: "DANGER",
        link: "/follow-ups",
      });
    if (dueToday > 0)
      candidates.push({
        key: `fu-today-${now.toDateString()}`,
        title: `${dueToday} follow-up${dueToday > 1 ? "s" : ""} due today`,
        body: "Open the action centre to work through them.",
        kind: "WARNING",
        link: "/follow-ups",
      });
    if ((tasks.data ?? []).length)
      candidates.push({
        key: `task-due-${now.toDateString()}`,
        title: `${tasks.data.length} task${tasks.data.length > 1 ? "s" : ""} due`,
        body: "Some tasks are due today or already past due.",
        kind: "WARNING",
        link: "/tasks",
      });
    if ((projects.data ?? []).length)
      candidates.push({
        key: `proj-deadline-${now.toDateString()}`,
        title: `${projects.data.length} project deadline${projects.data.length > 1 ? "s" : ""} approaching`,
        body: "Deadlines within the next 3 days.",
        kind: "INFO",
        link: "/projects",
      });
    if ((payments.data ?? []).length)
      candidates.push({
        key: `pay-pending-${now.toDateString()}`,
        title: `${payments.data.length} pending payment${payments.data.length > 1 ? "s" : ""}`,
        body: "Follow up on outstanding money.",
        kind: "WARNING",
        link: "/payments",
      });

    for (const c of candidates) {
      const { data: existing } = await db
        .from("notifications")
        .select("id")
        .eq("link", `${c.link}#${c.key}`)
        .maybeSingle();
      if (existing) continue;
      await db.from("notifications").insert({
        user_id: user.id,
        title: c.title,
        body: c.body,
        kind: c.kind,
        link: `${c.link}#${c.key}`,
      });
    }
  } catch (e) {
    console.error("reminder generation failed", e);
  }
}
