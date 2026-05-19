import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: callerProfile } = await admin.from("profiles").select("cafe_id").eq("id", userData.user.id).maybeSingle();
    const cafeId = callerProfile?.cafe_id;
    if (!cafeId) return new Response(JSON.stringify({ error: "No cafe" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Verify target staff belongs to caller's cafe and is staff (not admin)
    const { data: target } = await admin.from("profiles").select("cafe_id").eq("id", userId).maybeSingle();
    if (!target || target.cafe_id !== cafeId) return new Response(JSON.stringify({ error: "Not in your cafe" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if (!(targetRoles || []).some((r: any) => r.role === "staff") || (targetRoles || []).some((r: any) => r.role === "admin" || r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Can only delete staff" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
