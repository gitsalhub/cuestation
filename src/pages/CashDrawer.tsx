import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, Clock, Loader2, RefreshCw, Wallet, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

type Withdrawal = {
  id: string;
  cafe_id: string;
  amount: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  creator_name?: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

const formatDateTime = (value: string) => new Date(value).toLocaleString();
const shortId = (value: string) => value.replace(/-/g, "").slice(0, 8).toUpperCase();

// The generated Supabase types may not yet include the new withdrawal table/RPC.
// The database function and RLS policies remain responsible for authorization.
const untypedSupabase = supabase as any;

const CashDrawer = () => {
  const { cafeId, user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [cashReceived, setCashReceived] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const availableCash = useMemo(
    () => Math.max(0, +(cashReceived - totalWithdrawn).toFixed(2)),
    [cashReceived, totalWithdrawn],
  );

  const load = useCallback(async () => {
    if (!cafeId) {
      setWithdrawals([]);
      setCashReceived(0);
      setTotalWithdrawn(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [sessionsRes, advancesRes, billsRes, withdrawalsRes] = await Promise.all([
        supabase.from("sessions").select("cash_amount").eq("cafe_id", cafeId),
        supabase.from("session_advances").select("cash_amount").eq("cafe_id", cafeId),
        supabase.from("bills").select("cash_amount").eq("cafe_id", cafeId),
        untypedSupabase
          .from("cash_drawer_withdrawals")
          .select("id, cafe_id, amount, reason, created_by, created_at")
          .eq("cafe_id", cafeId)
          .order("created_at", { ascending: false }),
      ]);

      if (sessionsRes.error) throw sessionsRes.error;
      if (advancesRes.error) throw advancesRes.error;
      if (billsRes.error) throw billsRes.error;
      if (withdrawalsRes.error) throw withdrawalsRes.error;

      const sessions = (sessionsRes.data || []) as Array<{ cash_amount: number | null }>;
      const advances = (advancesRes.data || []) as Array<{ cash_amount: number | null }>;
      const bills = (billsRes.data || []) as Array<{ cash_amount: number | null }>;
      const withdrawalRows = (withdrawalsRes.data || []) as Withdrawal[];

      // Use the cash portions only; split payments do not count their UPI portion.
      // Session advances are stored separately from end-of-session cash payments.
      const received =
        sessions.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0) +
        advances.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0) +
        bills.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);

      const withdrawn = withdrawalRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      setCashReceived(+received.toFixed(2));
      setTotalWithdrawn(+withdrawn.toFixed(2));

      // Names are shown when the current user's RLS policy permits reading the profile;
      // otherwise use a stable, privacy-preserving ID fallback.
      const creatorIds = Array.from(
        new Set(withdrawalRows.map((row) => row.created_by).filter(Boolean) as string[]),
      );
      let profileNames: Record<string, string> = {};
      if (creatorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", creatorIds);
        profileNames = Object.fromEntries(
          (profiles || []).map((profile: any) => [
            profile.id,
            profile.full_name || profile.email || shortId(profile.id),
          ]),
        );
      }

      setWithdrawals(
        withdrawalRows.map((row) => ({
          ...row,
          amount: Number(row.amount || 0),
          creator_name: row.created_by
            ? profileNames[row.created_by] || (row.created_by === user?.id ? "You" : shortId(row.created_by))
            : "Unknown",
        })),
      );
    } catch (error: any) {
      toast.error(error?.message || "Unable to load cash drawer data.");
    } finally {
      setLoading(false);
    }
  }, [cafeId, user?.id]);

  useEffect(() => {
    void load();
    if (!cafeId) return;

    // Refresh the balance when new cash transactions or withdrawals are recorded.
    const channel = supabase
      .channel(`cash-drawer-${cafeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `cafe_id=eq.${cafeId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "session_advances", filter: `cafe_id=eq.${cafeId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `cafe_id=eq.${cafeId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_drawer_withdrawals", filter: `cafe_id=eq.${cafeId}` }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cafeId, load]);

  const submitWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cafeId) return toast.error("Your account is not linked to a cafe.");

    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return toast.error("Enter a valid withdrawal amount.");
    }
    if (requestedAmount > availableCash + 0.001) {
      return toast.error(`Withdrawal cannot exceed available cash of ${formatMoney(availableCash)}.`);
    }

    setSaving(true);
    try {
      const { data, error } = await untypedSupabase.rpc("withdraw_cash", {
        p_cafe_id: cafeId,
        p_amount: +requestedAmount.toFixed(2),
        p_reason: reason.trim() || null,
      });
      if (error) throw error;

      const newBalance = Number(data?.available_cash);
      toast.success(
        Number.isFinite(newBalance)
          ? `Withdrawal recorded. Remaining cash: ${formatMoney(newBalance)}.`
          : "Withdrawal recorded successfully.",
      );
      setAmount("");
      setReason("");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Withdrawal failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Drawer"
        description="View available business cash, record withdrawals, and review withdrawal history."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        }
      />

      {!cafeId ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Your account is not linked to a cafe.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-card p-5 sm:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">Available cash</div>
                <Wallet className="w-5 h-5 text-success" />
              </div>
              <div className="mt-2 text-3xl font-bold text-success">
                {loading ? "—" : formatMoney(availableCash)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Recorded cash receipts minus withdrawals
              </div>
            </Card>
            <Card className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">Net cash receipts</div>
                <Banknote className="w-5 h-5 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "—" : formatMoney(cashReceived)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Sessions, advances and counter sales
              </div>
            </Card>
            <Card className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">Total withdrawals</div>
                <ArrowDownToLine className="w-5 h-5 text-destructive" />
              </div>
              <div className="mt-2 text-2xl font-bold">
                {loading ? "—" : formatMoney(totalWithdrawn)}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                All recorded withdrawals for this cafe
              </div>
            </Card>
          </div>

          <Card className="glass-card p-5">
            <div className="mb-4">
              <h2 className="font-semibold text-lg">Withdraw cash</h2>
              <p className="text-sm text-muted-foreground">
                Record cash removed from the drawer. The database verifies the available balance before saving.
              </p>
            </div>
            <form onSubmit={submitWithdrawal} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="withdrawal-amount">Amount (₹)</Label>
                <Input
                  id="withdrawal-amount"
                  type="number"
                  min="0.01"
                  max={availableCash}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={saving || loading || availableCash <= 0}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="withdrawal-reason">Reason (optional)</Label>
                <Input
                  id="withdrawal-reason"
                  placeholder="e.g. Owner collected cash"
                  value={reason}
                  maxLength={250}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={saving}
                />
              </div>
              <Button type="submit" disabled={saving || loading || availableCash <= 0}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                {saving ? "Recording…" : "Withdraw cash"}
              </Button>
            </form>
            {availableCash <= 0 && !loading && (
              <p className="mt-3 text-sm text-muted-foreground">
                There is no available cash to withdraw.
              </p>
            )}
          </Card>

          <Card className="glass-card p-0 overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">Withdrawal history</h2>
                <p className="text-sm text-muted-foreground">Every saved withdrawal for this cafe.</p>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {withdrawals.length} record{withdrawals.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date and time</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount withdrawn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="w-4 h-4 inline mr-2 animate-spin" /> Loading withdrawal history…
                      </TableCell>
                    </TableRow>
                  ) : withdrawals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        No withdrawals recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    withdrawals.map((withdrawal) => (
                      <TableRow key={withdrawal.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDateTime(withdrawal.created_at)}
                        </TableCell>
                        <TableCell>{withdrawal.creator_name || (withdrawal.created_by ? shortId(withdrawal.created_by) : "Unknown")}</TableCell>
                        <TableCell className="min-w-40 max-w-sm whitespace-normal break-words">
                          {withdrawal.reason || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-destructive whitespace-nowrap">
                          −{formatMoney(withdrawal.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default CashDrawer;
