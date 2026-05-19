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

  useEffect(() => {
    if (!cafeId) return;
    const since = new Date();
    if (range === "day") since.setHours(0, 0, 0, 0);
    if (range === "week") since.setDate(since.getDate() - 7);
    if (range === "month") since.setMonth(since.getMonth() - 1);
    supabase.from("sessions")
      .select("*, assets(name, category)")
      .eq("cafe_id", cafeId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data || []));
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
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isOverride = r.override_amount != null;
              return (
                <TableRow key={r.id} className={isOverride ? "text-destructive" : ""}>
                  <TableCell>{r.assets?.name || "-"} <span className="text-xs text-muted-foreground">({r.assets?.category})</span></TableCell>
                  <TableCell>{r.customer_name || "Walk-in"}</TableCell>
                  <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{r.ended_at ? new Date(r.ended_at).toLocaleString() : "-"}</TableCell>
                  <TableCell><span className="text-xs uppercase">{r.status}</span>{isOverride && <div className="text-[10px]">Override{r.override_reason ? `: ${r.override_reason}` : ""}</div>}</TableCell>
                  <TableCell className="text-xs uppercase">{r.payment_method || "-"}</TableCell>
                  <TableCell className="text-right font-mono">
                    ₹{Number(r.total_amount || 0).toFixed(2)}
                    {isOverride && (
                      <div className="text-[10px] text-orange-500">(₹{Number(r.override_amount || 0).toFixed(2)})</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No sessions in this range</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
};

export default Sessions;
