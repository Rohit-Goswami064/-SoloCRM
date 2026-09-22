/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Surface, EmptyState, KpiCard } from "@/components/crm/Common";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
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
import { FileSpreadsheet, Upload } from "lucide-react";
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

/** Target fields the importer understands, with the header aliases it recognises. */
const IMPORT_HELP = "Excel values win over these defaults when the column is mapped.";

const TARGETS: { key: string; label: string; aliases: string[] }[] = [
  { key: "name", label: "Name", aliases: ["name", "lead name", "full name", "client name", "contact name", "person"] },
  { key: "company", label: "Company", aliases: ["company", "company name", "business", "business name", "firm", "organisation", "organization"] },
  { key: "contact_person", label: "Contact person", aliases: ["contact person", "contact", "owner", "poc"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "mobile number", "mobile no", "contact number", "phone no", "tel", "telephone"] },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whatsapp number", "wa", "whats app"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail", "mail", "email id"] },
  { key: "website", label: "Website", aliases: ["website", "web", "url", "site"] },
  { key: "address", label: "Address", aliases: ["address", "street", "location", "full address"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state", "region", "province"] },
  { key: "country", label: "Country", aliases: ["country"] },
  { key: "company_size", label: "Company size", aliases: ["company size", "employees", "size", "team size"] },
  { key: "service_interested", label: "Service interested", aliases: ["service", "service interested", "requirement", "interested in"] },
  { key: "city_category", label: "Category", aliases: ["category", "industry", "segment", "business type", "type"] },
  { key: "lead_source", label: "Source", aliases: ["source", "lead source", "channel", "platform", "came from"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "remark", "remarks", "comment", "comments", "description"] },
  { key: "deal_value", label: "Deal value", aliases: ["deal value", "value", "amount", "budget", "estimated value", "price"] },
];

const norm = (s: string) => s.toLowerCase().trim().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

function autoMap(headers: string[]) {
  const mapping: Record<string, string> = {};
  headers.forEach((h) => {
    const n = norm(h);
    const hit = TARGETS.find((t) => t.aliases.includes(n)) ?? TARGETS.find((t) => t.aliases.some((a) => n.includes(a)));
    if (hit && !Object.values(mapping).includes(hit.key)) mapping[h] = hit.key;
  });
  return mapping;
}

type RowStatus = "valid" | "invalid" | "duplicate";
type ParsedRow = {
  rowNumber: number;
  data: Record<string, any>;
  status: RowStatus;
  message: string;
  duplicateId?: string;
};

type Step = "upload" | "map" | "review" | "done";

function ImportPage() {
  const invalidate = useInvalidate();
  const { data: sources = [] } = useSources();
  const { data: categories = [] } = useList<any>("lead_categories", { key: ["all"] });
  const { data: callers = [] } = useCallers();
  const { data: history = [] } = useList<ImportRun>("imports", { order: { column: "created_at" } });

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceId, setSourceId] = useState<string>("");
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>("");
  const [assignTo, setAssignTo] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "new">("skip");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; updated: number; skipped: number; failed: number } | null>(null);
  const [failures, setFailures] = useState<ParsedRow[]>([]);

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
      const hdrs = Object.keys(rows[0]!);
      setFileName(file.name);
      setHeaders(hdrs);
      setRawRows(rows);
      setMapping(autoMap(hdrs));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    }
  };

  const validate = async () => {
    const mapped = rawRows.map((row, i) => {
      const data: Record<string, any> = {};
      Object.entries(mapping).forEach(([header, target]) => {
        if (!target) return;
        const value = String(row[header] ?? "").trim();
        if (value) data[target] = value;
      });
      return { rowNumber: i + 2, data };
    });

    const phones = [...new Set(mapped.map((m) => normalizePhone(m.data['phone'])).filter(Boolean))] as string[];
    const emails = [...new Set(mapped.map((m) => String(m.data['email'] ?? "").toLowerCase()).filter(Boolean))];

    const db = supabase as any;
    const existing: any[] = [];
    if (phones.length) {
      const { data } = await db.from("leads").select("id,name,phone_normalized,email,company").in("phone_normalized", phones);
      existing.push(...(data ?? []));
    }
    if (emails.length) {
      const { data } = await db.from("leads").select("id,name,phone_normalized,email,company");
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

      const match = existing.find(
        (e) =>
          (phone && e.phone_normalized === phone) ||
          (email && e.email && String(e.email).toLowerCase() === email),
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
    setStep("review");
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

    const run = await insertRow("imports", {
      file_name: fileName,
      source_id: sourceId || null,
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

        const payload: Record<string, any> = {
          name: row.data['name'] || row.data['company'],
          company: row.data['company'] ?? null,
          contact_person: row.data['contact_person'] ?? null,
          phone: row.data['phone'] ?? null,
          whatsapp: row.data['whatsapp'] ?? row.data['phone'] ?? null,
          email: row.data['email'] ?? null,
          website: row.data['website'] ?? null,
          address: row.data['address'] ?? null,
          city: row.data['city'] ?? null,
          state: row.data['state'] ?? null,
          country: row.data['country'] ?? null,
          company_size: row.data['company_size'] ?? null,
          service_interested: row.data['service_interested'] ?? null,
          notes: row.data['notes'] ?? null,
          deal_value: row.data['deal_value'] ? Number(String(row.data['deal_value']).replace(/[^\d.]/g, "")) || 0 : 0,
          category_id: categoryId(row.data['city_category']) ?? defaultCategoryId ?? null,
          source_id: sourceIdByName(row.data['lead_source']) ?? sourceId ?? null,
          assigned_to: assignTo || null,
        };

        if (row.status === "duplicate" && duplicateMode === "update" && row.duplicateId) {
          const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== ""));
          await updateRow("leads", row.duplicateId, clean);
          updated++;
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "UPDATED", message: "Existing lead updated", data: row.data });
        } else {
          await insertRow("leads", { ...payload, status: "NEW", temperature: "WARM" });
          imported++;
          importRowLogs.push({ import_id: run.id, row_number: row.rowNumber, status: "IMPORTED", message: "Imported", data: row.data });
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
    await currentUserId();

    setSummary({ imported, updated, skipped, failed });
    setFailures(failedRows);
    setRunning(false);
    setStep("done");
    invalidate("leads", "imports", "dashboard");
    toast.success(`${imported} leads imported`);
  };

  const counts = {
    valid: parsed.filter((p) => p.status === "valid").length,
    duplicate: parsed.filter((p) => p.status === "duplicate").length,
    invalid: parsed.filter((p) => p.status === "invalid").length,
  };

  return (
    <div>
      <PageHeader
        title="Import leads"
        description="Excel or CSV — columns are matched automatically and nothing is overwritten without your say-so."
      />

      {step === "upload" && (
        <Surface>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center hover:border-primary/50">
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Choose an Excel or CSV file</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The first row must contain column headings such as Name, Mobile Number, Email, City.
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
            <h2 className="text-sm font-semibold">Map your columns</h2>
            <p className="text-sm text-muted-foreground">
              {fileName} · {rawRows.length} rows. We matched what we recognised — adjust anything below.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {headers.map((h) => (
              <div key={h} className="space-y-1.5">
                <Label>{h}</Label>
                <Select
                  value={mapping[h] ?? "__ignore"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "__ignore" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ignore">— Ignore this column —</SelectItem>
                    {TARGETS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="truncate text-xs text-muted-foreground">
                  Example: {String(rawRows[0]?.[h] ?? "—")}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{IMPORT_HELP}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Default source for every imported row</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Select a source" /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default category for every imported row</Label>
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
              <Label>Assign every imported lead to</Label>
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
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>Start over</Button>
            <Button onClick={validate} disabled={!Object.values(mapping).includes("name") && !Object.values(mapping).includes("company")}>
              Validate rows
            </Button>
          </div>
          {!Object.values(mapping).includes("name") && !Object.values(mapping).includes("company") && (
            <p className="text-sm text-warning">Map at least a Name or Company column to continue.</p>
          )}
        </Surface>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Ready to import" value={counts.valid} tone="success" />
            <KpiCard label="Duplicates" value={counts.duplicate} tone="warning" />
            <KpiCard label="Invalid" value={counts.invalid} tone="danger" />
          </div>
          <Surface className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Duplicates will be{" "}
              <b>
                {duplicateMode === "skip" ? "skipped" : duplicateMode === "update" ? "used to fill blank fields" : "imported as new leads"}
              </b>
              . Invalid rows are never imported and appear in the error report.
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.slice(0, 300).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-1.5">{r.data['name'] ?? r.data['company'] ?? "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.data['phone'] ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.data['email'] ?? "—"}</td>
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
              <Button variant="ghost" onClick={() => setStep("map")} disabled={running}>Back to mapping</Button>
              <Button onClick={runImport} disabled={running || counts.valid + (duplicateMode === "skip" ? 0 : counts.duplicate) === 0}>
                {running ? `Importing… ${progress}%` : "Import now"}
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
            <Button asChild><Link to="/leads">View leads</Link></Button>
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
                    {formatDateTime(h.created_at)} · {h.total_rows} rows ·{" "}
                    {sources.find((s) => s.id === h.source_id)?.name ?? "No source"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusPill label={`${h.imported_rows} imported`} tone="success" />
                  <StatusPill label={`${h.updated_rows} updated`} tone="accent" />
                  <StatusPill label={`${h.skipped_rows} skipped`} tone="warning" />
                  <StatusPill label={`${h.failed_rows} failed`} tone={h.failed_rows ? "danger" : "neutral"} />
                </div>
              </div>
            ))}
          </Surface>
        )}
      </div>
    </div>
  );
}
