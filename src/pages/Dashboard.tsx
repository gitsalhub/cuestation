import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Timer, DollarSign, Receipt, Activity } from "lucide-react";

const Dashboard = () => {
  const { cafeId, role } = useAuth();
  const [stats, setStats] = useState({ active: 0, revenue: 0, expenses: 0, sessions: 0 });

  useEffect(() => {
    if (!cafeId) return;
    const load = async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const [{ count: active }, { data: bills }, { data: expenses }, { count: sessions }] = await Promise.all([
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).eq("status", "active"),
        supabase.from("bills").select("total").eq("cafe_id", cafeId).gte("created_at", iso),
        supabase.from("expenses").select("amount").eq("cafe_id", cafeId).gte("created_at", iso),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).gte("created_at", iso),
      ]);
      setStats({
        active: active || 0,
        revenue: (bills || []).reduce((s, b) => s + Number(b.total || 0), 0),
        expenses: (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0),
        sessions: sessions || 0,
      });
    };
    load();
    const ch = supabase.channel("dash").on("postgres_changes", { event: "*", schema: "public" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cafeId]);

  const cards = [
    { label: "Active Sessions", value: stats.active, icon: Activity, color: "text-success" },
    { label: "Today's Revenue", value: `₹${stats.revenue.toFixed(0)}`, icon: DollarSign, color: "text-primary" },
    { label: "Today's Expenses", value: `₹${stats.expenses.toFixed(0)}`, icon: Receipt, color: "text-warning" },
    { label: "Sessions Today", value: stats.sessions, icon: Timer, color: "text-accent" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Live overview of your gaming cafe operations${role === "super_admin" ? " (Super Admin)" : ""}`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <div className="text-3xl font-bold">{c.value}</div>
          </Card>
        ))}
      </div>
      {!cafeId && role !== "super_admin" && (
        <Card className="glass-card p-6 mt-6">
          <p className="text-muted-foreground">Your account isn't linked to a cafe yet. Contact your administrator.</p>
        </Card>
      )}
    </>
  );
};

export default Dashboard;
