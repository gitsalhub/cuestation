import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Download } from "lucide-react";

type Range = "day" | "week" | "month" | "custom";

// Helpers
const toYmd = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const startOfWeek = (d: Date) => {
  // Week starts Monday
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return x;
};

const Analytics = () => {
  const { cafeId } = useAuth();
  const [range, setRange] = useState<Range>("day");
  const today = new Date();
  const [dayDate, setDayDate] = useState<string>(toYmd(today));
  const [weekAnchor, setWeekAnchor] = useState<string>(toYmd(today));
  const [monthAnchor, setMonthAnchor] = useState<string>(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [customFrom, setCustomFrom] = useState<string>(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [byDay, setByDay] = useState<any[]>([]);
  const [assetRows, setAssetRows] = useState<any[]>([]);
  const [productRows, setProductRows] = useState<any[]>([]);
  const [totals, setTotals] = useState({ gaming: 0, productSale: 0, total: 0, cash: 0, upi: 0, expenses: 0, overrides: 0, overridesCount: 0, advances: 0, advancesCount: 0 });
  const [expenseCats, setExpenseCats] = useState<any[]>([]);
  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  // Optional Pending Payments metrics (isolated — does not affect revenue totals).
  const [pending, setPending] = useState({ amount: 0, count: 0, collected: 0 });

  useEffect(() => {
    if (!cafeId) return;
    // Compute since / until based on range
    let since = new Date(), until = new Date();
    if (range === "day") {
      since = new Date(dayDate + "T00:00:00");
      until = new Date(dayDate + "T23:59:59");
    } else if (range === "week") {
      since = startOfWeek(new Date(weekAnchor + "T00:00:00"));
      until = new Date(since); until.setDate(until.getDate() + 6); until.setHours(23, 59, 59, 999);
    } else if (range === "month") {
      const [yy, mm] = monthAnchor.split("-").map(Number);
      since = new Date(yy, mm - 1, 1, 0, 0, 0);
      until = new Date(yy, mm, 0, 23, 59, 59);
    } else {
      since = new Date(customFrom + "T00:00:00");
      until = new Date(customTo + "T23:59:59");
    }
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    // Attribute sessions to the day they were CLOSED (ended_at), per business rule.
    // Only completed sessions contribute to revenue.
    const sessQ = supabase.from("sessions").select("id, created_at, game_amount, items_amount, total_amount, cash_amount, upi_amount, payment_method, asset_id, customer_name, started_at, ended_at, override_amount, override_reason, discount_amount, status, started_by, assets(name)").eq("cafe_id", cafeId).eq("status", "completed").gte("ended_at", sinceIso).lte("ended_at", untilIso);
    const billsQ = supabase.from("bills").select("id, created_at, total, subtotal, cash_amount, upi_amount, payment_method, override_amount, discount, created_by").eq("cafe_id", cafeId).gte("created_at", sinceIso).lte("created_at", untilIso);
    const expQ = supabase.from("expenses").select("id, amount, category, note, expense_date").eq("cafe_id", cafeId).gte("expense_date", sinceIso.slice(0, 10)).lte("expense_date", untilIso.slice(0, 10));
    Promise.all([sessQ, billsQ, expQ]).then(async ([s, b, e]) => {
      const sessions = (s.data || []) as any[];
      console.log("SESSIONS", sessions);
      const bills = (b.data || []) as any[];
      const expenses = (e.data || []) as any[];
      // Advances follow their parent session's close date — fetch by session id.
      const sessIdsForAdv = sessions.map((x) => x.id);
      const { data: advData } = sessIdsForAdv.length
        ? await supabase.from("session_advances").select("session_id, amount, payment_method, cash_amount, upi_amount").in("session_id", sessIdsForAdv)
        : { data: [] as any[] };
      const advances = (advData || []) as any[];
      setAllSessions(sessions);

      const billIds = bills.map((x) => x.id);
      const { data: bItems } = billIds.length ? await supabase.from("bill_items").select("bill_id, product_name, qty, price").in("bill_id", billIds) : { data: [] as any[] };
      const sessionIds = sessions.map((x) => x.id).filter(Boolean);
      const { data: sItems } = sessionIds.length ? await supabase.from("session_items").select("session_id, product_name, qty, price").in("session_id", sessionIds) : { data: [] as any[] };

      // Override semantics:
      //   total_amount / total = original gross bill
      //   override_amount (when set) = effective amount actually paid
      //   override "loss" = gross − paid (shown in Overrides card)
      // Revenue, cash/upi, gaming all count the effective paid amount.
      const sessPaid = (x: any) => x.override_amount != null ? Number(x.override_amount) : Number(x.total_amount || 0);
      const billPaid = (x: any) => x.override_amount != null ? Number(x.override_amount) : Number(x.total || 0);
      const sessLoss = (x: any) => x.override_amount != null ? Math.max(0, Number(x.total_amount || 0) - Number(x.override_amount)) : 0;
      const billLoss = (x: any) => x.override_amount != null ? Math.max(0, Number(x.total || 0) - Number(x.override_amount)) : 0;

      // Daily revenue + expense (effective paid)
      const revMap: Record<string, number> = {};
      const expMap: Record<string, number> = {};
      sessions.forEach((x) => { const k = new Date(x.ended_at || x.created_at).toISOString().slice(0, 10); revMap[k] = (revMap[k] || 0) + sessPaid(x); });
      bills.forEach((x) => { const k = new Date(x.created_at).toISOString().slice(0, 10); revMap[k] = (revMap[k] || 0) + billPaid(x); });
      expenses.forEach((x) => { const k = (x.expense_date || "").slice(0, 10); expMap[k] = (expMap[k] || 0) + Number(x.amount || 0); });
      const allDates = Array.from(new Set([...Object.keys(revMap), ...Object.keys(expMap)])).sort();
      setByDay(allDates.map((d) => ({ date: d.slice(5), revenue: revMap[d] || 0, expense: expMap[d] || 0 })));

      // Asset stats — gaming portion. For overridden sessions, attribute the
      // effective paid amount entirely to gaming (per business rule).
      const am: Record<string, { name: string; revenue: number; sessions: number }> = {};
      sessions.forEach((x) => {
        const name = x.assets?.name || "—";
        if (!am[name]) am[name] = { name, revenue: 0, sessions: 0 };
        am[name].revenue += x.override_amount != null ? Number(x.override_amount) : Number(x.game_amount || 0);
        am[name].sessions += 1;
      });
      setAssetRows(Object.values(am).sort((a, b) => b.revenue - a.revenue));

      // Products — exclude items linked to overridden bills/sessions (override absorbs the whole bill)
      const normalBillIds = new Set(bills.filter((x) => x.override_amount == null).map((x) => x.id));
      const normalSessIds = new Set(sessions.filter((x) => x.override_amount == null).map((x) => x.id));
      const pm: Record<string, { name: string; revenue: number; qty: number }> = {};
      ((bItems || []) as any[]).filter((it: any) => normalBillIds.has(it.bill_id)).forEach((it: any) => {
        const name = it.product_name || "—";
        if (!pm[name]) pm[name] = { name, revenue: 0, qty: 0 };
        pm[name].revenue += Number(it.qty) * Number(it.price);
        pm[name].qty += Number(it.qty);
      });
      ((sItems || []) as any[]).filter((it: any) => normalSessIds.has(it.session_id)).forEach((it: any) => {
        const name = it.product_name || "—";
        if (!pm[name]) pm[name] = { name, revenue: 0, qty: 0 };
        pm[name].revenue += Number(it.qty) * Number(it.price);
        pm[name].qty += Number(it.qty);
      });
      setProductRows(Object.values(pm).sort((a, b) => b.revenue - a.revenue));

      // Totals — include overridden bills (paid value)
      // Revenue should represent what was actually collected.
 const advBySession = new Map<string, { cash: number; upi: number; total: number }>();
      for (const a of advances) {
        const cur = advBySession.get(a.session_id) || { cash: 0, upi: 0, total: 0 };
        const amt = Number(a.amount || 0);
        cur.total += amt;
        if (a.payment_method === "cash") cur.cash += amt;
        else if (a.payment_method === "upi") cur.upi += amt;
        else { cur.cash += Number(a.cash_amount || 0); cur.upi += Number(a.upi_amount || 0); }
        advBySession.set(a.session_id, cur);
      }
const gaming = sessions.reduce((s, x) => {
  const paid = x.override_amount != null
    ? Number(x.override_amount)
    : Number(x.game_amount || 0);

  const adv = advBySession.get(x.id);

  // If this session was paid completely by advances,
  // game_amount is still revenue even though cash_amount/upi_amount are zero.
  return s + paid;
}, 0);

const productSale =
  sessions.reduce((s, x) => {
    if (x.override_amount != null) return s;
    return s + Number(x.items_amount || 0);
  }, 0) +
  bills.reduce((s, x) => s + billPaid(x), 0);

const total = gaming + productSale;
console.log("Gaming =", gaming);
console.log("Product =", productSale);
console.log("Total =", total);
      const expensesTotal = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);

      // Cash / UPI = session end collection + advances, capped per session so
      // older rows where cash_amount/upi_amount already include the advance do
      // not count the same advance twice.
     
    let cash = 0;
let upi = 0;

for (const s of sessions) {
    const adv = advBySession.get(s.id) || {
        cash: 0,
        upi: 0,
        total: 0,
    };

    cash += Number(s.cash_amount || 0) + adv.cash;
    upi += Number(s.upi_amount || 0) + adv.upi;
}

cash += bills.reduce((t, x) => t + Number(x.cash_amount || 0), 0);
upi += bills.reduce((t, x) => t + Number(x.upi_amount || 0), 0);

// cash += bills.reduce((t, x) => t + Number(x.cash_amount || 0), 0);
// upi += bills.reduce((t, x) => t + Number(x.upi_amount || 0), 0);
      // for (const r of bills)    { cash += Number(r.cash_amount || 0); upi += Number(r.upi_amount || 0); }
      // Advance collection card: only count advances whose session has ended in range.
      const endedSessIds = new Set(sessions.map((x) => x.id));
      let advancesTotal = 0;
      let advancesCount = 0;
      for (const a of advances) {
        if (!endedSessIds.has(a.session_id)) continue;
        advancesTotal += Number(a.amount || 0);
        advancesCount += 1;
      }

      // Overrides card = total amount given up across overridden rows
      const overrides = sessions.reduce((s, x) => s + sessLoss(x), 0)
                      + bills.reduce((s, x) => s + billLoss(x), 0);
      const overridesCount = sessions.filter((x) => x.override_amount != null).length
                           + bills.filter((x) => x.override_amount != null).length;

      const ec: Record<string, number> = {};
      expenses.forEach((x) => { ec[x.category || "general"] = (ec[x.category || "general"] || 0) + Number(x.amount || 0); });
      setExpenseCats(Object.entries(ec).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount));
      setExpenseList([...expenses].sort((a, b) => (b.expense_date || "").localeCompare(a.expense_date || "")));
      console.table(
  sessions.map((s) => ({
    id: s.id,
    customer: s.customer_name,
    game: s.game_amount,
    items: s.items_amount,
    total: s.total_amount,
    override: s.override_amount,
    cash: s.cash_amount,
    upi: s.upi_amount,
    payment: s.payment_method,
    collected:
      Number(s.cash_amount || 0) +
      Number(s.upi_amount || 0),
    difference:
      Number(s.game_amount || 0) +
      Number(s.items_amount || 0) -
      (
        Number(s.cash_amount || 0) +
        Number(s.upi_amount || 0)
      ),
  }))
);
console.log("Gaming", gaming);
console.log("Cash", cash);
console.log("UPI", upi);
console.log("Revenue", total);
console.log("Collected", cash + upi);
console.log("Difference", total - (cash + upi));
      setTotals({ gaming, productSale, total, cash, upi, expenses: expensesTotal, overrides, overridesCount, advances: advancesTotal, advancesCount });

      // Staff aggregation (use non-overridden only for revenue; overrides tracked separately)
      const userIds = Array.from(new Set([
        ...sessions.map((x: any) => x.started_by).filter(Boolean),
        ...bills.map((x: any) => x.created_by).filter(Boolean),
      ]));
      let nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
        (profs || []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || "Unknown"; });
      }
      const sm: Record<string, any> = {};
      const ensure = (uid: string) => {
        if (!sm[uid]) sm[uid] = { id: uid, name: nameMap[uid] || "Unknown", revenue: 0, sessions: 0, bills: 0, override: 0, discount: 0, cash: 0, upi: 0 };
        return sm[uid];
      };
      // Staff: revenue counts the effective paid amount (includes overridden),
      // and the "Override" column shows the loss (gross − paid).
      sessions.forEach((x: any) => {
        if (!x.started_by) return;
        const r = ensure(x.started_by);
        r.sessions += 1;
        const paid = sessPaid(x);
        r.revenue += paid;
        r.override += sessLoss(x);
       const adv = advBySession.get(x.id);

r.cash += Number(x.cash_amount || 0) + Number(adv?.cash || 0);
r.upi  += Number(x.upi_amount || 0) + Number(adv?.upi || 0);
        r.discount += Number(x.discount_amount || 0);
      });
      bills.forEach((x: any) => {
        if (!x.created_by) return;
        const r = ensure(x.created_by);
        r.bills += 1;
        const paid = billPaid(x);
        r.revenue += paid;
        r.override += billLoss(x);
        r.cash += Number(x.cash_amount || 0);
        r.upi += Number(x.upi_amount || 0);
        r.discount += Number(x.discount || 0);
      });
      setStaffRows(Object.values(sm).sort((a: any, b: any) => b.revenue - a.revenue));
    });
  }, [cafeId, range, dayDate, weekAnchor, monthAnchor, customFrom, customTo]);

  // Pending Payments metrics — kept separate so existing revenue logic is unchanged.
  useEffect(() => {
    if (!cafeId) return;
    let since = new Date(), until = new Date();
    if (range === "day") { since = new Date(dayDate + "T00:00:00"); until = new Date(dayDate + "T23:59:59"); }
    else if (range === "week") { since = startOfWeek(new Date(weekAnchor + "T00:00:00")); until = new Date(since); until.setDate(until.getDate() + 6); until.setHours(23, 59, 59, 999); }
    else if (range === "month") { const [yy, mm] = monthAnchor.split("-").map(Number); since = new Date(yy, mm - 1, 1, 0, 0, 0); until = new Date(yy, mm, 0, 23, 59, 59); }
    else { since = new Date(customFrom + "T00:00:00"); until = new Date(customTo + "T23:59:59"); }
    (async () => {
      const [pendQ, collQ] = await Promise.all([
        supabase.from("sessions").select("id, total_amount, override_amount").eq("cafe_id", cafeId).eq("status", "pending_payment"),
        supabase.from("sessions").select("cash_amount, upi_amount").eq("cafe_id", cafeId).not("payment_collected_at", "is", null).gte("payment_collected_at", since.toISOString()).lte("payment_collected_at", until.toISOString()),
      ]);
      const pend = (pendQ.data || []) as any[];
      let amount = 0;
      if (pend.length) {
        const ids = pend.map((p) => p.id);
        const { data: advs } = await supabase.from("session_advances").select("session_id, amount").in("session_id", ids);
        const am: Record<string, number> = {};
        (advs || []).forEach((a: any) => { am[a.session_id] = (am[a.session_id] || 0) + Number(a.amount || 0); });
        amount = pend.reduce((s, p) => {
          const base = p.override_amount != null ? Number(p.override_amount) : Number(p.total_amount || 0);
          return s + Math.max(0, base - (am[p.id] || 0));
        }, 0);
      }
      const collected = (collQ.data || []).reduce((s: number, r: any) => s + Number(r.cash_amount || 0) + Number(r.upi_amount || 0), 0);
      setPending({ amount, count: pend.length, collected });
    })();
  }, [cafeId, range, dayDate, weekAnchor, monthAnchor, customFrom, customTo]);

  const netProfit = totals.total - totals.expenses;

  const downloadCsv = () => {
    const headers = ["Date", "Asset", "Customer", "Started", "Ended", "Status", "Game", "Items", "Total", "Override", "Reason", "Cash", "UPI", "Method"];
    const rows = allSessions.map((s) => [
      new Date(s.created_at).toLocaleString(), s.assets?.name || "", s.customer_name || "",
      s.started_at ? new Date(s.started_at).toLocaleString() : "",
      s.ended_at ? new Date(s.ended_at).toLocaleString() : "", s.status,
      s.game_amount || 0, s.items_amount || 0, s.total_amount || 0,
      s.override_amount ?? "", s.override_reason ?? "",
      s.cash_amount || 0, s.upi_amount || 0, s.payment_method || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sessions-${range}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const payPie = [
    { name: "Cash", value: totals.cash },
    { name: "UPI", value: totals.upi },
  ].filter((x) => x.value > 0);

  // Range label
  const rangeLabel = (() => {
    if (range === "day") return new Date(dayDate + "T00:00:00").toLocaleDateString();
    if (range === "week") {
      const start = startOfWeek(new Date(weekAnchor + "T00:00:00"));
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    if (range === "month") {
      const [yy, mm] = monthAnchor.split("-").map(Number);
      return new Date(yy, mm - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
    }
    return `${customFrom} → ${customTo}`;
  })();

  return (
    <>
      <PageHeader title="Analytics" description="Performance overview"
        actions={<Button variant="outline" onClick={downloadCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>
        </Tabs>
        {range === "day" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Date</span>
            <input type="date" value={dayDate} max={toYmd(new Date())} onChange={(e) => setDayDate(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1" />
          </div>
        )}
        {range === "week" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Week of</span>
            <input type="date" value={weekAnchor} max={toYmd(new Date())} onChange={(e) => setWeekAnchor(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1" />
          </div>
        )}
        {range === "month" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Month</span>
            <input type="month" value={monthAnchor} max={`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`} onChange={(e) => setMonthAnchor(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1" />
          </div>
        )}
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1" />
            <span className="text-muted-foreground">To</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1" />
          </div>
        )}
        <div className="text-xs text-muted-foreground ml-auto">{rangeLabel}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Total revenue</div><div className="text-2xl font-bold neon-text">₹{totals.total.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">Gaming + Product</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Gaming revenue</div><div className="text-2xl font-bold">₹{totals.gaming.toFixed(2)}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Product sales</div><div className="text-2xl font-bold">₹{totals.productSale.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">In-session + counter</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Net profit</div><div className={`text-2xl font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>₹{netProfit.toFixed(2)}</div></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Cash</div><div className="text-xl font-bold text-success">₹{totals.cash.toFixed(2)}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">UPI</div><div className="text-xl font-bold">₹{totals.upi.toFixed(2)}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Overrides</div><div className="text-xl font-bold text-orange-500">₹{totals.overrides.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">{totals.overridesCount} record(s) — discount given via override</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Advance collection</div><div className="text-xl font-bold text-accent">₹{totals.advances.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">{totals.advancesCount} advance(s) — included in cash/UPI</div></Card>
        <Card
          className="glass-card p-4 cursor-pointer transition-shadow hover:shadow-lg hover:ring-1 hover:ring-destructive/40"
          onClick={() => setExpensesOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setExpensesOpen(true); } }}
        >
          <div className="text-xs text-muted-foreground">Expenses</div>
          <div className="text-xl font-bold text-destructive">₹{totals.expenses.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground">Click to view details</div>
        </Card>
      </div>

      <Dialog open={expensesOpen} onOpenChange={setExpensesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Expense details</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{expenseList.length} entr{expenseList.length === 1 ? "y" : "ies"} · {rangeLabel}</span>
            <span className="font-bold text-destructive">₹{totals.expenses.toFixed(2)}</span>
          </div>
          {expenseList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No expenses recorded in this period.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto divide-y divide-border">
              {expenseList.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{e.category || "general"}</div>
                    {e.note && <div className="text-xs text-muted-foreground break-words">{e.note}</div>}
                    <div className="text-[10px] text-muted-foreground">{e.expense_date}</div>
                  </div>
                  <div className="font-mono text-destructive whitespace-nowrap">₹{Number(e.amount).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Total pending</div><div className="text-xl font-bold text-orange-500">₹{pending.amount.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">Not counted in revenue until collected</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Pending sessions</div><div className="text-xl font-bold">{pending.count}</div></Card>
        <Card className="glass-card p-4"><div className="text-xs text-muted-foreground">Collected pending payments</div><div className="text-xl font-bold text-success">₹{pending.collected.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">Collected in this period</div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="glass-card p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Revenue vs Expenses</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={byDay}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 8, boxShadow: "0 0 16px hsl(var(--primary) / 0.25)" }}
                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(v: any) => `₹${Number(v).toFixed(2)}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" name="Expense" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Cash vs UPI</h3>
          {payPie.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={payPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name}: ₹${e.value.toFixed(0)}`}>
                  <Cell fill="hsl(var(--success))" />
                  <Cell fill="hsl(var(--primary))" />
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 8, boxShadow: "0 0 16px hsl(var(--primary) / 0.25)" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: any) => `₹${Number(v).toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Assets — top to least</h3>
          {assetRows.length === 0 ? <p className="text-sm text-muted-foreground">No session data yet.</p> : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={assetRows}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent) / 0.1)" }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--accent) / 0.4)", borderRadius: 8, boxShadow: "0 0 16px hsl(var(--accent) / 0.25)" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: any) => `₹${Number(v).toFixed(2)}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 divide-y divide-border">
                {assetRows.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2"><span className="text-muted-foreground w-5">#{i + 1}</span>{r.name}</span>
                    <span className="text-muted-foreground text-xs">{r.sessions} sessions</span>
                    <span className="font-mono">₹{r.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Products — top to least</h3>
          {productRows.length === 0 ? <p className="text-sm text-muted-foreground">No products sold yet.</p> : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={productRows}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.1)" }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--primary) / 0.4)", borderRadius: 8, boxShadow: "0 0 16px hsl(var(--primary) / 0.25)" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: any) => `₹${Number(v).toFixed(2)}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 divide-y divide-border">
                {productRows.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2"><span className="text-muted-foreground w-5">#{i + 1}</span>{r.name}</span>
                    <span className="text-muted-foreground text-xs">{r.qty} sold</span>
                    <span className="font-mono">₹{r.revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Expenses breakdown</h3>
          {expenseCats.length === 0 ? <p className="text-sm text-muted-foreground">No expenses recorded.</p> : (
            <div className="divide-y divide-border">
              {expenseCats.map((e) => (
                <div key={e.category} className="flex justify-between py-2 text-sm">
                  <span className="capitalize">{e.category}</span>
                  <span className="font-mono text-destructive">₹{e.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-4">Staff revenue — top to least</h3>
          {staffRows.length === 0 ? <p className="text-sm text-muted-foreground">No staff activity in this range.</p> : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs uppercase text-muted-foreground border-b border-border">
                  <th className="text-left p-2">#</th><th className="text-left p-2">Staff</th>
                  <th className="text-right p-2">Sessions</th><th className="text-right p-2">Bills</th>
                  <th className="text-right p-2">Cash</th><th className="text-right p-2">UPI</th>
                  <th className="text-right p-2">Override</th><th className="text-right p-2">Discount</th>
                  <th className="text-right p-2">Revenue</th>
                </tr></thead>
                <tbody>
                  {staffRows.map((r: any, i: number) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="p-2 text-muted-foreground">#{i + 1}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right">{r.sessions}</td>
                      <td className="p-2 text-right">{r.bills}</td>
                      <td className="p-2 text-right font-mono">₹{r.cash.toFixed(0)}</td>
                      <td className="p-2 text-right font-mono">₹{r.upi.toFixed(0)}</td>
                      <td className="p-2 text-right font-mono text-orange-500">₹{r.override.toFixed(0)}</td>
                      <td className="p-2 text-right font-mono text-success">₹{r.discount.toFixed(0)}</td>
                      <td className="p-2 text-right font-mono font-bold">₹{r.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

export default Analytics;
