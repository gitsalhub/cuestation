## Plan: Game Station — UI, logic, and security overhaul

This is a large multi-area request. Below is the proposed implementation, grouped by phase. No code changes happen until you approve.

---

### Phase 1 — Floor Map & session state

1. **Fixed tile size** (`FloorMap.tsx`): Use saved `width`/`height` for ALL states (available/occupied/locked/ending/overtime). Remove any auto-grow. Inner content uses `overflow-hidden` + truncation; long timers/customer names truncate.
2. **Status colors**: available = green (existing), occupied = neon blue glow, last 5 min = orange glow, overtime = red glow. Compute from `planned_minutes` vs elapsed in real time.
3. **Remaining time display**: Bottom-right of tile, small font, when `planned_minutes` is set. Elapsed time stays primary.
4. **Force Reset Session** (admin/super_admin only): NEW button in `Sessions.tsx` (active sessions list) and `Assets.tsx` row action. Confirmation dialog with optional reason textarea. Calls a new `force_reset_session(_session_id, _reason)` SECURITY DEFINER RPC that: ends session, marks asset available, logs to `activity_logs`. Constraint: add partial unique index `(asset_id) WHERE status='active'` to prevent duplicates.
5. **Stale session recovery**: On Floor Map mount, re-fetch active sessions and reconcile with assets. Use single realtime channel per cafe with cleanup in `useEffect` return.

### Phase 2 — End Session dialog & payments

6. **Payment method buttons**: Replace dropdown in end-session dialog (`FloorMap.tsx`) and in `Counter.tsx` with 3 toggle buttons (Cash/UPI/Split). None selected by default. Confirm disabled until selection.
7. **Split auto-calc**: Entering Cash auto-fills UPI = total − cash (and vice versa). Block negatives, block sum > total.
8. **Estimated amount + Advance payment**: When starting session in `FloorMap.tsx` start dialog, show live estimated amount (from `pricing.ts`) + optional advance amount + advance payment method. New table `session_advances` (session_id, amount, method, cash_amount, upi_amount, created_by, created_at). "Add advance" button on running sessions opens popup. End-session totals subtract sum of advances; show Total / Advance Paid / Balance.
9. **Numeric input UX**: Helper component `<NumberInput>` that clears `0` on focus, prevents leading-zero, blocks negatives. Replace in Counter, Session items, Advance, Override, Stock, Split, Quantity.

### Phase 3 — Products / Counter / Stock

10. **Stock thresholds**: Add `stock_threshold` column to `products`. Show "LOW STOCK" (orange) when stock ≤ threshold, "OUT OF STOCK" (red) when 0. Hide out-of-stock products from Counter and Session item picker.
11. **Counter category filter + search**: Pill buttons (All, then distinct `category` values) with active state. Search box for real-time name filter.

### Phase 4 — Offers engine fix

12. **Realtime offer eligibility** (`pricing.ts` + dialogs): Compute eligibility from current session state — `time_based`: total minutes ≥ `min_minutes`; percentage/fixed: gating via `conditions.min_gaming_amount` checked against `game_amount` only (excluding items). Only eligible offers appear in dropdowns. Apply auto when conditions just met (still user-selectable).

### Phase 5 — Analytics, Dashboard, Rates UI

13. **Analytics date selector**: Day / Week / Month / Custom range (date pickers). Default = Day. All cards/charts re-query on change.
14. **Revenue math fixes**: Single source of truth — `bills.total` for revenue; cash/UPI from `bills.cash_amount/upi_amount` (sums must equal total). Gaming = sum of session-linked bills' game portion; Products = counter bills + session item portions. Advances tracked separately, not double-counted. Dashboard "Today's Revenue" reuses same query as Analytics Day view.
15. **Pie chart tooltip**: Custom Recharts tooltip using `bg-popover text-popover-foreground` tokens for readability.
16. **Rates UI redesign** (`Rates.tsx`): Group by player count → collapsible cards → clean slab table per group (time / price / per-player). Maintain existing data shape.

### Phase 6 — Branding & assets

17. **Rename "ArcadeOps" → "Game Station"** everywhere: sidebar, headers, `index.html` `<title>`, auth page, loading screens.
18. **Cafe logo upload**: Add `logo_url` column to `cafes`. Create public `cafe-logos` storage bucket with RLS (super_admin write, public read). Upload UI in `Cafes.tsx` create/edit. Display logo next to cafe name in `AppLayout.tsx` header. Default fallback icon.
19. **Booking time picker icon**: Style `<input type="datetime-local">` with `color-scheme: dark` and white icon via `::-webkit-calendar-picker-indicator { filter: invert(1); }` positioned right.

### Phase 7 — Security hardening

20. **RLS audit migration**: Ensure every table's policies enforce `cafe_id = get_user_cafe(auth.uid())` strictly. Add missing INSERT/UPDATE/DELETE check expressions. Verify realtime publication only exposes cafe-scoped rows (RLS naturally filters). Run linter and resolve every warning. New `session_advances` and `cafe-logos` bucket get full RLS.

### Phase 8 — Super admin account

21. **Create super admin** `salmanmohammedmd@gmail.com` / `Cuestation@123` via SQL migration (using auth admin functions / direct insert into `auth.users` + `user_roles`). Self-service password change: add "Change Password" section in profile menu (`AppLayout.tsx`) using `supabase.auth.updateUser({ password })`.

---

### Out of scope (will not touch)
- Existing AuthContext logic, ProtectedRoute, transfer flow internals, theme switcher, edge functions for impersonation/delete-cafe.

### Migrations summary
- `ALTER TABLE products ADD stock_threshold int DEFAULT 5;`
- `ALTER TABLE cafes ADD logo_url text;`
- `CREATE TABLE session_advances (...);` + RLS
- `CREATE UNIQUE INDEX one_active_session_per_asset ON sessions(asset_id) WHERE status='active';`
- `CREATE FUNCTION force_reset_session(...)` SECURITY DEFINER
- Storage bucket `cafe-logos` + policies
- Tightened RLS where linter flags
- Insert super admin user + role

### Risks
- Adding the unique partial index may fail if duplicate active sessions already exist — migration will first close any duplicates (keep oldest).
- Creating an auth user via SQL requires `auth.users` insert + `crypt()`; if it fails I'll fall back to an edge function.
- Removing leading-zero behavior in many places — will use a shared component to keep diffs small.

Please approve to proceed; if you want to drop or reorder phases, tell me which.