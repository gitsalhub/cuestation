import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import NumberInput from "@/components/NumberInput";
import { IndianRupee, Wallet } from "lucide-react";
import { toast } from "sonner";

type Shift = {
  id: string;
  opening_cash: number | null;
  opened_at: string;
};

interface CashDrawerContextType {
  /** Called by the logout buttons; shows the closing-cash dialog (if a shift is open) then signs out. */
  requestSignOut: () => void;
}

const CashDrawerContext = createContext<CashDrawerContextType | undefined>(undefined);

export const CashDrawerProvider = ({ children }: { children: ReactNode }) => {
  const { user, role, cafeId, loading, signOut } = useAuth();
  const location = useLocation();

  const applicable = !!user && (role === "admin" || role === "staff") && !!cafeId;

  const [shift, setShift] = useState<Shift | null>(null);
  const [checking, setChecking] = useState(true);

  // Opening dialog form state
  const [openingCash, setOpeningCash] = useState(0);
  const [openingNotes, setOpeningNotes] = useState("");
  const [savingOpen, setSavingOpen] = useState(false);

  // Closing dialog state
  const [closingOpen, setClosingOpen] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState("");
  const [savingClose, setSavingClose] = useState(false);

  const loadShift = useCallback(async () => {
    if (!applicable || !user) {
      setShift(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const { data } = await supabase
      .from("cash_drawer_shifts")
      .select("id, opening_cash, opened_at")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setShift((data as Shift) ?? null);
    setChecking(false);
  }, [applicable, user]);

  useEffect(() => {
    loadShift();
  }, [loadShift]);

  const submitOpening = async () => {
    if (!user || !cafeId) return;
    setSavingOpen(true);
    try {
      let userName = user.email ?? "";
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (profile?.full_name) userName = profile.full_name;

      const { data, error } = await supabase
        .from("cash_drawer_shifts")
        .insert({
          cafe_id: cafeId,
          user_id: user.id,
          user_name: userName,
          user_role: role,
          opening_cash: openingCash,
          opening_notes: openingNotes || null,
          status: "open",
        })
        .select("id, opening_cash, opened_at")
        .single();
      if (error) throw error;
      setShift(data as Shift);
      setOpeningCash(0);
      setOpeningNotes("");
      toast.success("Opening cash recorded");
    } catch (err: any) {
      toast.error(err.message || "Failed to record opening cash");
    } finally {
      setSavingOpen(false);
    }
  };

  const requestSignOut = () => {
    if (applicable && shift) {
      setClosingCash(0);
      setClosingNotes("");
      setClosingOpen(true);
    } else {
      signOut();
    }
  };

  const submitClosing = async () => {
    if (!shift) {
      setClosingOpen(false);
      await signOut();
      return;
    }
    setSavingClose(true);
    try {
      const { error } = await supabase
        .from("cash_drawer_shifts")
        .update({
          closed_at: new Date().toISOString(),
          closing_cash: closingCash,
          closing_notes: closingNotes || null,
          status: "closed",
        })
        .eq("id", shift.id);
      if (error) throw error;
      setShift(null);
      setClosingOpen(false);
      toast.success("Closing cash recorded");
      await signOut();
    } catch (err: any) {
      toast.error(err.message || "Failed to record closing cash");
      setSavingClose(false);
    }
  };

  // Opening gate: block app behind a non-dismissable modal until cash is recorded.
  const needsOpening =
    applicable && !loading && !checking && !shift && location.pathname !== "/auth";

  return (
    <CashDrawerContext.Provider value={{ requestSignOut }}>
      {children}

      <Dialog open={!!needsOpening}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" /> Opening Cash Entry
            </DialogTitle>
            <DialogDescription>
              Enter the physical cash currently in the drawer to start your shift.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="opening-cash">Opening Cash Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <NumberInput
                  id="opening-cash"
                  className="pl-8"
                  value={openingCash}
                  onChange={setOpeningCash}
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enter the amount or confirm ₹0.</p>
            </div>
            <div>
              <Label htmlFor="opening-notes">Notes (optional)</Label>
              <Textarea
                id="opening-notes"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Any notes about the opening drawer..."
              />
            </div>
            <Button
              className="w-full bg-gradient-primary text-primary-foreground"
              disabled={savingOpen}
              onClick={submitOpening}
            >
              {savingOpen ? "Saving..." : "Start Shift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closingOpen} onOpenChange={(o) => { if (!savingClose) setClosingOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" /> Closing Cash Entry
            </DialogTitle>
            <DialogDescription>
              Enter the physical cash in the drawer to end your shift and sign out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="closing-cash">Closing Cash Amount</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <NumberInput
                  id="closing-cash"
                  className="pl-8"
                  value={closingCash}
                  onChange={setClosingCash}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="closing-notes">Notes (optional)</Label>
              <Textarea
                id="closing-notes"
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Any notes about the closing drawer..."
              />
            </div>
            <Button
              className="w-full bg-gradient-primary text-primary-foreground"
              disabled={savingClose}
              onClick={submitClosing}
            >
              {savingClose ? "Saving..." : "End Shift & Sign Out"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CashDrawerContext.Provider>
  );
};

export const useCashDrawer = () => {
  const ctx = useContext(CashDrawerContext);
  if (!ctx) throw new Error("useCashDrawer must be used within CashDrawerProvider");
  return ctx;
};
