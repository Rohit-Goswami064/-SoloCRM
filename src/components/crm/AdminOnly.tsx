import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/lib/crm/roles";
import { LoadingRows } from "./Common";

/** Shows a page only to the admin. The database enforces the same rule. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="size-8 text-warning" />
        <h2 className="text-lg font-semibold">Admin only</h2>
        <p className="text-sm text-muted-foreground">
          This section is available to the admin. You can work on the leads assigned to you.
        </p>
        <Button asChild>
          <Link to="/leads">Go to my leads</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
