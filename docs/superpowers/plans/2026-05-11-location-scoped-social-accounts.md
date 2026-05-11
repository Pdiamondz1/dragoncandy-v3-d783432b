# Location-Scoped Social Media Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope social media account connections to individual org units (locations/products) so each location can connect, disconnect, and replace its own social accounts independently.

**Architecture:** Add `org_unit_id` column to `business_outstand_accounts`. The frontend passes the active org unit via query parameter on the Outstand proxy base URL. The proxy includes it in connection upserts and uses it to filter account lookups. Existing unassigned accounts trigger a one-time reassignment prompt.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase JS v2, Deno Edge Functions, Tailwind CSS, @outstand-so/ui SDK

**Spec:** `docs/superpowers/specs/2026-05-11-location-scoped-social-accounts-design.md`

---

### Task 1: Schema migration — Add org_unit_id to business_outstand_accounts

**Files:**
- Create: `supabase/migrations/20260511000000_add_org_unit_id_to_outstand_accounts.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerate)

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260511000000_add_org_unit_id_to_outstand_accounts.sql`:

```sql
ALTER TABLE public.business_outstand_accounts
  ADD COLUMN org_unit_id UUID REFERENCES public.org_units(id) ON DELETE SET NULL;

CREATE INDEX idx_business_outstand_accounts_org_unit
  ON public.business_outstand_accounts(org_unit_id);
```

- [ ] **Step 2: Run the migration via Supabase MCP**

Execute via `mcp__plugin_supabase_supabase__execute_sql` with the same SQL above.

- [ ] **Step 3: Verify the column exists**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'business_outstand_accounts'
  AND column_name = 'org_unit_id';
```

Expected: one row with `uuid`, `YES`.

- [ ] **Step 4: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --project-id zocahiffooqdybdhguqv > src/integrations/supabase/types.ts`

Verify the regenerated types include `org_unit_id` on the `business_outstand_accounts` table type. Without this, Tasks 6-8 will fail TypeScript checks.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260511000000_add_org_unit_id_to_outstand_accounts.sql src/integrations/supabase/types.ts
git commit -m "feat: add org_unit_id column to business_outstand_accounts"
```

---

### Task 2: Outstand proxy — CORS, TenantContext, and org unit reading

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts`

This task updates CORS headers, the TenantContext interface, `resolveTenant` signature, and the main `serve` handler to read the org unit from query params / headers.

- [ ] **Step 1: Update CORS headers**

Change line 27-28:
```typescript
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
```
to:
```typescript
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-org-unit-id, x-delegated-account-id, x-delegated-user-id",
```

- [ ] **Step 2: Update TenantContext interface**

Change lines 44-47:
```typescript
interface TenantContext {
  userId: string;
  businessId: string | null;
}
```
to:
```typescript
interface TenantContext {
  userId: string;
  businessId: string | null;
  orgUnitId: string | null;
}
```

- [ ] **Step 3: Update resolveTenant to accept orgUnitId**

Change lines 95-98:
```typescript
async function resolveTenant(
  authHeader: string,
  admin: SupabaseClient,
): Promise<TenantContext | { error: number; message: string }> {
```
to:
```typescript
async function resolveTenant(
  authHeader: string,
  admin: SupabaseClient,
  orgUnitId: string | null,
): Promise<TenantContext | { error: number; message: string }> {
```

Change lines 113-116:
```typescript
  return {
    userId: userData.user.id,
    businessId: (biz?.id as string | undefined) ?? null,
  };
```
to:
```typescript
  return {
    userId: userData.user.id,
    businessId: (biz?.id as string | undefined) ?? null,
    orgUnitId,
  };
```

- [ ] **Step 4: Read org unit in serve handler and pass to resolveTenant**

In the `serve` handler, after line 449 (`const authHeader = req.headers.get("Authorization");`), add the org unit read. Then update the `resolveTenant` call.

