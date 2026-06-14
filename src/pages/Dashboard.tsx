import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Timer, DollarSign, Receipt, Activity } from "lucide-react";

const Dashboard = () => {
  const { cafeId, role } = useAuth();
  const [stats, setStats] = useState({ active: 0, revenue: 0, expenses: 0, sessions: 0, cash: 0, upi: 0 });

  useEffect(() => {
    if (!cafeId) return;
    const load = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const sIso = start.toISOString(); const eIso = end.toISOString();
      const ymd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const [{ count: active }, sessRes, billsRes, expRes, { count: sessions }] = await Promise.all([
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).eq("status", "active"),
        supabase.from("sessions").select("game_amount, items_amount, total_amount, override_amount, cash_amount, upi_amount").eq("cafe_id", cafeId).eq("status", "completed").gte("ended_at", sIso).lte("ended_at", eIso),
        supabase.from("bills").select("total, override_amount, cash_amount, upi_amount").eq("cafe_id", cafeId).gte("created_at", sIso).lte("created_at", eIso),
        supabase.from("expenses").select("amount").eq("cafe_id", cafeId).eq("expense_date", ymd),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).eq("status", "completed").gte("ended_at", sIso).lte("ended_at", eIso),
      ]);
      const sessions_ = (sessRes.data || []) as any[];
      const bills = (billsRes.data || []) as any[];
      const expenses = (expRes.data || []) as any[];
      const gaming = sessions_.reduce((s, x) => s + (x.override_amount != null ? Number(x.override_amount) : Number(x.game_amount || 0)), 0);
      const productSale = sessions_.reduce((s, x) => s + (x.override_amount != null ? 0 : Number(x.items_amount || 0)), 0)
        + bills.reduce((s, x) => s + (x.override_amount != null ? Number(x.override_amount) : Number(x.total || 0)), 0);
      const cash = sessions_.reduce((s, x) => s + Number(x.cash_amount || 0), 0)
        + bills.reduce((s, x) => s + Number(x.cash_amount || 0), 0);
      const upi = sessions_.reduce((s, x) => s + Number(x.upi_amount || 0), 0)
        + bills.reduce((s, x) => s + Number(x.upi_amount || 0), 0);
      setStats({
        active: active || 0,
        revenue: gaming + productSale,
        expenses: expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
        sessions: sessions || 0,
        cash,
        upi,
      });
    };
    load();
    const ch = supabase.channel("dash").on("postgres_changes", { event: "*", schema: "public" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cafeId]);

  const cards = [
    { label: "Active Sessions", value: stats.active, icon: Activity, color: "text-success", detail: null as ReactNode },
    {
      label: "Today's Revenue",
      value: `₹${stats.revenue.toFixed(0)}`,
      icon: DollarSign,
      color: "text-primary",
      detail: (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-success"><Banknote className="w-3.5 h-3.5" />Cash ₹{stats.cash.toFixed(0)}</span>
          <span className="flex items-center gap-1 text-primary"><Smartphone className="w-3.5 h-3.5" />UPI ₹{stats.upi.toFixed(0)}</span>
        </div>
      ),
    },
    { label: "Today's Expenses", value: `₹${stats.expenses.toFixed(0)}`, icon: Receipt, color: "text-warning", detail: null as ReactNode },
    { label: "Sessions Today", value: stats.sessions, icon: Timer, color: "text-accent", detail: null as ReactNode },
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
            {c.detail}
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
