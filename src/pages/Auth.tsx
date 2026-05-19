import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { Gamepad2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Min 6 characters").max(72),
  fullName: z.string().trim().max(100).optional(),
  cafeName: z.string().trim().max(100).optional(),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [cafeName, setCafeName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parse = schema.safeParse({ email, password, fullName, cafeName });
    if (!parse.success) return toast.error(parse.error.errors[0].message);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.user) {
          // Create cafe + admin role for new signup
          const { data: cafe, error: cafeErr } = await supabase
            .from("cafes")
            .insert({ name: cafeName || `${fullName || "My"} Cafe`, owner_id: data.user.id })
            .select()
            .single();
          if (cafeErr) throw cafeErr;
          await supabase.from("profiles").update({ cafe_id: cafe.id, full_name: fullName }).eq("id", data.user.id);
          await supabase.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
          toast.success("Account created! Check your email to confirm.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 glass-card">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center animate-pulse-glow">
            <Gamepad2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold neon-text">Game Station</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">{mode === "signin" ? "Sign in" : "Create your cafe"}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Welcome back to your gaming command center" : "Set up your gaming cafe in seconds"}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="cafeName">Cafe name</Label>
                <Input id="cafeName" value={cafeName} onChange={(e) => setCafeName(e.target.value)} required />
              </div>
            </>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 animate-pulse-glow">
            {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-sm text-muted-foreground hover:text-primary mt-4 transition-colors"
        >
          {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
};

export default Auth;
