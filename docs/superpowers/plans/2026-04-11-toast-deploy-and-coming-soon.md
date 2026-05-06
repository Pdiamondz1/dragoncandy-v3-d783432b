# Toast Deploy + Coming Soon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy 6 Toast edge functions to Supabase, add env-var guards so they fail gracefully without credentials, and update the frontend to show "coming soon" instead of a cryptic error.

**Architecture:** Edge functions get a guard that checks for Toast-specific env vars and returns `{ error: "toast_not_configured" }` with 503 if missing. The frontend detects this error code and swaps the connect UI for a "coming soon" banner. No database changes needed.

**Tech Stack:** Supabase Edge Functions (Deno), React + TypeScript, Supabase JS client v2

---

### Task 1: Add env-var guard to `toast-oauth-start`

**Files:**
- Modify: `supabase/functions/toast-oauth-start/index.ts`

- [ ] **Step 1: Move Toast env reads from module scope into the handler and add guard**

Replace lines 26-29:
```typescript
const TOAST_OAUTH_AUTHORIZE_URL = Deno.env.get("TOAST_OAUTH_AUTHORIZE_URL")!;
const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID")!;
const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI")!;
```

With nothing (delete those three lines). Then, inside the `serve` handler, immediately after the OPTIONS check (after line 67), insert:

```typescript
    // --- Guard: check Toast env vars ---
    const TOAST_OAUTH_AUTHORIZE_URL = Deno.env.get("TOAST_OAUTH_AUTHORIZE_URL");
    const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID");
    const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI");

    if (!TOAST_OAUTH_AUTHORIZE_URL || !TOAST_CLIENT_ID || !TOAST_OAUTH_REDIRECT_URI) {
      return new Response(
        JSON.stringify({
          error: "toast_not_configured",
          message: "Toast API credentials are not configured yet.",
        }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` stay at module scope — they're always available.

- [ ] **Step 2: Deploy `toast-oauth-start` to Supabase**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `toast-oauth-start`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/toast-oauth-start/index.ts`

- [ ] **Step 3: Verify deployment succeeded**

Use `list_edge_functions` and confirm `toast-oauth-start` appears in the list with status `ACTIVE`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/toast-oauth-start/index.ts
git commit -m "feat(toast): add env-var guard to toast-oauth-start edge function"
```

---

### Task 2: Add env-var guard to `toast-oauth-callback`

**Files:**
- Modify: `supabase/functions/toast-oauth-callback/index.ts`

- [ ] **Step 1: Move Toast env reads from module scope into the handler and add guard**

Replace lines 23-28:
```typescript
const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL")!;
const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID")!;
const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET")!;
const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI")!;
const DRAGONCANDY_APP_URL = Deno.env.get("DRAGONCANDY_APP_URL") || "https://dragoncandy.io";
```

With nothing (delete those five lines). Then, inside the `serve` handler, immediately after the OPTIONS check (after line 69), insert:

```typescript
    // --- Guard: check Toast env vars ---
    const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL");
    const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID");
    const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET");
    const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI");
    const DRAGONCANDY_APP_URL = Deno.env.get("DRAGONCANDY_APP_URL") || "https://dragoncandy.io";

    if (!TOAST_OAUTH_TOKEN_URL || !TOAST_CLIENT_ID || !TOAST_CLIENT_SECRET || !TOAST_OAUTH_REDIRECT_URI) {
      return new Response(
        JSON.stringify({
          error: "toast_not_configured",
          message: "Toast API credentials are not configured yet.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
```

Note: `DRAGONCANDY_APP_URL` has a fallback default so it doesn't need a guard. The `verifySignature` helper uses `SUPABASE_SERVICE_ROLE_KEY` which stays at module scope.

