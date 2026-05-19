import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import FloorMap from "./pages/FloorMap";
import Sessions from "./pages/Sessions";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/floor" element={<ProtectedRoute permission="floor_map"><FloorMap /></ProtectedRoute>} />
              <Route path="/sessions" element={<ProtectedRoute permission="sessions"><Sessions /></ProtectedRoute>} />
              <Route path="/counter" element={<ProtectedRoute permission="counter_sale"><Counter /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute permission="expenses"><Expenses /></ProtectedRoute>} />
              <Route path="/offers" element={<ProtectedRoute roles={["admin"]}><Offers /></ProtectedRoute>} />
              <Route path="/transfers" element={<ProtectedRoute permission="sessions"><Transfers /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute roles={["admin"]}><Products /></ProtectedRoute>} />
              <Route path="/assets" element={<ProtectedRoute roles={["admin"]}><Assets /></ProtectedRoute>} />
              <Route path="/rates" element={<ProtectedRoute roles={["admin"]}><Rates /></ProtectedRoute>} />
              <Route path="/staff" element={<ProtectedRoute roles={["admin"]}><Staff /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute roles={["admin"]}><Analytics /></ProtectedRoute>} />
              <Route path="/bookings" element={<ProtectedRoute permission="sessions"><Bookings /></ProtectedRoute>} />
              <Route path="/cafes" element={<ProtectedRoute roles={["super_admin"]}><Cafes /></ProtectedRoute>} />
              <Route path="/db-browser" element={<ProtectedRoute roles={["super_admin"]}><DbBrowser /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
