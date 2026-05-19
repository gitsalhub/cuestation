import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Expense = { id: string; category: string; amount: number; note: string | null; expense_date: string; created_at: string };

const Expenses = () => {
  const { cafeId } = useAuth();
  const [items, setItems] = useState<Expense[]>([]);
  const [category, setCategory] = useState("general");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    if (!cafeId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("expenses").select("*").eq("cafe_id", cafeId)
      .gte("created_at", today.toISOString()).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, [cafeId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!cafeId || isNaN(num) || num <= 0) return toast.error("Enter a valid amount");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({
      cafe_id: cafeId, category, amount: num, note: note || null, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Expense added");
    setAmount(""); setNote("");
    load();
  };

  const total = items.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <>
      <PageHeader title="Expenses" description="Today's operational expenses" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-card p-5">
          <h3 className="font-semibold mb-3">Add Expense</h3>
          <form onSubmit={add} className="space-y-3">
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. utilities, rent, snacks" />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground">Add</Button>
          </form>
        </Card>

        <Card className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Today's Expenses</h3>
            <div className="text-2xl font-bold neon-text">₹{total.toFixed(2)}</div>
          </div>
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <div className="font-medium capitalize">{i.category}</div>
                  {i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}
                </div>
                <div className="font-mono">₹{Number(i.amount).toFixed(2)}</div>
              </div>
            ))}
            {items.length === 0 && <p className="text-sm text-muted-foreground">No expenses today</p>}
          </div>
        </Card>
      </div>
    </>
  );
};

export default Expenses;
