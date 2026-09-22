/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "./Common";
import { DOC_TYPES, formatDate } from "@/lib/crm/constants";
import {
  currentUserId,
  deleteRow,
  insertRow,
  logActivity,
  useInvalidate,
  useList,
  type CrmFile,
} from "@/lib/crm/db";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./FormDialog";

export function FileManager({
  leadId,
  customerId,
  projectId,
}: {
  leadId?: string;
  customerId?: string;
  projectId?: string;
}) {
  const invalidate = useInvalidate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("Other");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<CrmFile | null>(null);

  const scopeKey = leadId ?? customerId ?? projectId ?? "all";
  const { data: files = [], isLoading } = useList<CrmFile>("files", {
    key: [scopeKey],
    order: { column: "created_at" },
    filters: (q) => {
      if (leadId) return q.eq("lead_id", leadId);
      if (customerId) return q.eq("customer_id", customerId);
      if (projectId) return q.eq("project_id", projectId);
      return q;
    },
  });

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const uid = await currentUserId();
      const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("crm-files").upload(path, file);
      if (error) throw error;
      await insertRow("files", {
        lead_id: leadId ?? null,
        customer_id: customerId ?? null,
        project_id: projectId ?? null,
        path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        doc_type: docType,
      });
      await logActivity({
        type: "FILE",
        title: `File uploaded: ${file.name}`,
        body: docType,
        lead_id: leadId ?? null,
        customer_id: customerId ?? null,
        project_id: projectId ?? null,
      });
      toast.success("File uploaded");
      invalidate("files");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (f: CrmFile) => {
    const { data, error } = await supabase.storage.from("crm-files").createSignedUrl(f.path, 60);
    if (error || !data) {
      toast.error("Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (f: CrmFile) => {
    await supabase.storage.from("crm-files").remove([f.path]);
    await deleteRow("files", f.id);
    toast.success("File removed");
    invalidate("files");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {busy ? "Uploading…" : "Upload file"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading files…</p>
      ) : files.length === 0 ? (
        <EmptyState
          title="No files yet"
          description="Upload proposals, invoices, contracts or screenshots. Links are private and expire after a minute."
          icon={<Paperclip className="size-6" />}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {f.doc_type} · {Math.round(Number(f.size_bytes ?? 0) / 1024)} KB · {formatDate(f.created_at)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => open(f)} aria-label="Open file">
                  <Download className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setToDelete(f)} aria-label="Delete file">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete this file?"
        description={`${toDelete?.file_name ?? ""} will be permanently removed from secure storage.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (toDelete) await remove(toDelete);
          setToDelete(null);
        }}
      />
    </div>
  );
}