After line 453 (`return jsonResponse(401, { error: "missing_authorization" });`), before `const admin = ...`, add:
```typescript
  const reqUrl = new URL(req.url);
  const orgUnitId = reqUrl.searchParams.get('org_unit_id') || req.headers.get('x-org-unit-id') || null;
  reqUrl.searchParams.delete('org_unit_id');
```

**Important:** The `org_unit_id` param must be stripped before forwarding to the upstream Outstand API. `extractOutstandPath` (line 463) returns `url.search` which gets appended to Outstand API requests. Without stripping, every request to `api.outstand.so` would include `?org_unit_id=...` which could cause 400 errors.

Change line 455:
```typescript
  const ctxOrError = await resolveTenant(authHeader, admin);
```
to:
```typescript
  const ctxOrError = await resolveTenant(authHeader, admin, orgUnitId);
```

Also update line 463 to use the cleaned URL instead of the raw request URL:
```typescript
  const { path, search } = extractOutstandPath(req.url);
```
to:
```typescript
  const { path, search } = extractOutstandPath(reqUrl.toString());
```

Since `reqUrl` already had `org_unit_id` deleted from its searchParams, this ensures the param is not forwarded to the Outstand API.

- [ ] **Step 5: Verify build**

Run: `npx supabase functions serve outstand-proxy --no-verify-jwt` (or just verify syntax with a quick check). Since this is an edge function, verify no syntax errors by deploying or running locally if possible.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/outstand-proxy/index.ts
git commit -m "feat: add org unit context to outstand proxy CORS, TenantContext, and resolveTenant"
```

---

### Task 3: Outstand proxy — Location-scoped account listing

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts`

- [ ] **Step 1: Update listOwnedAccountIds to accept orgUnitId**

Change lines 119-130:
```typescript
async function listOwnedAccountIds(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");
  const rows = (data ?? []) as Array<{ outstand_social_account_id: string }>;
  return new Set(rows.map((r) => r.outstand_social_account_id));
}
```
to:
```typescript
async function listOwnedAccountIds(
  admin: SupabaseClient,
  userId: string,
  orgUnitId?: string | null,
): Promise<Set<string>> {
  let query = admin
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (orgUnitId) {
    query = query.eq("org_unit_id", orgUnitId);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{ outstand_social_account_id: string }>;
  return new Set(rows.map((r) => r.outstand_social_account_id));
}
```

- [ ] **Step 2: Pass orgUnitId from serve handler to listOwnedAccountIds**

Change line 461:
```typescript
  const ownedIds = await listOwnedAccountIds(admin, ctx.userId);
```
to:
```typescript
  const ownedIds = await listOwnedAccountIds(admin, ctx.userId, ctx.orgUnitId);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/outstand-proxy/index.ts
git commit -m "feat: scope listOwnedAccountIds by org unit"
```

---

### Task 4: Outstand proxy — Location-tagged connection recording + bug fix

**Files:**
- Modify: `supabase/functions/outstand-proxy/index.ts`

- [ ] **Step 1: Add org_unit_id to recordConnectionFromAuthResponse**

In the upsert object inside `recordConnectionFromAuthResponse` (lines 349-359), add `org_unit_id` after `last_seen_at`:

Change:
```typescript
      return admin.from("business_outstand_accounts").upsert(
        {
          business_id: ctx.businessId,
          user_id: ctx.userId,
          outstand_social_account_id: String(id),
          platform: network as Platform,
          platform_handle: handle,
          status: "active",
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,outstand_social_account_id" },
      );
```
to:
```typescript
      return admin.from("business_outstand_accounts").upsert(
        {
          business_id: ctx.businessId,
          user_id: ctx.userId,
          outstand_social_account_id: String(id),
          platform: network as Platform,
          platform_handle: handle,
          status: "active",
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          org_unit_id: ctx.orgUnitId,
        },
        { onConflict: "user_id,outstand_social_account_id" },
      );
```

- [ ] **Step 2: Add org_unit_id to handleRecordConnection and fix onConflict bug**

In `handleRecordConnection`, read `org_unit_id` from the request body and fix the wrong `onConflict`.

