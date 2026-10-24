import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Info, Pencil } from "lucide-react";
import { toast } from "sonner";
import SessionInfoDialog from "@/components/SessionInfoDialog";

type PaymentMode = "cash" | "upi" | "split";

const Sessions = () => {
  const { cafeId } = useAuth();
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [rows, setRows] = useState<any[]>([]);
  const [advMap, setAdvMap] = useState<
    Record<string, { amount: number; methods: string[] }>
  >({});
  const [infoSessionId, setInfoSessionId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Payment mode editor state. Only the final session payment is edited;
  // advance payments and all other session data remain unchanged.
  const [editingPaymentSession, setEditingPaymentSession] =
    useState<any | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [editCashAmount, setEditCashAmount] = useState(0);
  const [editUpiAmount, setEditUpiAmount] = useState(0);
  const [savingPayment, setSavingPayment] = useState(false);

  const load = async () => {
    if (!cafeId) return;

    const since = new Date();
    if (range === "day") since.setHours(0, 0, 0, 0);
    if (range === "week") since.setDate(since.getDate() - 7);
    if (range === "month") since.setMonth(since.getMonth() - 1);

    const { data, error } = await supabase
      .from("sessions")
      .select("*, assets(name, category)")
      .eq("cafe_id", cafeId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`Failed to load sessions: ${error.message}`);
      return;
    }

    const sessionRows = data || [];
    setRows(sessionRows);

    const ids = sessionRows.map((r: any) => r.id);
    if (ids.length) {
      const { data: advs, error: advancesError } = await supabase
        .from("session_advances")
        .select("session_id, amount, payment_method")
        .in("session_id", ids);

      if (advancesError) {
        toast.error(`Failed to load advances: ${advancesError.message}`);
        setAdvMap({});
        return;
      }

      const m: Record<string, { amount: number; methods: string[] }> = {};
      (advs || []).forEach((a: any) => {
        if (!m[a.session_id]) m[a.session_id] = { amount: 0, methods: [] };
        m[a.session_id].amount += Number(a.amount || 0);
        if (!m[a.session_id].methods.includes(a.payment_method)) {
          m[a.session_id].methods.push(a.payment_method);
        }
      });
      setAdvMap(m);
    } else {
      setAdvMap({});
    }
  };

  useEffect(() => {
    void load();
    // load() depends on cafeId and range, so these are the intended triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId, range]);

  const openPaymentEditor = (session: any) => {
    if (session.status !== "completed") {
      toast.error("Only completed sessions can have their payment mode corrected.");
      return;
    }

    const cash = Number(session.cash_amount || 0);
    const upi = Number(session.upi_amount || 0);
    const total = +(cash + upi).toFixed(2);

    if (total <= 0) {
      toast.error("No final payment is recorded for this session.");
      return;
    }

    setEditingPaymentSession(session);
    setEditCashAmount(cash);
    setEditUpiAmount(upi);
    setPaymentMode(cash > 0 && upi > 0 ? "split" : upi > 0 ? "upi" : "cash");
  };

  const savePaymentMode = async () => {
    if (!editingPaymentSession || !cafeId || savingPayment) return;

    const total = +(
      Number(editingPaymentSession.cash_amount || 0) +
      Number(editingPaymentSession.upi_amount || 0)
    ).toFixed(2);

    let cash = 0;
    let upi = 0;

    if (paymentMode === "cash") {
      cash = total;
    } else if (paymentMode === "upi") {
      upi = total;
    } else {
      cash = +Number(editCashAmount).toFixed(2);
      upi = +Number(editUpiAmount).toFixed(2);

      if (cash < 0 || upi < 0 || Math.abs(cash + upi - total) > 0.01) {
        toast.error("Cash + UPI must equal the original payment.");
        return;
      }
    }

    setSavingPayment(true);
    try {
      const { data: updated, error } = await supabase
        .from("sessions")
        .update({
          payment_method: paymentMode,
          cash_amount: cash,
          upi_amount: upi,
        })
        .eq("id", editingPaymentSession.id)
        .eq("cafe_id", cafeId)
        .eq("status", "completed")
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        throw new Error(
          "The session was not updated. Check your permissions and confirm that the session is still completed."
        );
      }

      // Update the displayed row without changing any other session fields.
      setRows((current) =>
        current.map((session) =>
          session.id === editingPaymentSession.id
            ? {
                ...session,
                payment_method: paymentMode,
                cash_amount: cash,
                upi_amount: upi,
              }
            : session
        )
      );

      toast.success("Payment mode updated successfully.");
      setEditingPaymentSession(null);
      // Refresh the table's data from the database after the edit.
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payment mode.");
    } finally {
      setSavingPayment(false);
    }
  };

  const editTotal = editingPaymentSession
    ? +(
        Number(editingPaymentSession.cash_amount || 0) +
        Number(editingPaymentSession.upi_amount || 0)
      ).toFixed(2)
    : 0;

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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isOverride = r.override_amount != null;
              const adv = advMap[r.id];

              return (
                <TableRow key={r.id} className={isOverride ? "text-destructive" : ""}>
                  <TableCell>
                    {r.assets?.name || "-"}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({r.assets?.category})
                    </span>
                  </TableCell>
                  <TableCell>{r.customer_name || "Walk-in"}</TableCell>
                  <TableCell className="text-xs">
                    {new Date(r.started_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.ended_at ? new Date(r.ended_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs uppercase">{r.status}</span>
                    {isOverride && (
                      <div className="text-[10px]">
                        Override{r.override_reason ? `: ${r.override_reason}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs uppercase">
                    {r.payment_method || "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {adv ? (
                      <>
                        ₹{adv.amount.toFixed(2)}
                        <div className="text-[10px] text-muted-foreground uppercase">
                          {adv.methods.join("/")}
                        </div>
                      </>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(() => {
                      const stored = Number(r.total_amount || 0);
                      const advAmt = adv ? adv.amount : 0;
                      const endCash =
                        Number(r.cash_amount || 0) + Number(r.upi_amount || 0);
                      // Older sessions may have stored only the end-payment amount.
                      const gross =
                        stored < advAmt + endCash - 0.01
                          ? +(stored + advAmt).toFixed(2)
                          : stored;
                      return <>₹{gross.toFixed(2)}</>;
                    })()}
                    {adv && (
                      <div className="text-[10px] text-success">
                        incl. ₹{adv.amount.toFixed(2)} advance
                      </div>
                    )}
                    {isOverride && (
                      <div className="text-[10px] text-orange-500">
                        Paid ₹{Number(r.override_amount || 0).toFixed(2)} · Diff ₹
                        {Math.max(
                          0,
                          Number(r.total_amount || 0) - Number(r.override_amount || 0)
                        ).toFixed(2)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === "completed" &&
                        Number(r.cash_amount || 0) + Number(r.upi_amount || 0) > 0 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Edit payment mode"
                            aria-label="Edit payment mode"
                            onClick={() => openPaymentEditor(r)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Session information"
                        aria-label="Session information"
                        onClick={() => {
                          setInfoSessionId(r.id);
                          setInfoOpen(true);
                        }}
                      >
                        <Info className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No sessions in this range
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <SessionInfoDialog
        sessionId={infoSessionId}
        open={infoOpen}
        onOpenChange={(o) => {
          setInfoOpen(o);
          if (!o) setInfoSessionId(null);
        }}
      />

      <Dialog
        open={!!editingPaymentSession}
        onOpenChange={(open) => {
          if (!open && !savingPayment) setEditingPaymentSession(null);
        }}
      >
        <DialogContent className="glass-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit payment mode</DialogTitle>
            <DialogDescription>
              Correct how the final session payment was received. The original amount and
              all other session details will remain unchanged.
            </DialogDescription>
          </DialogHeader>

          {editingPaymentSession && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="text-sm text-muted-foreground">Original final payment</div>
                <div className="text-2xl font-bold">₹{editTotal.toFixed(2)}</div>
              </div>

              <div className="space-y-2">
                <Label>Correct payment mode</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "upi", "split"] as const).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      variant={paymentMode === mode ? "default" : "outline"}
                      onClick={() => setPaymentMode(mode)}
                    >
                      {mode === "upi" ? "UPI" : mode === "cash" ? "Cash" : "Split"}
                    </Button>
                  ))}
                </div>
              </div>

              {paymentMode === "split" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit-session-cash">Cash amount</Label>
                    <Input
                      id="edit-session-cash"
                      type="number"
                      min={0}
                      max={editTotal}
                      step="0.01"
                      value={editCashAmount}
                      onChange={(e) => {
                        const value = Math.max(
                          0,
                          Math.min(editTotal, Number(e.target.value) || 0)
                        );
                        const cash = +value.toFixed(2);
                        setEditCashAmount(cash);
                        setEditUpiAmount(+(editTotal - cash).toFixed(2));
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-session-upi">UPI amount</Label>
                    <Input
                      id="edit-session-upi"
                      type="number"
                      min={0}
                      max={editTotal}
                      step="0.01"
                      value={editUpiAmount}
                      onChange={(e) => {
                        const value = Math.max(
                          0,
                          Math.min(editTotal, Number(e.target.value) || 0)
                        );
                        const upi = +value.toFixed(2);
                        setEditUpiAmount(upi);
                        setEditCashAmount(+(editTotal - upi).toFixed(2));
                      }}
                    />
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    Cash + UPI: ₹{(editCashAmount + editUpiAmount).toFixed(2)} / ₹
                    {editTotal.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingPayment}
              onClick={() => setEditingPaymentSession(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={savingPayment} onClick={savePaymentMode}>
              {savingPayment ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sessions;
