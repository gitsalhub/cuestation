import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "staff";
export type StaffPermissions = {
  floor_map?: boolean;
  sessions?: boolean;
  pending_payments?: boolean;
  bookings?: boolean;
  transfers?: boolean;
  counter_sale?: boolean;
  expenses?: boolean;
  bill_override?: boolean;
};

// Permissions that were historically covered by the generic "sessions" toggle.
// For backward compatibility, when an admin hasn't explicitly set one of these,
// fall back to the staff member's "sessions" permission so existing access is
// preserved until the admin fine-tunes it.
const SESSIONS_FALLBACK_PERMS = new Set<keyof StaffPermissions>([
  "pending_payments",
  "bookings",
  "transfers",
]);

export const hasPermission = (
  permissions: StaffPermissions,
  key: keyof StaffPermissions,
): boolean => {
  if (permissions[key] !== undefined) return !!permissions[key];
  if (SESSIONS_FALLBACK_PERMS.has(key)) return !!permissions.sessions;
  return false;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  cafeId: string | null;
  permissions: StaffPermissions;
  subscriptionExpired: boolean;
  subscriptionExpiresAt: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [cafeId, setCafeId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions>({});
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);

  const loadUserData = async (userId: string) => {
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role, permissions")
        .eq("user_id", userId)
        .order("role", { ascending: true })
        .maybeSingle(),
      supabase.from("profiles").select("cafe_id").eq("id", userId).maybeSingle(),
    ]);
    const r = (roleRow?.role as AppRole) ?? null;
    setRole(r);
    setPermissions((roleRow?.permissions as StaffPermissions) ?? {});
    setCafeId(profile?.cafe_id ?? null);

    let expired = false;
    let expiresAt: string | null = null;
    if (profile?.cafe_id && r !== "super_admin") {
      const { data: cafe } = await supabase
        .from("cafes")
        .select("subscription_expires_at, active")
        .eq("id", profile.cafe_id)
        .maybeSingle();
      expiresAt = cafe?.subscription_expires_at ?? null;
      if (cafe && (cafe.active === false || (expiresAt && new Date(expiresAt).getTime() < Date.now()))) {
        expired = true;
      }
    }
    setSubscriptionExpiresAt(expiresAt);
    setSubscriptionExpired(expired);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setRole(null);
        setCafeId(null);
        setPermissions({});
        setSubscriptionExpired(false);
        setSubscriptionExpiresAt(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadUserData(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, cafeId, permissions, subscriptionExpired, subscriptionExpiresAt, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