After line 384 (`const username = body?.username ? String(body.username) : null;`), add:
```typescript
  const bodyOrgUnitId = body?.org_unit_id ? String(body.org_unit_id) : null;
```

Change lines 404-416:
```typescript
  const { error: upsertError } = await admin.from("business_outstand_accounts").upsert(
    {
      business_id: ctx.businessId,
      user_id: ctx.userId,
      outstand_social_account_id: accountId,
      platform: network as Platform,
      platform_handle: username,
      status: "active",
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "business_id,outstand_social_account_id" },
  );
```
to:
```typescript
  const { error: upsertError } = await admin.from("business_outstand_accounts").upsert(
    {
      business_id: ctx.businessId,
      user_id: ctx.userId,
      outstand_social_account_id: accountId,
      platform: network as Platform,
      platform_handle: username,
      status: "active",
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      org_unit_id: bodyOrgUnitId || ctx.orgUnitId,
    },
    { onConflict: "user_id,outstand_social_account_id" },
  );
```

This fixes two things: adds `org_unit_id` and corrects the `onConflict` from the wrong `business_id` key to the correct `user_id` key.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/outstand-proxy/index.ts
git commit -m "feat: tag social connections with org_unit_id, fix onConflict bug in handleRecordConnection"
```

---

### Task 5: Outstand Provider — Append org unit to baseUrl

**Files:**
- Modify: `src/integrations/outstand/Provider.tsx`

- [ ] **Step 1: Update useOutstandConfig to include activeOrgUnit in baseUrl**

Replace the entire file content:

```typescript
import React from 'react';
import { OutstandProvider } from '@outstand-so/ui';
import { useAuth } from '@/hooks/useAuth';
import { SUPABASE_URL } from '@/integrations/supabase/client';

export const OUTSTAND_PROXY_BASE_URL = `${SUPABASE_URL}/functions/v1/outstand-proxy`;

interface DragonCandyOutstandProviderProps {
  children: React.ReactNode;
}

export function useOutstandConfig() {
  const { session, activeOrgUnit } = useAuth();
  const baseUrl = activeOrgUnit?.id
    ? `${OUTSTAND_PROXY_BASE_URL}?org_unit_id=${activeOrgUnit.id}`
    : OUTSTAND_PROXY_BASE_URL;
  return {
    apiKey: session?.access_token ?? '',
    baseUrl,
  };
}

