import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type LeadTemp = Database["public"]["Enums"]["lead_temp"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type FollowUpType = Database["public"]["Enums"]["followup_type"];
export type FollowUpStatus = Database["public"]["Enums"]["followup_status"];
export type ActivityType = Database["public"]["Enums"]["activity_type"];

/** Semantic tone used by the Status pill component. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export const LEAD_STATUSES: { value: LeadStatus; label: string; tone: Tone }[] = [
  { value: "NEW", label: "New", tone: "info" },
  { value: "CONTACTED", label: "Contacted", tone: "info" },
  { value: "INTERESTED", label: "Interested", tone: "accent" },
  { value: "FOLLOW_UP", label: "Follow Up", tone: "warning" },
  { value: "QUALIFIED", label: "Qualified", tone: "accent" },
  { value: "PROPOSAL_SENT", label: "Proposal Sent", tone: "warning" },
  { value: "NEGOTIATION", label: "Negotiation", tone: "warning" },
  { value: "WON", label: "Won", tone: "success" },
  { value: "LOST", label: "Lost", tone: "danger" },
  { value: "NOT_INTERESTED", label: "Not Interested", tone: "neutral" },
  { value: "FOLLOW_UP_LATER", label: "Follow Up Later", tone: "warning" },
];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "QUALIFIED",
  "FOLLOW_UP",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

/** Where a lead sits in the workflow: freshly imported, working pipeline, or parked. */
export type LeadStage = "INCOMING" | "MAIN" | "NOT_INTERESTED" | "INVALID";

export const LEAD_STAGES: { value: LeadStage; label: string; tone: Tone }[] = [
  { value: "INCOMING", label: "Incoming", tone: "info" },
  { value: "MAIN", label: "Main", tone: "accent" },
  { value: "NOT_INTERESTED", label: "Not interested", tone: "neutral" },
  { value: "INVALID", label: "Invalid", tone: "danger" },
];

export type QualificationStatus =
  | "UNQUALIFIED"
  | "CALLING"
  | "QUALIFIED"
  | "NOT_INTERESTED"
  | "INVALID"
  | "NO_RESPONSE";

export const QUALIFICATION_STATUSES: { value: QualificationStatus; label: string; tone: Tone }[] = [
  { value: "UNQUALIFIED", label: "Unqualified", tone: "neutral" },
  { value: "CALLING", label: "Calling", tone: "info" },
  { value: "QUALIFIED", label: "Qualified", tone: "success" },
  { value: "NOT_INTERESTED", label: "Not interested", tone: "warning" },
  { value: "INVALID", label: "Invalid", tone: "danger" },
  { value: "NO_RESPONSE", label: "No response", tone: "warning" },
];

/** Statuses a qualified lead moves through in the main pipeline. */
export const MAIN_STATUSES: LeadStatus[] = [
  "QUALIFIED",
  "FOLLOW_UP",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export const TEMPERATURES: { value: LeadTemp; label: string; tone: Tone }[] = [
  { value: "HOT", label: "Hot", tone: "danger" },
  { value: "WARM", label: "Warm", tone: "warning" },
  { value: "COLD", label: "Cold", tone: "info" },
];

export const TASK_STATUSES: { value: TaskStatus; label: string; tone: Tone }[] = [
  { value: "TODO", label: "Todo", tone: "info" },
  { value: "IN_PROGRESS", label: "In Progress", tone: "warning" },
  { value: "COMPLETED", label: "Completed", tone: "success" },
  { value: "CANCELLED", label: "Cancelled", tone: "neutral" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; tone: Tone }[] = [
  { value: "LOW", label: "Low", tone: "neutral" },
  { value: "MEDIUM", label: "Medium", tone: "info" },
  { value: "HIGH", label: "High", tone: "warning" },
  { value: "URGENT", label: "Urgent", tone: "danger" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; tone: Tone }[] = [
  { value: "PLANNING", label: "Planning", tone: "info" },
  { value: "IN_PROGRESS", label: "In Progress", tone: "accent" },
  { value: "REVIEW", label: "Review", tone: "warning" },
  { value: "COMPLETED", label: "Completed", tone: "success" },
  { value: "ON_HOLD", label: "On Hold", tone: "warning" },
  { value: "CANCELLED", label: "Cancelled", tone: "neutral" },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string; tone: Tone }[] = [
  { value: "PENDING", label: "Pending", tone: "warning" },
  { value: "PARTIAL", label: "Partial", tone: "warning" },
  { value: "PAID", label: "Paid", tone: "success" },
  { value: "REFUNDED", label: "Refunded", tone: "neutral" },
];

export const FOLLOWUP_TYPES: { value: FollowUpType; label: string }[] = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "OTHER", label: "Other" },
];

export const FOLLOWUP_STATUSES: { value: FollowUpStatus; label: string; tone: Tone }[] = [
  { value: "PENDING", label: "Pending", tone: "warning" },
  { value: "COMPLETED", label: "Completed", tone: "success" },
  { value: "SKIPPED", label: "Skipped", tone: "neutral" },
  { value: "RESCHEDULED", label: "Rescheduled", tone: "info" },
];

export const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Cash", "Card", "Cheque", "Other"];

export const DOC_TYPES = ["Proposal", "Invoice", "Contract", "Requirement", "Screenshot", "Other"];

export const WHATSAPP_TEMPLATES: { name: string; body: string }[] = [
  {
    name: "Initial Contact",
    body: "Hi {name}, this is regarding the services you were looking for. Is this a good time to talk?",
  },
  { name: "Follow-up", body: "Hi {name}, just following up on our last conversation. Any updates?" },
  {
    name: "Proposal Follow-up",
    body: "Hi {name}, did you get a chance to review the proposal we shared? Happy to walk you through it.",
  },
  {
    name: "Payment Reminder",
    body: "Hi {name}, a gentle reminder about the pending payment for our ongoing work. Thank you!",
  },
  {
    name: "Project Completion",
    body: "Hi {name}, your project is complete. Please review and share your feedback. Thank you for working with us!",
  },
];

export function labelOf<T extends string>(list: { value: T; label: string }[], value: T | null) {
  return list.find((x) => x.value === value)?.label ?? value ?? "-";
}

export function toneOf<T extends string>(
  list: { value: T; label: string; tone: Tone }[],
  value: T | null,
): Tone {
  return list.find((x) => x.value === value)?.tone ?? "neutral";
}

/** Keep only digits; compare on the last 10 digits (same rule as the database). */
export function normalizePhone(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits ? digits : null;
}

export function isValidPhone(phone?: string | null) {
  return ((phone ?? "").replace(/\D/g, "") || "").length >= 10;
}

export function isValidEmail(email?: string | null) {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function waLink(phone?: string | null, message?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function formatMoney(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type ScoreFactor = { label: string; points: number };

/** Transparent lead score — every factor is shown to the user. */
export function leadScore(lead: {
  phone?: string | null;
  email?: string | null;
  status?: LeadStatus | null;
  next_follow_up?: string | null;
  estimated_budget?: number | null;
  deal_value?: number | null;
}): { score: number; factors: ScoreFactor[] } {
  const factors: ScoreFactor[] = [];
  if (isValidPhone(lead.phone)) factors.push({ label: "Valid phone number", points: 20 });
  if (isValidEmail(lead.email)) factors.push({ label: "Valid email address", points: 10 });
  if (lead.status === "INTERESTED") factors.push({ label: "Lead is interested", points: 20 });
  if (lead.status === "QUALIFIED" || lead.status === "NEGOTIATION" || lead.status === "WON")
    factors.push({ label: "Lead is qualified or further", points: 40 });
  if (lead.status === "PROPOSAL_SENT") factors.push({ label: "Proposal sent", points: 30 });
  if (lead.next_follow_up) factors.push({ label: "Follow-up scheduled", points: 10 });
  if (Number(lead.estimated_budget ?? lead.deal_value ?? 0) >= 50000)
    factors.push({ label: "High estimated value", points: 10 });
  const score = Math.min(
    100,
    factors.reduce((sum, f) => sum + f.points, 0),
  );
  return { score, factors };
}
