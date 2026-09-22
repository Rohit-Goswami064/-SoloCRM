/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

type Hit = { id: string; label: string; sub?: string; to: string };

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = term.trim().replace(/[%,]/g, " ");
      if (s.length < 2) {
        setHits([]);
        return;
      }
      setLoading(true);
      const db = supabase as any;
      const [leads, customers, projects, notes] = await Promise.all([
        db
          .from("leads")
          .select("id,name,company,phone")
          .or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
          .limit(6),
        db
          .from("customers")
          .select("id,name,company")
          .or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
          .limit(5),
        db.from("projects").select("id,name").ilike("name", `%${s}%`).limit(5),
        db.from("notes").select("id,body,lead_id").ilike("body", `%${s}%`).limit(5),
      ]);
      const result: Hit[] = [
        ...(leads.data ?? []).map((l: any) => ({
          id: `lead-${l.id}`,
          label: l.name,
          sub: [l.company, l.phone].filter(Boolean).join(" · ") || "Lead",
          to: `/leads/${l.id}`,
        })),
        ...(customers.data ?? []).map((c: any) => ({
          id: `cust-${c.id}`,
          label: c.name,
          sub: c.company || "Customer",
          to: `/customers`,
        })),
        ...(projects.data ?? []).map((p: any) => ({
          id: `proj-${p.id}`,
          label: p.name,
          sub: "Project",
          to: `/projects/${p.id}`,
        })),
        ...(notes.data ?? [])
          .filter((n: any) => n.lead_id)
          .map((n: any) => ({
            id: `note-${n.id}`,
            label: String(n.body).slice(0, 60),
            sub: "Note",
            to: `/leads/${n.lead_id}`,
          })),
      ];
      setHits(result);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search leads, customers, projects, notes…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? "Searching…" : term.length < 2 ? "Type at least 2 characters." : "No results."}
        </CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Results">
            {hits.map((h) => (
              <CommandItem
                key={h.id}
                value={`${h.label} ${h.sub ?? ""} ${h.id}`}
                onSelect={() => {
                  onOpenChange(false);
                  setTerm("");
                  navigate({ to: h.to as never });
                }}
              >
                <div className="flex flex-col">
                  <span>{h.label}</span>
                  {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
