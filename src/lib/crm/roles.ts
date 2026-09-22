/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "ADMIN" | "CALLER";

export type Me = {
  userId: string;
  email: string | null;
  role: AppRole;
  fullName: string | null;
};

const client = () => supabase as any;

/** Current signed-in user together with the role stored in Supabase. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Me | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;
      const { data: roles } = await client()
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const { data: profile } = await client()
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const isAdmin = (roles ?? []).some((r: any) => r.role === "ADMIN");
      return {
        userId: user.id,
        email: user.email ?? null,
        role: isAdmin ? "ADMIN" : "CALLER",
        fullName: profile?.full_name ?? null,
      };
    },
  });
}

export function useIsAdmin() {
  const { data, isLoading } = useMe();
  return { isAdmin: data?.role === "ADMIN", loading: isLoading, me: data ?? null };
}

export type CallerAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  role: AppRole;
};

/** Admin-only: every account in the workspace with its role. */
export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async (): Promise<CallerAccount[]> => {
      const { data: roles, error } = await client().from("user_roles").select("user_id, role");
      if (error) throw error;
      const { data: profiles } = await client()
        .from("profiles")
        .select("id, full_name, email, phone, is_active");
      const roleById = new Map((roles ?? []).map((r: any) => [r.user_id, r.role as AppRole]));
      return (profiles ?? [])
        .map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          is_active: p.is_active !== false,
          role: (roleById.get(p.id) ?? "CALLER") as AppRole,
        }))
        .sort((a: CallerAccount, b: CallerAccount) =>
          a.role === b.role
            ? (a.full_name ?? "").localeCompare(b.full_name ?? "")
            : a.role === "ADMIN"
              ? -1
              : 1,
        );
    },
  });
}

/** Only the caller accounts — used for assignment dropdowns. */
export function useCallers() {
  const { data = [], ...rest } = useTeam();
  return { data: data.filter((m) => m.role === "CALLER" && m.is_active), ...rest };
}
