import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Map, Timer, ShoppingCart, Receipt, Tag, ArrowLeftRight,
  BarChart3, Package, Boxes, DollarSign, Users, LogOut, Gamepad2, Building2,
  ChevronLeft, ChevronRight, Calendar, Database, Palette, KeyRound, Wallet
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, Theme } from "@/contexts/ThemeContext";
import { useCashDrawer } from "@/contexts/CashDrawerContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff", "super_admin"], perm: null },
  { to: "/floor", label: "Floor Map", icon: Map, roles: ["admin", "staff"], perm: "floor_map" as const },
  { to: "/sessions", label: "Sessions", icon: Timer, roles: ["admin", "staff"], perm: "sessions" as const },
  { to: "/pending-payments", label: "Pending Payments", icon: Wallet, roles: ["admin", "staff"], perm: "sessions" as const },
  { to: "/bookings", label: "Bookings", icon: Calendar, roles: ["admin", "staff"], perm: "sessions" as const },
  { to: "/counter", label: "Counter Sale", icon: ShoppingCart, roles: ["admin", "staff"], perm: "counter_sale" as const },
  { to: "/expenses", label: "Expenses", icon: Receipt, roles: ["admin", "staff"], perm: "expenses" as const },
  { to: "/offers", label: "Offers", icon: Tag, roles: ["admin"], perm: null },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight, roles: ["admin", "staff"], perm: "sessions" as const },
  { to: "/products", label: "Products", icon: Package, roles: ["admin"], perm: null },
  { to: "/assets", label: "Assets", icon: Boxes, roles: ["admin"], perm: null },
  { to: "/rates", label: "Rate Profiles", icon: DollarSign, roles: ["admin"], perm: null },
  { to: "/staff", label: "Staff", icon: Users, roles: ["admin"], perm: null },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"], perm: null },
  { to: "/cash-drawer", label: "Cash Drawer", icon: Wallet, roles: ["admin"], perm: null },
  { to: "/cafes", label: "Cafes", icon: Building2, roles: ["super_admin"], perm: null },
  { to: "/db-browser", label: "DB Browser", icon: Database, roles: ["super_admin"], perm: null },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { role, permissions, user, cafeId, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "1");
  const [cafeName, setCafeName] = useState<string>("");
  const [pwdOpen, setPwdOpen] = useState(false);

  const [cafeLogo, setCafeLogo] = useState<string>("");
  useEffect(() => {
    if (!cafeId) { setCafeName(""); setCafeLogo(""); return; }
    supabase.from("cafes").select("name, logo_url").eq("id", cafeId).maybeSingle().then(({ data }) => {
      setCafeName(data?.name || "");
      setCafeLogo((data as any)?.logo_url || "");
    });
  }, [cafeId]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("sidebar_collapsed", n ? "1" : "0");
      return n;
    });
  };

  const items = navItems.filter((it) => {
    if (!role || !it.roles.includes(role)) return false;
    if (role === "staff" && it.perm && !permissions[it.perm]) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex">
      <aside className={cn(
        "bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200 relative",
        collapsed ? "w-16" : "w-64"
      )}>
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center hover:bg-sidebar-accent"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
        <div className={cn("border-b border-sidebar-border", collapsed ? "p-3" : "p-6")}>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-primary flex items-center justify-center overflow-hidden">
              {cafeLogo
                ? <img src={cafeLogo} alt="logo" className="w-full h-full object-cover" />
                : <Gamepad2 className="w-5 h-5 text-primary-foreground" />}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-bold neon-text truncate">{cafeName || "Game Station"}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{role?.replace("_", " ")}</div>
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} end={to === "/"} title={collapsed ? label : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-sidebar-accent text-primary border border-primary/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Palette className="w-3 h-3 text-muted-foreground shrink-0" />
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="gaming">Gaming</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {!collapsed && <div className="text-xs text-muted-foreground truncate px-2">{user?.email}</div>}
          <Button variant="ghost" size={collapsed ? "icon" : "default"}
            className={cn("text-sidebar-foreground", collapsed ? "w-full" : "w-full justify-start")}
            title={collapsed ? "Change password" : undefined}
            onClick={() => setPwdOpen(true)}>
            <KeyRound className="w-4 h-4" />
            {!collapsed && <span className="ml-2">Change password</span>}
          </Button>
          <Button variant="ghost" size={collapsed ? "icon" : "default"}
            className={cn("text-sidebar-foreground", collapsed ? "w-full" : "w-full justify-start")}
            title={collapsed ? "Sign out" : undefined}
            onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4" />
            {!collapsed && <span className="ml-2">Sign out</span>}
          </Button>
        </div>
      </aside>
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      <main className="flex-1 overflow-auto">
        {cafeName && (
          <div className="border-b border-border bg-card/50 backdrop-blur px-8 py-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{cafeName}</span>
          </div>
        )}
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
