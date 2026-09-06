import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Timer, DollarSign, Receipt, Activity, Banknote, Smartphone } from "lucide-react";

const Dashboard = () => {
  const { cafeId, role } = useAuth();
  const [stats, setStats] = useState({ active: 0, revenue: 0, expenses: 0, sessions: 0, cash: 0, upi: 0 });
  const [subscription, setSubscription] = useState<{
    expires: string | null;
    type: "trial" | "paid";
  } | null>(null);

  useEffect(() => {
    if (!cafeId) return;
    
    const load = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const sIso = start.toISOString();
      const eIso = end.toISOString();

      const ymd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

      const [
        { count: active },
        sessRes,
        billsRes,
        expRes,
        { count: sessions },
        advRes,
        cafeRes,
      ] = await Promise.all([
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).eq("status", "active"),
        supabase.from("sessions").select("id, game_amount, items_amount, total_amount, override_amount, cash_amount, upi_amount, payment_method").eq("cafe_id", cafeId).eq("status", "completed").gte("ended_at", sIso).lte("ended_at", eIso),
        supabase.from("bills").select("total,override_amount,cash_amount,upi_amount").eq("cafe_id", cafeId).gte("created_at", sIso).lte("created_at", eIso),
        supabase.from("expenses").select("amount").eq("cafe_id", cafeId).eq("expense_date", ymd),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("cafe_id", cafeId).eq("status", "completed").gte("ended_at", sIso).lte("ended_at", eIso),
        supabase.from("session_advances").select("session_id,amount,cash_amount,upi_amount").eq("cafe_id", cafeId).gte("created_at", sIso).lte("created_at", eIso),
        supabase.from("cafes").select("subscription_expires_at,created_at").eq("id", cafeId).single(),
      ]);

      const sessions_ = (sessRes.data ?? []) as any[];
      const bills = (billsRes.data ?? []) as any[];
      const expenses = (expRes.data ?? []) as any[];
      const advances = (advRes.data ?? []) as any[];

      if (cafeRes.data) {
        const expStr = cafeRes.data.subscription_expires_at;
        let type: "trial" | "paid" = "paid";
        
        if (expStr) {
            // Check time signature using raw string to prevent timezone offset bugs
            type = String(expStr).includes("23:59") ? "trial" : "paid";
        }

        setSubscription({
          expires: expStr,
          type: type
        });
      }

      const advMap = new Map();
      advances.forEach((a: any) => {
        const cur = advMap.get(a.session_id) || { cash: 0, upi: 0, total: 0 };
        cur.cash += Number(a.cash_amount || 0);
        cur.upi += Number(a.upi_amount || 0);
        cur.total += Number(a.amount || 0);
        advMap.set(a.session_id, cur);
      });

      let gaming = 0;
      sessions_.forEach((s: any) => {
        gaming += s.override_amount != null ? Number(s.override_amount) : Number(s.game_amount || 0);
      });

      let cash = 0;
      let upi = 0;
      for (const s of sessions_) {
        const adv = advMap.get(s.id) || { cash: 0, upi: 0 };
        cash += Number(s.cash_amount || 0) + Number(adv.cash || 0);
        upi += Number(s.upi_amount || 0) + Number(adv.upi || 0);
      }

      const productSales = sessions_.reduce((t, x) => t + Number(x.items_amount || 0), 0) + bills.reduce((t, x) => t + Number(x.total || 0), 0);
      cash += bills.reduce((t, x) => t + Number(x.cash_amount || 0), 0);
      upi += bills.reduce((t, x) => t + Number(x.upi_amount || 0), 0);

      setStats({
        active: active || 0,
        revenue: gaming + productSales,
        expenses: expenses.reduce((t, e) => t + Number(e.amount || 0), 0),
        sessions: sessions || 0,
        cash,
        upi
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

  const daysRemaining = subscription?.expires
    ? Math.ceil((new Date(subscription.expires).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Live overview of your gaming cafe operations${
          role === "super_admin" ? " (Super Admin)" : ""
        }`}
      />

      {role !== "super_admin" && subscription && subscription.type === "paid" && (
        <Card className="glass-card p-5 mb-5">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h3 className="font-semibold text-lg">
                💳 Paid Subscription
              </h3>
              {subscription.expires ? (
                  <>
                    <p className="text-muted-foreground">
                        {daysRemaining! >= 0
                        ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
                        : `Expired ${Math.abs(daysRemaining!)} day${Math.abs(daysRemaining!) === 1 ? "" : "s"} ago`}
                    </p>
                    <p className="text-sm mt-1">
                        Expires on {new Date(subscription.expires).toLocaleDateString()}
                    </p>
                  </>
              ) : (
                  <p className="text-muted-foreground">Lifetime Access</p>
              )}
            </div>

            <div>
              {!subscription.expires ? (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-500/20 text-green-400">
                    Active
                  </span>
              ) : (
                  <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      daysRemaining! < 0
                          ? "bg-red-500/20 text-red-400"
                          : daysRemaining! <= 7
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-green-500/20 text-green-400"
                      }`}
                  >
                      {daysRemaining! < 0 ? "Expired" : daysRemaining! <= 7 ? "Expiring Soon" : "Active"}
                  </span>
              )}
            </div>
          </div>
        </Card>
      )}

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
          <p className="text-muted-foreground">
            Your account isn't linked to a cafe yet. Contact your administrator.
          </p>
        </Card>
      )}
    </>
  );
};

export default Dashboard;