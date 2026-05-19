import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

type Product = { id: string; name: string; price: number; stock: number; category: string; stock_threshold: number };
type CartItem = { product: Product; qty: number };

const Counter = () => {
  const { cafeId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "upi" | "split">("cash");
  const [cashAmt, setCashAmt] = useState<number>(0);
  const [upiAmt, setUpiAmt] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const refreshProducts = () => {
    if (!cafeId) return;
    supabase.from("products").select("*").eq("cafe_id", cafeId).gt("stock", 0).order("name").then(({ data }) => setProducts((data || []) as any));
  };
  useEffect(() => { refreshProducts(); }, [cafeId]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.category && s.add(p.category));
    return ["all", ...Array.from(s)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      (activeCategory === "all" || p.category === activeCategory) &&
      (!q || p.name.toLowerCase().includes(q))
    );
  }, [products, search, activeCategory]);

  const add = (p: Product) => {
    setCart((c) => {
      const ex = c.find((i) => i.product.id === p.id);
      if (ex) {
        if (ex.qty + 1 > p.stock) { toast.error(`Only ${p.stock} in stock`); return c; }
        return c.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (p.stock < 1) { toast.error("Out of stock"); return c; }
      return [...c, { product: p, qty: 1 }];
    });
  };
  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      if (qty <= 0) return c.filter((i) => i.product.id !== id);
      return c.map((i) => {
        if (i.product.id !== id) return i;
        if (qty > i.product.stock) { toast.error(`Only ${i.product.stock} in stock`); return i; }
        return { ...i, qty };
      });
    });

  const total = useMemo(() => Math.round(cart.reduce((s, i) => s + i.qty * Number(i.product.price), 0)), [cart]);

  // Keep payment amounts in sync when total or method changes
  useEffect(() => {
    if (payMethod === "cash") { setCashAmt(total); setUpiAmt(0); }
    else if (payMethod === "upi") { setUpiAmt(total); setCashAmt(0); }
    else { setCashAmt(0); setUpiAmt(total); }
  }, [total, payMethod]);

  const checkout = async () => {
    if (!cafeId || cart.length === 0) return;
    let cash = 0, upi = 0;
    if (payMethod === "cash") cash = total;
    else if (payMethod === "upi") upi = total;
    else {
      cash = cashAmt; upi = upiAmt;
      if (Math.abs(cash + upi - total) > 0.01) return toast.error("Cash + UPI must equal total");
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: bill, error } = await supabase.from("bills").insert({
      cafe_id: cafeId, bill_type: "counter", customer_name: customer || null,
      subtotal: total, discount: 0, total,
      created_by: user?.id,
      payment_method: payMethod, cash_amount: cash, upi_amount: upi,
    }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("bill_items").insert(cart.map((i) => ({
      bill_id: bill.id, product_id: i.product.id, product_name: i.product.name,
      qty: i.qty, price: i.product.price,
    })));
    for (const i of cart) {
      await supabase.from("products").update({ stock: Math.max(0, i.product.stock - i.qty) }).eq("id", i.product.id);
    }
    toast.success(`Bill created: ₹${total.toFixed(2)}`);
    setCart([]); setCustomer("");
    setPayMethod("cash");
    refreshProducts();
  };

  return (
    <>
      <PageHeader title="Counter Sale" description="Walk-in billing — no session needed" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-card p-4 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <h3 className="font-semibold">Products</h3>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-7 h-8" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {categories.map((c) => (
                <button key={c} onClick={() => setActiveCategory(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === c
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}>
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          )}
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products found.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {filteredProducts.map((p) => {
                const lowStock = p.stock <= (p.stock_threshold ?? 5);
                return (
                  <button key={p.id} onClick={() => add(p)} className="text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className={`text-xs ${lowStock ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>
                      {lowStock ? `LOW STOCK (${p.stock})` : `Stock: ${p.stock}`}
                    </div>
                    <div className="text-primary font-bold mt-1">₹{Number(p.price).toFixed(2)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="glass-card p-4">
          <h3 className="font-semibold mb-3">Cart</h3>
          <Input placeholder="Customer (optional)" value={customer} onChange={(e) => setCustomer(e.target.value)} className="mb-3" />
          <div className="space-y-2 mb-4 max-h-64 overflow-auto">
            {cart.map((i) => (
              <div key={i.product.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{i.product.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(i.product.id, i.qty - 1)}><Minus className="w-3 h-3" /></Button>
                <span className="w-6 text-center">{i.qty}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(i.product.id, i.qty + 1)}><Plus className="w-3 h-3" /></Button>
                <span className="w-16 text-right">₹{(i.qty * Number(i.product.price)).toFixed(2)}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(i.product.id, 0)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-xs text-muted-foreground">Cart is empty</p>}
          </div>
          <div className="space-y-2 text-sm border-t border-border pt-3">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span><span className="neon-text">₹{total.toFixed(2)}</span>
            </div>
            <div>
              <Label className="text-xs">Payment</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(["cash", "upi", "split"] as const).map((m) => (
                  <Button key={m} type="button" size="sm"
                    variant={payMethod === m ? "default" : "outline"}
                    className={payMethod === m ? "bg-gradient-primary text-primary-foreground" : ""}
                    onClick={() => setPayMethod(m)}>
                    {m.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            {payMethod === "split" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Cash</Label>
                  <Input type="number" step="0.01" min={0} value={cashAmt}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(total, Number(e.target.value) || 0));
                      setCashAmt(v); setUpiAmt(+(total - v).toFixed(2));
                    }} />
                </div>
                <div>
                  <Label className="text-xs">UPI</Label>
                  <Input type="number" step="0.01" min={0} value={upiAmt}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(total, Number(e.target.value) || 0));
                      setUpiAmt(v); setCashAmt(+(total - v).toFixed(2));
                    }} />
                </div>
                <div className="col-span-2 text-[10px] text-muted-foreground">
                  Sum: ₹{(cashAmt + upiAmt).toFixed(2)} / ₹{total.toFixed(2)}
                </div>
              </div>
            )}
          </div>
          <Button onClick={checkout} disabled={cart.length === 0} className="w-full mt-4 bg-gradient-primary text-primary-foreground">Create Bill</Button>
        </Card>
      </div>
    </>
  );
};

export default Counter;
