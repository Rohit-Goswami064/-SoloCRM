import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  UserCheck,
  CalendarClock,
  ListTodo,
  FolderKanban,
  Wallet,
  History,
  Upload,
  Radio,
  Tags,
  BarChart3,
  Files as FilesIcon,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  LogOut,
  Menu,
  Headphones,
  Inbox,
} from "lucide-react";
import { useIsAdmin } from "@/lib/crm/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";

type NavItem = { to: string; label: string; icon: typeof Users };

export const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incoming", label: "Incoming Leads", icon: Inbox },
  { to: "/leads", label: "Main Leads", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { to: "/customers", label: "Customers", icon: UserCheck },
  { to: "/import", label: "Import Leads", icon: Upload },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/callers", label: "Callers", icon: Headphones },
  { to: "/activities", label: "Activities", icon: History },
  { to: "/sources", label: "Lead Sources", icon: Radio },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/files", label: "Files", icon: FilesIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const CALLER_NAV: NavItem[] = [
  { to: "/dashboard", label: "My Day", icon: LayoutDashboard },
  { to: "/incoming", label: "Incoming Leads", icon: Inbox },
  { to: "/leads", label: "Main Leads", icon: Users },
  { to: "/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { to: "/activities", label: "My Activity", icon: History },
];

function NavLinks({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        const link = (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin } = useIsAdmin();
  const items = isAdmin ? ADMIN_NAV : CALLER_NAV;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setCollapsed(localStorage.getItem("crm.sidebar.collapsed") === "1");
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("crm.sidebar.collapsed", c ? "0" : "1");
      return !c;
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-3 transition-[width] md:flex",
            collapsed ? "w-[68px]" : "w-60",
          )}
        >
          <div className={cn("mb-4 flex items-center gap-2 px-4", collapsed && "justify-center px-2")}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              C
            </div>
            {!collapsed && <span className="truncate font-semibold">SoloCRM</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavLinks items={items} collapsed={collapsed} />
          </div>
          <div className="px-2 pt-2">
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={toggle}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed && <span className="ml-2">Collapse</span>}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-0 pt-10">
                <SheetTitle className="px-4 pb-3 text-base">SoloCRM</SheetTitle>
                <div className="overflow-y-auto pb-6">
                  <NavLinks items={items} collapsed={false} onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground sm:max-w-md"
            >
              <Search className="size-4" />
              <span className="truncate">Search leads, customers, projects…</span>
            </button>
            <div className="flex-1" />
            <NotificationCenter />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </header>

          <main className="min-w-0 flex-1 p-3 pb-20 sm:p-5 md:pb-5">{children}</main>

          {/* Mobile bottom navigation */}
          <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-sidebar py-1.5 md:hidden">
            {items.slice(0, 5).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
                  className="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] text-muted-foreground [&.active]:text-primary"
                  activeProps={{ className: "active" }}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
