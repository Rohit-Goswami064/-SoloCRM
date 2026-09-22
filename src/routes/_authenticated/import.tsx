/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Surface, EmptyState, KpiCard } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { downloadCsv } from "./leads.index";
import { formatDateTime, isValidEmail, isValidPhone, normalizePhone } from "@/lib/crm/constants";
import {
  currentUserId,
  insertRow,
  insertRows,
  logAudit,
  updateRow,
  useInvalidate,
  useList,
  useSources,
  type ImportRun,
} from "@/lib/crm/db";
import { FileSpreadsheet, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCallers } from "@/lib/crm/roles";
import { AdminOnly } from "@/components/crm/AdminOnly";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import leads · SoloCRM" },
      { name: "description", content: "Upload an Excel or CSV file, map the columns, review duplicates and import leads safely." },
      { property: "og:title", content: "Import leads · SoloCRM" },
      { property: "og:description", content: "Upload Excel or CSV, map columns, review duplicates and import safely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <ImportPage />
    </AdminOnly>
  ),
});

/** CRM fields the importer understands, with the spreadsheet headings it recognises. */
const TARGETS: { key: string; label: string; aliases: string[] }[] = [
  { key: "name", label: "Full name", aliases: ["name", "lead name", "full name", "client name", "contact name", "contact person", "person", "owner"] },
  { key: "company", label: "Company name", aliases: ["company", "company name", "business", "business name", "shop name", "firm", "organisation", "organization"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "mobile number", "mobile no", "contact", "contact number", "contact no", "phone no", "tel", "telephone", "number"] },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whatsapp number", "wa", "whats app"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail", "mail", "email id", "mail id"] },
  { key: "website", label: "Website", aliases: ["website", "web", "url", "site", "web site", "webpage"] },
  { key: "address", label: "Address / location", aliases: ["address", "street", "location", "full address", "area", "locality"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state", "region", "province"] },
  { key: "country", label: "Country", aliases: ["country"] },
  { key: "pincode", label: "Pincode", aliases: ["pincode", "pin code", "zip", "zipcode", "postal code", "postcode"] },
  { key: "company_size", label: "Company size", aliases: ["company size", "employees", "employee count", "size", "team size"] },
  { key: "service_interested", label: "Service required", aliases: ["service", "service required", "service interested", "requirement", "interested in"] },
  { key: "lead_category", label: "Category", aliases: ["category", "industry", "segment", "business type", "type"] },
  { key: "lead_source", label: "Source", aliases: ["source", "lead source", "channel", "platform", "came from"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "remark", "remarks", "comment", "comments", "description"] },
  { key: "deal_value", label: "Deal value", aliases: ["deal value", "value", "amount", "budget", "estimated value", "price"] },
];

const norm = (s: string) => s.toLowerCase().trim().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const MEMORY_KEY = "crm.import.mapping";
const loadMemory = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const saveMemory = (mapping: Record<string, string>) => {
  const memory = loadMemory();
  Object.entries(mapping).forEach(([header, target]) => {
    if (target) memory[norm(header)] = target;
  });
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
};

function autoMap(headers: string[], knownCustom: string[]) {
  const memory = loadMemory();
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  headers.forEach((h) => {
    const n = norm(h);
    const remembered = memory[n];
    if (remembered && !used.has(remembered)) {
      mapping[h] = remembered;
      used.add(remembered);
      return;
    }
    const hit =
      TARGETS.find((t) => t.aliases.includes(n)) ??
      TARGETS.find((t) => t.aliases.some((a) => n === a || n.includes(a)));
    if (hit && !used.has(hit.key)) {
      mapping[h] = hit.key;
      used.add(hit.key);
      return;
    }
    const customKey = `custom:${slug(h)}`;
    mapping[h] = knownCustom.includes(slug(h)) ? customKey : "";
  });
  return mapping;
}

type RowStatus = "valid" | "invalid" | "duplicate";
type ParsedRow = {
  rowNumber: number;
  data: Record<string, any>;
  custom: Record<string, any>;
  status: RowStatus;
  message: string;
  duplicateId?: string;
};

type Step = "upload" | "map" | "settings" | "preview" | "done";

function ImportPage() {
  const invalidate = useInvalidate();
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useList<any>("lead_categories", { key: ["all"] });
  const { data: callers = [] } = useCallers();
  const { data: history = [] } = useList<ImportRun>("imports", { order: { column: "created_at" } });
  const { data: customDefs = [] } = useList<any>("custom_field_defs", { order: { column: "label", asc: true } });

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceId, setSourceId] = useState<string>("");
  const [newSource, setNewSource] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [assignTo, setAssignTo] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "new">("skip");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ importId: string; imported: number; updated: number; skipped: number; failed: number } | null>(null);
  const [failures, setFailures] = useState<ParsedRow[]>([]);

  const customKeys = customDefs.map((d: any) => d.key as string);

  useEffect(() => {
    if (step === "map" && headers.length && !Object.keys(mapping).length) {
      setMapping(autoMap(headers, customKeys));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, headers, customDefs]);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setParsed([]);
    setSummary(null);
    setFailures([]);
    setProgress(0);
  };

  const onFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("The file has no sheets.");
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName]!, { defval: "" });
      if (!rows.length) throw new Error("The first sheet has no rows.");
      const hdrs = Object.keys(rows[0]!).filter((h) => h.trim() !== "");
      setFileName(file.name);
      setHeaders(hdrs);
      setRawRows(rows);
      setMapping(autoMap(hdrs, customKeys));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    }
  };

  const addSource = async () => {
    const name = newSource.trim();
    if (!name) return;
    try {
      const created = await insertRow("lead_sources", { name });
      setSourceId(created.id);
      setNewSource("");
      setAddingSource(false);
      invalidate("lead_sources");
      toast.success(`Source "${name}" added`);
    } catch {
      toast.error("Could not add that source");
    }
  };

  const validate = async () => {
    saveMemory(mapping);
    const mapped = rawRows.map((row, i) => {
      const data: Record<string, any> = {};
      const custom: Record<string, any> = {};
      Object.entries(mapping).forEach(([header, target]) => {
        if (!target) return;
        const value = String(row[header] ?? "").trim();
        if (!value) return;
        if (target.startsWith("custom:")) custom[target.slice(7)] = value;
        else data[target] = value;
      });
      return { rowNumber: i + 2, data, custom };
    });

    const phones = [...new Set(mapped.map((m) => normalizePhone(m.data['phone'])).filter(Boolean))] as string[];
    const emails = [...new Set(mapped.map((m) => String(m.data['email'] ?? "").toLowerCase()).filter(Boolean))];

    const db = supabase as any;
    const existing: any[] = [];
    if (phones.length) {
      for (let i = 0; i < phones.length; i += 200) {
        const { data } = await db
          .from("leads")
          .select("id,name,phone_normalized,email,company")
          .in("phone_normalized", phones.slice(i, i + 200));
        existing.push(...(data ?? []));
      }
    }
    if (emails.length) {
      const { data } = await db.from("leads").select("id,name,phone_normalized,email,company").not("email", "is", null);
      (data ?? []).forEach((l: any) => {
        if (l.email && emails.includes(String(l.email).toLowerCase()) && !existing.find((e) => e.id === l.id)) {
          existing.push(l);
        }
      });
    }

    const seen = new Set<string>();
    const result: ParsedRow[] = mapped.map((m) => {
      const name = m.data['name'] || m.data['company'];
      const phone = normalizePhone(m.data['phone']);
      const email = m.data['email'] ? String(m.data['email']).toLowerCase() : null;

      if (!name) return { ...m, status: "invalid" as const, message: "Missing name and company" };
      if (!phone && !email) return { ...m, status: "invalid" as const, message: "Missing phone number and email" };
      if (m.data['phone'] && !isValidPhone(m.data['phone']))
        return { ...m, status: "invalid" as const, message: "Phone number has fewer than 10 digits" };
      if (m.data['email'] && !isValidEmail(m.data['email']))
        return { ...m, status: "invalid" as const, message: "Email address is not valid" };

      const key = phone ? `p:${phone}` : `e:${email}`;
      if (seen.has(key)) return { ...m, status: "duplicate" as const, message: "Duplicate row inside this file" };
      seen.add(key);

      const company = String(m.data['company'] ?? "").toLowerCase();
      const match = existing.find(
        (e) =>
          (phone && e.phone_normalized === phone) ||
          (email && e.email && String(e.email).toLowerCase() === email) ||
          (company && phone && String(e.company ?? "").toLowerCase() === company && e.phone_normalized === phone),
      );
      if (match)
        return {
          ...m,
          status: "duplicate" as const,
          message: `Already in your CRM as "${match.name}"`,
          duplicateId: match.id,
        };

      return { ...m, status: "valid" as const, message: "Ready to import" };
    });

    setParsed(result);
    setStep("preview");
  };

  const runImport = async () => {
    setRunning(true);
    setProgress(0);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failedRows: ParsedRow[] = [];

    const categoryId = (name?: string) =>
      categories.find((c: any) => norm(c.name) === norm(name ?? ""))?.id ?? null;
    const sourceIdByName = (name?: string) =>
      sources.find((s: any) => norm(s.name) === norm(name ?? ""))?.id ?? null;

    // Remember any new custom fields so future imports recognise them.
    const usedCustom = [...new Set(Object.values(mapping).filter((t) => t.startsWith("custom:")).map((t) => t.slice(7)))];
    const newCustom = usedCustom.filter((k) => !customKeys.includes(k));
    if (newCustom.length) {
      const createdBy = await currentUserId();
      const labelOfKey = (key: string) =>
        Object.entries(mapping).find(([, t]) => t === `custom:${key}`)?.[0] ?? key;
      await (supabase as any)
        .from("custom_field_defs")
        .upsert(
          newCustom.map((key) => ({ key, label: labelOfKey(key), created_by: createdBy })),
          { onConflict: "key" },
        );
    }

    const run = await insertRow("imports", {
      file_name: fileName,
      source_id: sourceId || null,
      category_id: defaultCategoryId || null,
      assigned_to: assignTo || null,
      total_rows: parsed.length,
      mapping,
    });

    const importRowLogs: Record<string, any>[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      setProgress(Math.round(((i + 1) / parsed.length) * 100));
      try {
        if (row.status === "invalid") {
          failed++;
          failedRows.push(row);
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "FAILED", message: row.message, data: row.data });
          continue;
        }
        if (row.status === "duplicate" && duplicateMode === "skip") {
          skipped++;
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "SKIPPED", message: row.message, data: row.data });
          continue;
        }

        const address = [row.data['address'], row.data['pincode']].filter(Boolean).join(" ");
        const payload: Record<string, any> = {
          name: row.data['name'] || row.data['company'],
          company: row.data['company'] ?? null,
          contact_person: row.data['name'] ?? null,
          phone: row.data['phone'] ?? null,
          whatsapp: row.data['whatsapp'] ?? row.data['phone'] ?? null,
          email: row.data['email'] ?? null,
          website: row.data['website'] ?? null,
          address: address || null,
          city: row.data['city'] ?? null,
          state: row.data['state'] ?? null,
          country: row.data['country'] ?? null,
          company_size: row.data['company_size'] ?? null,
          service_interested: row.data['service_interested'] ?? null,
          notes: row.data['notes'] ?? null,
          deal_value: row.data['deal_value'] ? Number(String(row.data['deal_value']).replace(/[^\d.]/g, "")) || 0 : 0,
          category_id: categoryId(row.data['lead_category']) ?? defaultCategoryId ?? null,
          source_id: sourceIdByName(row.data['lead_source']) ?? sourceId ?? null,
          assigned_to: assignTo || null,
        };

        if (row.status === "duplicate" && duplicateMode === "update" && row.duplicateId) {
          const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== ""));
          await updateRow("leads", row.duplicateId, clean);
          updated++;
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "UPDATED", message: "Existing lead updated", data: row.data });
        } else {
          await insertRow("leads", {
            ...payload,
            status: "NEW",
            temperature: "WARM",
            stage: "INCOMING",
            qualification_status: "UNQUALIFIED",
            import_id: run.id,
            import_row_number: row.rowNumber,
            custom_fields: row.custom,
          });
          imported++;
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "IMPORTED", message: "Imported", data: { ...row.data, ...row.custom } });
        }
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : "Unknown error";
        failedRows.push({ ...row, message });
        importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "FAILED", message, data: row.data });
      }
    }

    if (importRowLogs.length) {
      const chunkSize = 200;
      for (let i = 0; i < importRowLogs.length; i += chunkSize) {
        await insertRows("import_rows", importRowLogs.slice(i, i + chunkSize));
      }
    }
    await updateRow("imports", run.id, {
      imported_rows: imported,
      updated_rows: updated,
      skipped_rows: skipped,
      failed_rows: failed,
    });
    await logAudit("LEADS_IMPORTED", "import", run.id, { imported, updated, skipped, failed, fileName });

    setSummary({ importId: run.id, imported, updated, skipped, failed });
    setFailures(failedRows);
    setRunning(false);
    setStep("done");
    invalidate("leads", "imports", "dashboard", "custom_field_defs", "caller-day");
    toast.success(`${imported} leads added to Incoming leads`);
  };

  const counts = {
    valid: parsed.filter((p) => p.status === "valid").length,
    duplicate: parsed.filter((p) => p.status === "duplicate").length,
    invalid: parsed.filter((p) => p.status === "invalid").length,
  };

  const mappedFields = Object.values(mapping).filter(Boolean);
  const canContinue = mappedFields.includes("name") || mappedFields.includes("company");
  const categoryName = (id: string | null) => categories.find((c: any) => c.id === id)?.name ?? "-";
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? "-";
  const callerName = (id: string | null) =>
    id ? (callers.find((c) => c.id === id)?.full_name ?? "Caller") : "Unassigned";

  return (
    <div>
      <PageHeader
        title="Import leads"
        description="Upload → check the column matches → choose source, category and caller → preview → import. Imported leads land in Incoming leads."
      />

      {step === "upload" && (
        <Surface>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center hover:border-primary/50">
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Choose an Excel or CSV file</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The first row must contain column headings. Any heading is fine — we read them and suggest matches.
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Upload className="size-4" /> Select file
            </span>
          </label>
        </Surface>
      )}

      {step === "map" && (
        <Surface className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Columns we found in your file</h2>
            <p className="text-sm text-muted-foreground">
              {fileName} · {rawRows.length} rows · {headers.length} columns. Change anything that looks wrong.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {headers.map((h) => {
              const value = mapping[h] ?? "";
              const customValue = `custom:${slug(h)}`;
              return (
                <div key={h} className="space-y-1.5 rounded-lg border border-border p-3">
                  <Label className="font-medium">{h}</Label>
                  <Select
                    value={value || "__ignore"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__ignore" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ignore">— Ignore this column —</SelectItem>
                      {TARGETS.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                      <SelectItem value={customValue}>Keep as custom field "{h}"</SelectItem>
                      {customDefs
                        .filter((d: any) => d.key !== slug(h))
                        .map((d: any) => (
                          <SelectItem key={d.key} value={`custom:${d.key}`}>
                            Custom field: {d.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="truncate text-xs text-muted-foreground">
                    Example: {String(rawRows[0]?.[h] ?? "—")}
                  </p>
                  {!value && (
                    <p className="text-xs text-warning">
                      Not matched — ignore it, or keep it as a custom field so the data is not lost.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>Start over</Button>
            <Button onClick={() => setStep("settings")} disabled={!canContinue}>
              Continue
            </Button>
          </div>
          {!canContinue && (
            <p className="text-sm text-warning">Match at least a Full name or Company column to continue.</p>
          )}
        </Surface>
      )}

      {step === "settings" && (
        <Surface className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Import settings</h2>
            <p className="text-sm text-muted-foreground">
              These apply to every row. If your file has its own Source or Category column, the file wins.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Where did these leads come from?</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Select a source" /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addingSource ? (
                <div className="flex gap-2">
                  <Input
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="New source name"
                  />
                  <Button size="sm" onClick={() => void addSource()}>Add</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setAddingSource(true)}>
                  <Plus className="size-4" /> Add new source
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={defaultCategoryId} onValueChange={setDefaultCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to caller</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger><SelectValue placeholder="Nobody (assign later)" /></SelectTrigger>
                <SelectContent>
                  {callers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>When a lead already exists</Label>
              <Select value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip it (recommended)</SelectItem>
                  <SelectItem value="update">Fill in blank fields on the existing lead</SelectItem>
                  <SelectItem value="new">Import as a separate lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-3 py-2 text-sm">
              Initial status: <b>NEW</b>
            </div>
            <div className="rounded-lg border border-border px-3 py-2 text-sm">
              Initial stage: <b>INCOMING</b>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("map")}>Back</Button>
            <Button onClick={() => void validate()}>Preview import</Button>
          </div>
        </Surface>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total rows" value={parsed.length} />
            <KpiCard label="New leads" value={counts.valid} tone="success" />
            <KpiCard label="Duplicates" value={counts.duplicate} tone="warning" />
            <KpiCard label="Invalid rows" value={counts.invalid} tone="danger" />
          </div>
          <Surface className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Source <b>{sourceName(sourceId || null)}</b> · Category <b>{categoryName(defaultCategoryId || null)}</b> ·
              Caller <b>{callerName(assignTo || null)}</b>. Duplicates will be{" "}
              <b>
                {duplicateMode === "skip" ? "skipped" : duplicateMode === "update" ? "used to fill blank fields" : "imported as new leads"}
              </b>
              . Nothing is written to your database until you press Import.
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.slice(0, 300).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-1.5">{r.data['name'] ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.data['company'] ?? "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.data['phone'] ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.data['city'] ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <StatusPill
                          label={r.message}
                          tone={r.status === "valid" ? "success" : r.status === "duplicate" ? "warning" : "danger"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {running && <Progress value={progress} />}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStep("settings")} disabled={running}>Cancel</Button>
              <Button
                onClick={() => void runImport()}
                disabled={running || counts.valid + (duplicateMode === "skip" ? 0 : counts.duplicate) === 0}
              >
                {running ? `Importing… ${progress}%` : "Import leads"}
              </Button>
            </div>
          </Surface>
        </div>
      )}

      {step === "done" && summary && (
        <Surface className="space-y-4">
          <h2 className="text-sm font-semibold">Import finished</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Imported" value={summary.imported} tone="success" />
            <KpiCard label="Updated" value={summary.updated} tone="accent" />
            <KpiCard label="Skipped" value={summary.skipped} tone="warning" />
            <KpiCard label="Failed" value={summary.failed} tone="danger" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/incoming" search={{ importId: summary.importId } as never}>View these leads</Link>
            </Button>
            {failures.length > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    `import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
                    failures.map((f) => ({ Row: f.rowNumber, Reason: f.message, ...f.data })),
                  )
                }
              >
                Download error report
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </Surface>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Import history</h2>
        {history.length === 0 ? (
          <EmptyState title="No imports yet" description="Your past imports and their results will be listed here." />
        ) : (
          <Surface className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{h.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(h.created_at)} · {h.total_rows} rows · {sourceName(h.source_id)} ·{" "}
                    {categoryName((h as any).category_id)} · {callerName((h as any).assigned_to)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill label={`${h.imported_rows} imported`} tone="success" />
                  <StatusPill label={`${h.updated_rows} updated`} tone="accent" />
                  <StatusPill label={`${h.skipped_rows} skipped`} tone="warning" />
                  <StatusPill label={`${h.failed_rows} failed`} tone={h.failed_rows ? "danger" : "neutral"} />
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/incoming" search={{ importId: h.id } as never}>Open</Link>
                  </Button>
                </div>
              </div>
            ))}
          </Surface>
        )}
      </div>
    </div>
  );
}