export const DragonCandyOutstandProvider: React.FC<DragonCandyOutstandProviderProps> = ({ children }) => {
  const { apiKey, baseUrl } = useOutstandConfig();

  return (
    <OutstandProvider apiKey={apiKey} baseUrl={baseUrl}>
      {children}
    </OutstandProvider>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/outstand/Provider.tsx
git commit -m "feat: append active org unit to outstand proxy base URL"
```

---

### Task 6: New hooks — useLocationSocialAccounts and useUnassignedSocialAccounts

**Files:**
- Create: `src/hooks/outstand/useLocationSocialAccounts.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LocationSocialAccount {
  id: string;
  platform: string;
  platform_handle: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  status: string;
  outstand_social_account_id: string;
}

export function useLocationSocialAccounts(userId: string | undefined, orgUnitId?: string | null) {
  return useQuery({
    queryKey: ['location-social-accounts', userId, orgUnitId ?? 'all'],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from('business_outstand_accounts')
        .select('id, platform, platform_handle, org_unit_id, status, outstand_social_account_id, org_units(name)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (orgUnitId) {
        query = query.eq('org_unit_id', orgUnitId);
      }

      const { data, error } = await query.order('connected_at', { ascending: false });

      if (error) {
        console.error('Error fetching location social accounts:', error);
        throw error;
      }

      return (data ?? []).map((row: any) => ({
        id: row.id,
        platform: row.platform,
        platform_handle: row.platform_handle,
        org_unit_id: row.org_unit_id,
        org_unit_name: row.org_units?.name ?? null,
        status: row.status,
        outstand_social_account_id: row.outstand_social_account_id,
      })) as LocationSocialAccount[];
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUnassignedSocialAccounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['unassigned-social-accounts', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('business_outstand_accounts')
        .select('id, platform, platform_handle, org_unit_id, outstand_social_account_id, org_units(name, deleted_at)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('connected_at', { ascending: false });

      if (error) {
        console.error('Error fetching unassigned social accounts:', error);
        throw error;
      }

      return (data ?? [])
        .filter((row: any) => !row.org_unit_id || row.org_units?.deleted_at != null)
        .map((row: any) => ({
          id: row.id,
          platform: row.platform,
          platform_handle: row.platform_handle,
          org_unit_id: row.org_unit_id,
          org_unit_name: row.org_units?.name ?? null,
          status: row.status,
          outstand_social_account_id: row.outstand_social_account_id,
        })) as LocationSocialAccount[];
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useLocationSocialAccounts.ts
git commit -m "feat: add useLocationSocialAccounts and useUnassignedSocialAccounts hooks"
```

---

### Task 7: New hook — useAssignAccountLocation

**Files:**
- Create: `src/hooks/outstand/useAssignAccountLocation.ts`

- [ ] **Step 1: Create the mutation hook**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AssignmentInput {
  accountId: string;
  orgUnitId: string;
}

export function useAssignAccountLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignments: AssignmentInput[]) => {
      const results = await Promise.all(
        assignments.map(({ accountId, orgUnitId }) =>
          supabase
            .from('business_outstand_accounts')
            .update({ org_unit_id: orgUnitId })
            .eq('id', accountId)
        ),
      );

      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error('Some account assignments failed:', failed.map((r) => r.error));
        throw new Error(`${failed.length} assignment(s) failed`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['verified-status'] });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useAssignAccountLocation.ts
git commit -m "feat: add useAssignAccountLocation mutation hook"
```

---

### Task 8: AccountsTab — Location-aware rendering

**Files:**
- Modify: `src/components/outstand/AccountsTab.tsx`

This is the largest frontend task. The component gains three modes: specific location (existing SDK behavior), All Locations (custom list with badges), and unassigned accounts prompt.

- [ ] **Step 1: Rewrite AccountsTab with location awareness**

Replace the entire file:

```typescript
import React, { useState } from 'react';
import { ConnectAccountButtonGroup, AccountsList, type SocialNetwork } from '@outstand-so/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig, OUTSTAND_PROXY_BASE_URL } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { toast } from 'sonner';
import { BrandGuidelinesEditor } from './BrandGuidelinesEditor';
import { DelegatedPostingPermissions } from './DelegatedPostingPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import { useLocationSocialAccounts, useUnassignedSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAssignAccountLocation } from '@/hooks/outstand/useAssignAccountLocation';
import { Globe, MapPin, Unplug } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const SUPPORTED_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'tiktok', 'x', 'youtube'];

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  tiktok: 'bg-gray-100 text-gray-700',
  x: 'bg-gray-100 text-gray-700',
  youtube: 'bg-red-100 text-red-700',
};

export const AccountsTab: React.FC = () => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { oauthCallback } = useOutstandPaths();
  const redirectUri = `${window.location.origin}${oauthCallback}`;
  const { profile, activeOrgUnit, activeOrg } = useAuth();
  const isBrand = profile?.role === 'brand';
  const queryClient = useQueryClient();
  const { data: units = [] } = useOrgUnits(activeOrg?.id);
  const { data: allAccounts = [] } = useLocationSocialAccounts(profile?.id, null);
  const { data: unassigned = [] } = useUnassignedSocialAccounts(profile?.id);
  const assignMutation = useAssignAccountLocation();
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const handleSaveAssignments = () => {
    const entries = Object.entries(assignments).filter(([, unitId]) => unitId);
    if (entries.length === 0) return;
    assignMutation.mutate(
      entries.map(([accountId, orgUnitId]) => ({ accountId, orgUnitId })),
      {
        onSuccess: () => {
          toast.success('Accounts assigned to locations.');
          setAssignments({});
        },
        onError: () => toast.error('Failed to assign some accounts.'),
      },
    );
  };

  const handleDisconnect = async (outstandAccountId: string) => {
    try {
      const res = await fetch(`${OUTSTAND_PROXY_BASE_URL}/social-accounts/${outstandAccountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success('Account disconnected.');
      queryClient.invalidateQueries({ queryKey: ['location-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-social-accounts'] });
    } catch {
      toast.error('Failed to disconnect account.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Unassigned accounts prompt */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-4 border-2 border-amber-300">
          <h2 className="text-base font-bold text-amber-900">Assign accounts to locations</h2>
          <p className="text-xs text-amber-700 mt-1 mb-4">
            These accounts aren't assigned to a location yet. Pick a location for each so they appear under the right dashboard.
          </p>
          <div className="space-y-3">
            {unassigned.map((acct) => (
              <div key={acct.id} className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_COLORS[acct.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                  {acct.platform}
                </span>
                <span className="text-sm font-medium text-gray-800 truncate flex-1">
                  {acct.platform_handle || acct.outstand_social_account_id}
                </span>
                <Select
                  value={assignments[acct.id] ?? ''}
                  onValueChange={(val) => setAssignments((prev) => ({ ...prev, [acct.id]: val }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.filter((u) => !u.deleted_at).map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button
            className="mt-4"
            size="sm"
            disabled={Object.values(assignments).filter(Boolean).length === 0 || assignMutation.isPending}
            onClick={handleSaveAssignments}
          >
            {assignMutation.isPending ? 'Saving…' : 'Save assignments'}
          </Button>
        </div>
      )}

      {/* Connect + List — specific location mode */}
      {activeOrgUnit ? (
        <>
          <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <h2 className="text-base font-bold text-gray-900">Connect a network</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Connect your social accounts so you can publish, schedule, and respond to comments from one place.
            </p>
            <ConnectAccountButtonGroup
              networks={SUPPORTED_NETWORKS}
              redirectUri={redirectUri}
              apiKey={apiKey}
              baseUrl={baseUrl}
              layout="grid"
              variant="outline"
              onSuccess={(network, authUrl) => {
                sessionStorage.setItem('outstand_pending_network', network);
                sessionStorage.setItem('outstand_pending_org_unit_id', activeOrgUnit.id);
                window.location.href = authUrl;
              }}
              onError={(network, error) => {
                console.error('Outstand connect error:', network, error);
                toast.error(`Could not start ${network} connection: ${error.message}`);
              }}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <h2 className="text-base font-bold text-gray-900">Connected accounts</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Disconnect any account you no longer want to publish to.
            </p>
            <AccountsList
              apiKey={apiKey}
              baseUrl={baseUrl}
              onAccountDisconnect={() => {
                toast.success('Account disconnected.');
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 text-gray-500">
              <Globe className="h-4 w-4" />
              <p className="text-sm">Switch to a specific location to connect new accounts.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
            <h2 className="text-base font-bold text-gray-900">All connected accounts</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Accounts across all your locations. Change location or disconnect from here.
            </p>
            {allAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">No connected accounts.</p>
            ) : (
              <div className="space-y-2">
                {allAccounts.map((acct) => (
                  <div key={acct.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_COLORS[acct.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                      {acct.platform}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate flex-1">
                      {acct.platform_handle || acct.outstand_social_account_id}
                    </span>
                    {acct.org_unit_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        <MapPin className="h-3 w-3" />
                        {acct.org_unit_name}
                      </span>
                    )}
                    <Select
                      value={acct.org_unit_id ?? ''}
                      onValueChange={(val) => {
                        assignMutation.mutate(
                          [{ accountId: acct.id, orgUnitId: val }],
                          {
                            onSuccess: () => toast.success('Location updated.'),
                            onError: () => toast.error('Failed to update location.'),
                          },
                        );
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Change location" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.filter((u) => !u.deleted_at).map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => handleDisconnect(acct.outstand_social_account_id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Disconnect"
                    >
                      <Unplug className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isBrand && (
        <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
          <h2 className="text-base font-bold text-gray-900 mb-3">Brand Guidelines</h2>
          <p className="text-xs text-gray-500 mb-4">
            These guidelines are auto-applied when amplifying sponsored content.
          </p>
          <BrandGuidelinesEditor />
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-gray-200">
        <h2 className="text-base font-bold text-gray-900 mb-3">Posting Permissions</h2>
        <p className="text-xs text-gray-500 mb-4">Manage who can post on behalf of your accounts.</p>
        <DelegatedPostingPermissions />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/outstand/AccountsTab.tsx
git commit -m "feat: location-aware AccountsTab with reassignment prompt and All Locations view"
```

---

### Task 9: OAuth callback — Pass org unit through

**Files:**
- Modify: `src/pages/OutstandOAuthCallbackPage.tsx`

- [ ] **Step 1: Update OneStepCallback to include org_unit_id**

In the `OneStepCallback` component, inside the `useEffect` (around line 28), after `sessionStorage.removeItem(PENDING_NETWORK_KEY);`, add:

```typescript
    const orgUnitId = sessionStorage.getItem('outstand_pending_org_unit_id') ?? '';
    sessionStorage.removeItem('outstand_pending_org_unit_id');
```

Then update the `body` in the fetch call (around line 47) from:
```typescript
      body: JSON.stringify({ account_id: accountId, network, username }),
```
to:
```typescript
      body: JSON.stringify({ account_id: accountId, network, username, org_unit_id: orgUnitId || undefined }),
```

Note: `orgUnitId` is declared inside the `useEffect` callback (read from `sessionStorage`), so it is **not** a dependency and should **not** be added to the deps array. The existing deps array is correct as-is.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OutstandOAuthCallbackPage.tsx
git commit -m "feat: pass org_unit_id through OAuth callback to outstand proxy"
```

---

### Task 10: Campaign social hook — Filter by org_unit_id

**Files:**
- Modify: `supabase/functions/fire-campaign-social-hook/index.ts`

- [ ] **Step 1: Add org_unit_id to campaign select**

Change line 33:
```typescript
      .select('id, title, user_id, status')
```
to:
```typescript
      .select('id, title, user_id, status, org_unit_id')
```

- [ ] **Step 2: Filter account lookup by campaign org_unit_id**

Replace lines 121-125:
```typescript
          const { data: outstandAccounts } = await supabase
            .from('business_outstand_accounts')
            .select('platform, platform_handle')
            .eq('user_id', party.user_id)
            .limit(1);
```
with:
```typescript
          let accountQuery = supabase
            .from('business_outstand_accounts')
            .select('platform, platform_handle')
            .eq('user_id', party.user_id)
            .eq('status', 'active');

          if (campaign.org_unit_id) {
            accountQuery = accountQuery.eq('org_unit_id', campaign.org_unit_id);
          }

          const { data: outstandAccounts } = await accountQuery.limit(1);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fire-campaign-social-hook/index.ts
git commit -m "feat: scope campaign social hook to campaign's org_unit_id"
```

---

### Task 11: Build verification + manual QA

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: No TypeScript errors, clean build.

- [ ] **Step 2: Test location-scoped social accounts**

1. Log in as a restaurant user with multiple locations and connected social accounts
2. Navigate to the social accounts management page
3. If accounts exist without locations, verify the amber reassignment prompt appears
4. Assign accounts to locations using the dropdowns, click "Save assignments"
5. Switch to a specific location — verify only that location's accounts appear
6. Switch to "All Locations" — verify all accounts appear with location badges
7. In "All Locations", verify the "Connect a network" card is hidden and the info message appears
8. Switch to a specific location, verify the connect button appears
9. Connect a new account — verify it gets tagged to the active location
10. Disconnect an account — verify it disappears from the list
11. In "All Locations" view, use "Change location" dropdown to move an account between locations
