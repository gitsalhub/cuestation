import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Sessions = () => {
  const { cafeId } = useAuth();
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [rows, setRows] = useState<any[]>([]);
  const [advMap, setAdvMap] = useState<Record<string, { amount: number; methods: string[] }>>({});

  useEffect(() => {
    if (!cafeId) return;
    const since = new Date();
    if (range === "day") since.setHours(0, 0, 0, 0);
    if (range === "week") since.setDate(since.getDate() - 7);
    if (range === "month") since.setMonth(since.getMonth() - 1);
    (async () => {
      const { data } = await supabase.from("sessions")
        .select("*, assets(name, category)")
        .eq("cafe_id", cafeId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      const sessionRows = data || [];
      setRows(sessionRows);
      const ids = sessionRows.map((r: any) => r.id);
      if (ids.length) {
        const { data: advs } = await supabase.from("session_advances")
          .select("session_id, amount, payment_method").in("session_id", ids);
        const m: Record<string, { amount: number; methods: string[] }> = {};
        (advs || []).forEach((a: any) => {
          if (!m[a.session_id]) m[a.session_id] = { amount: 0, methods: [] };
          m[a.session_id].amount += Number(a.amount || 0);
          if (!m[a.session_id].methods.includes(a.payment_method)) m[a.session_id].methods.push(a.payment_method);
        });
        setAdvMap(m);
      } else setAdvMap({});
    })();
  }, [cafeId, range]);

  return (
    <>
      <PageHeader title="Sessions" description="View and filter session history" />
      <Tabs value={range} onValueChange={(v) => setRange(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Ended</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead className="text-right">Advance</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isOverride = r.override_amount != null;
              const adv = advMap[r.id];
              return (
                <TableRow key={r.id} className={isOverride ? "text-destructive" : ""}>
                  <TableCell>{r.assets?.name || "-"} <span className="text-xs text-muted-foreground">({r.assets?.category})</span></TableCell>
                  <TableCell>{r.customer_name || "Walk-in"}</TableCell>
                  <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{r.ended_at ? new Date(r.ended_at).toLocaleString() : "-"}</TableCell>
                  <TableCell><span className="text-xs uppercase">{r.status}</span>{isOverride && <div className="text-[10px]">Override{r.override_reason ? `: ${r.override_reason}` : ""}</div>}</TableCell>
                  <TableCell className="text-xs uppercase">{r.payment_method || "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {adv ? <>₹{adv.amount.toFixed(2)}<div className="text-[10px] text-muted-foreground uppercase">{adv.methods.join("/")}</div></> : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(() => {
                      const stored = Number(r.total_amount || 0);
                      const advAmt = adv ? adv.amount : 0;
                      const endCash = Number(r.cash_amount || 0) + Number(r.upi_amount || 0);
                      // Heuristic: if total_amount was stored as the end-only amount
                      // (older sessions), add the advance to show full bill.
                      const gross = stored < advAmt + endCash - 0.01 ? +(stored + advAmt).toFixed(2) : stored;
                      return <>₹{gross.toFixed(2)}</>;
                    })()}
                    {adv && (
                      <div className="text-[10px] text-success">incl. ₹{adv.amount.toFixed(2)} advance</div>
                    )}
                    {isOverride && (
                      <div className="text-[10px] text-orange-500">
                        Paid ₹{Number(r.override_amount || 0).toFixed(2)} · Diff ₹{Math.max(0, Number(r.total_amount || 0) - Number(r.override_amount || 0)).toFixed(2)}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No sessions in this range</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
};

export default Sessions;