- [ ] **Step 2: Deploy `toast-oauth-callback` to Supabase**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `toast-oauth-callback`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/toast-oauth-callback/index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/toast-oauth-callback/index.ts
git commit -m "feat(toast): add env-var guard to toast-oauth-callback edge function"
```

---

### Task 3: Add env-var guard to `toast-token-refresh`

**Files:**
- Modify: `supabase/functions/toast-token-refresh/index.ts`

- [ ] **Step 1: Move Toast env reads from module scope into the handler and add guard**

Replace lines 22-24:
```typescript
const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL")!;
const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID")!;
const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET")!;
```

With nothing (delete those three lines). Then, inside the `serve` handler, immediately after the OPTIONS check (after line 28), insert:

```typescript
    // --- Guard: check Toast env vars ---
    const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL");
    const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID");
    const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET");

    if (!TOAST_OAUTH_TOKEN_URL || !TOAST_CLIENT_ID || !TOAST_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({
          error: "toast_not_configured",
          message: "Toast API credentials are not configured yet.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
```

- [ ] **Step 2: Deploy `toast-token-refresh` to Supabase**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `toast-token-refresh`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/toast-token-refresh/index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/toast-token-refresh/index.ts
git commit -m "feat(toast): add env-var guard to toast-token-refresh edge function"
```

---

### Task 4: Deploy remaining 3 Toast edge functions (no code changes)

**Files:**
- Deploy only (no modifications): `supabase/functions/toast-discount-push/index.ts`
- Deploy only (no modifications): `supabase/functions/toast-redemption-webhook/index.ts`
- Deploy only (no modifications): `supabase/functions/donny-toast-context/index.ts`

- [ ] **Step 1: Deploy `toast-discount-push`**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `toast-discount-push`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/toast-discount-push/index.ts`

- [ ] **Step 2: Deploy `toast-redemption-webhook`**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `toast-redemption-webhook`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/toast-redemption-webhook/index.ts`

- [ ] **Step 3: Deploy `donny-toast-context`**

Use the Supabase MCP `deploy_edge_function` tool:
- `project_id`: `zocahiffooqdybdhguqv`
- `name`: `donny-toast-context`
- `entrypoint_path`: `index.ts`
- `verify_jwt`: `false`
- `files`: the full contents of `supabase/functions/donny-toast-context/index.ts`

- [ ] **Step 4: Verify all 6 Toast functions are deployed**

Use `list_edge_functions` and confirm all 6 appear: `toast-oauth-start`, `toast-oauth-callback`, `toast-token-refresh`, `toast-discount-push`, `toast-redemption-webhook`, `donny-toast-context`. All should have status `ACTIVE`.

---

### Task 5: Update frontend `ToastConnectionCard` to show "coming soon"

**Files:**
- Modify: `src/features/settings/ToastConnectionCard.tsx`

- [ ] **Step 1: Add `notConfigured` state**

After line 97 (`const [restaurantGuid, setRestaurantGuid] = useState('');`), add:

```typescript
  const [notConfigured, setNotConfigured] = useState(false);
```

- [ ] **Step 2: Update `handleConnect` to detect `toast_not_configured` error**

Replace the `handleConnect` function (lines 157-177) with:

```typescript
  const handleConnect = async () => {
    if (!businessId) {
      toast({ title: 'No business profile', description: 'Please complete your restaurant profile first.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('toast-oauth-start', {
        body: { business_id: businessId, restaurant_guid: restaurantGuid || undefined },
      });
      if (error) {
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
          return;
        }
        throw error;
      }
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: any) {
      console.error('Toast connect failed:', err);
      toast({ title: 'Connection failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };
```

The key change: before throwing, check `data?.error === 'toast_not_configured'`. Supabase `functions.invoke` puts the parsed JSON body in `data` even when the function returns a non-2xx status.

- [ ] **Step 3: Update `handleTest` to detect `toast_not_configured` error**

Replace the `handleTest` function (lines 180-196) with:

```typescript
  const handleTest = async () => {
    if (!connection) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('toast-token-refresh', {});
      if (error) {
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
          return;
        }
        throw error;
      }
      toast({
        title: 'Connection healthy',
        description: `Toast responded successfully. ${data?.refreshed || 0} token(s) refreshed.`,
      });
      fetchConnection();
    } catch (err: any) {
      toast({ title: 'Test failed', description: err.message || 'Could not reach Toast.', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };
```

- [ ] **Step 4: Replace the "not connected" UI block with conditional rendering**

Replace the `{status === 'not_connected' && (...)}` block (lines 262-297) with:

```tsx
          {status === 'not_connected' && (
            notConfigured ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 flex items-start gap-3">
                <Zap className="w-5 h-5 text-teal-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-teal-800">
                    Toast integration coming soon
                  </p>
                  <p className="text-sm text-teal-600 mt-1">
                    We're finalizing our partnership with Toast POS. You'll be able to connect here once it's ready.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-5 lg:grid lg:grid-cols-2 lg:gap-6">
                <div className="space-y-3 mb-4 lg:mb-0">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Connect your Toast POS so DragonCandy can read menus and
                    count promotion redemptions at the register.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="restaurant-guid" className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Restaurant GUID <span className="normal-case text-gray-400">(optional)</span>
                    </Label>
                    <Input
                      id="restaurant-guid"
                      value={restaurantGuid}
                      onChange={(e) => setRestaurantGuid(e.target.value)}
                      placeholder="e.g. abc12345-def6-7890-ghij-klmnopqrstuv"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-end lg:justify-end">
                  <Button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="w-full lg:w-auto rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold px-8"
                  >
                    {connecting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4 mr-2" />
                    )}
                    {connecting ? 'Connecting...' : 'Connect Toast'}
                  </Button>
                </div>
              </div>
            )
          )}
```

- [ ] **Step 5: Auto-detect on mount — try connecting to detect config state**

Add a `useEffect` that probes `toast-oauth-start` on mount to detect whether Toast is configured, so the "coming soon" state shows immediately without requiring the user to click Connect first.

After the existing `useEffect(() => { fetchConnection(); }, [fetchConnection]);` block (line 135), add:

```typescript
  // Probe Toast config on mount (only when not connected)
  useEffect(() => {
    if (!businessId || connection) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('toast-oauth-start', {
          body: { business_id: businessId },
        });
        if (data?.error === 'toast_not_configured') {
          setNotConfigured(true);
        }
      } catch {
        // Ignore — user will see the error when they click Connect
      }
    })();
  }, [businessId, connection]);
```

- [ ] **Step 6: Verify locally**

Run: `npm run dev`

Navigate to Business Settings. The Toast card should show the "coming soon" banner instead of the Connect button (since the deployed function will return 503 without Toast env vars).

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/ToastConnectionCard.tsx
git commit -m "feat(toast): show coming-soon UI when Toast credentials not configured"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Verify edge functions respond with 503**

Use the Supabase MCP `get_logs` tool with `service: "edge-function"` to confirm that calls to `toast-oauth-start` now return 503 (not 404).

- [ ] **Step 2: Verify the frontend shows "coming soon"**

Open dragoncandy.io (or local dev), go to Business Settings, confirm:
- Toast POS card is visible
- Status badge shows "Not Connected"
- Card body shows teal "coming soon" banner
- No red error toast notification appears

- [ ] **Step 3: Verify all 6 functions are active**

Use `list_edge_functions` one final time and confirm all 6 Toast functions have status `ACTIVE`.
