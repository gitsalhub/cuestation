import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole, StaffPermissions } from "@/contexts/AuthContext";
import AppLayout from "./AppLayout";

interface Props {
  children: ReactNode;
  roles?: AppRole[];
  permission?: keyof StaffPermissions;
}

const ProtectedRoute = ({ children, roles, permission }: Props) => {
  const { user, loading, role, permissions, subscriptionExpired, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (subscriptionExpired && role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="glass-card max-w-md w-full p-8 text-center border border-destructive/40 rounded-xl">
          <div className="text-4xl mb-3">⛔</div>
          <h1 className="text-2xl font-bold mb-2 text-destructive">Subscription Expired</h1>
          <p className="text-muted-foreground mb-6">
            Your subscription has expired. Please subscribe to continue using the system.
            <br /><br />
            To subscribe, contact your <span className="text-primary font-semibold">Sales Executive</span>.
          </p>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 rounded-md bg-gradient-primary text-primary-foreground font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (roles && role && !roles.includes(role)) return <Navigate to="/" replace />;
  if (permission && role === "staff" && !permissions[permission]) return <Navigate to="/" replace />;

  return <AppLayout>{children}</AppLayout>;
};

export default ProtectedRoute;
