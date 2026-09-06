import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CashDrawerProvider } from "@/contexts/CashDrawerContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import FloorMap from "./pages/FloorMap";
import Sessions from "./pages/Sessions";
import PendingPayments from "./pages/PendingPayments";
import CashDrawer from "./pages/CashDrawer";
import Counter from "./pages/Counter";
import Expenses from "./pages/Expenses";
import Offers from "./pages/Offers";
import Transfers from "./pages/Transfers";
import Products from "./pages/Products";
import Assets from "./pages/Assets";
import Rates from "./pages/Rates";
import Staff from "./pages/Staff";
import Analytics from "./pages/Analytics";
import Cafes from "./pages/Cafes";
import Bookings from "./pages/Bookings";
import DbBrowser from "./pages/DbBrowser";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Create the Watermark component
const GlobalWatermark = () => {
  const { subscriptionExpiresAt } = useAuth();

  if (!subscriptionExpiresAt) return null;

  // Bypass timezone shifts by checking the raw string from the database
  const expStr = String(subscriptionExpiresAt);
  const isTrial = expStr.includes("23:59");
  
  if (!isTrial) return null; // Hide completely for Paid subscriptions

  const exp = new Date(subscriptionExpiresAt);
  const diffDays = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] pointer-events-none bg-background/70 backdrop-blur-sm border border-border px-3 py-2 rounded-lg shadow-lg flex flex-col items-end">
      <span className="text-xs font-bold text-primary uppercase tracking-widest">
        Trial Version
      </span>
      <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
        {diffDays} day{diffDays !== 1 ? "s" : ""} remaining
      </span>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <GlobalWatermark />
            <CashDrawerProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="/floor" element={<ProtectedRoute permission="floor_map"><FloorMap /></ProtectedRoute>} />
              <Route path="/sessions" element={<ProtectedRoute permission="sessions"><Sessions /></ProtectedRoute>} />
              <Route path="/pending-payments" element={<ProtectedRoute permission="pending_payments"><PendingPayments /></ProtectedRoute>} />
              <Route path="/counter" element={<ProtectedRoute permission="counter_sale"><Counter /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute permission="expenses"><Expenses /></ProtectedRoute>} />
              <Route path="/offers" element={<ProtectedRoute roles={["admin","staff"]} permission="offers"><Offers /></ProtectedRoute>} />
              <Route path="/transfers" element={<ProtectedRoute permission="transfers"><Transfers /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute roles={["admin","staff"]} permission="products"><Products /></ProtectedRoute>} />
              <Route path="/assets" element={<ProtectedRoute roles={["admin","staff"]} permission="assets"><Assets /></ProtectedRoute>} />
              <Route path="/rates" element={<ProtectedRoute roles={["admin","staff"]} permission="rate_profiles"><Rates /></ProtectedRoute>} />
              <Route path="/staff" element={<ProtectedRoute roles={["admin"]}><Staff /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute roles={["admin","staff"]} permission="analytics"><Analytics /></ProtectedRoute>} />
              <Route path="/cash-drawer" element={<ProtectedRoute roles={["admin","staff"]} permission="cash_drawer"><CashDrawer /></ProtectedRoute>} />
              <Route path="/bookings" element={<ProtectedRoute permission="bookings"><Bookings /></ProtectedRoute>} />
              <Route path="/cafes" element={<ProtectedRoute roles={["super_admin"]}><Cafes /></ProtectedRoute>} />
              <Route path="/db-browser" element={<ProtectedRoute roles={["super_admin"]}><DbBrowser /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </CashDrawerProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;