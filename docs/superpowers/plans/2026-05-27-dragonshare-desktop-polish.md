# DragonShare Desktop Polish & Restaurant Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the creator DragonShare page with a side-by-side desktop layout, typeahead restaurant search, and a full-page restaurant browse experience.

**Architecture:** Extract shared form logic into a hook so both the desktop inline form and mobile bottom sheet reuse it. Build a `RestaurantTypeahead` component that queries `organizations` + `org_units` with debounced search. Add a new `/dashboard/creator/dragonshare/browse` route with a grid of restaurant cards, cuisine filter pills, and location filters.

**Tech Stack:** React 18, TypeScript (strict), Supabase JS v2, React Query, Tailwind CSS, shadcn/ui, Lucide icons.

---

## Task 1: Create `useRestaurantSearch` Hook

**Files:**
- Create: `src/hooks/useRestaurantSearch.ts`

This hook provides debounced typeahead search across `organizations` joined with `org_units`. It powers both the `RestaurantTypeahead` component and the browse page search bar.

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useRestaurantSearch.ts
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RestaurantSearchResult {
  id: string;
  name: string;
  logo_url: string | null;
  org_type: string;
  address: string | null;
  brand_category: string | null;
}

export function useRestaurantSearch(searchTerm: string, enabled = true) {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  return useQuery({
    queryKey: ['restaurant-search', debouncedTerm],
    queryFn: async (): Promise<RestaurantSearchResult[]> => {
      const query = supabase
        .from('organizations')
        .select(`
          id, name, logo_url, org_type,
          org_units ( address, brand_category )
        `)
        .is('deleted_at', null)
        .eq('org_units.is_primary', true)
        .ilike('name', `%${debouncedTerm}%`)
        .limit(8);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((org) => {
        const unit = Array.isArray(org.org_units) ? org.org_units[0] : org.org_units;
        return {
          id: org.id,
          name: org.name,
          logo_url: org.logo_url,
          org_type: org.org_type,
          address: unit?.address ?? null,
          brand_category: unit?.brand_category ?? null,
        };
      });
    },
    enabled: enabled && debouncedTerm.trim().length > 0,
    staleTime: 30_000,
  });
}
```

**Note:** This searches by org name only. Cross-table `or` filters (searching both `organizations.name` and `org_units.address`) may not be supported by Supabase JS client. If address search is needed later, add an RPC.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRestaurantSearch.ts
git commit -m "feat(dragonshare): add useRestaurantSearch hook with debounced org+unit query"
```

---

## Task 2: Create `RestaurantTypeahead` Component

**Files:**
- Create: `src/components/dragonshare/RestaurantTypeahead.tsx`

Typeahead input with dropdown. Used by both the inline desktop form and the mobile bottom sheet.

- [ ] **Step 1: Create the component**

```typescript
// src/components/dragonshare/RestaurantTypeahead.tsx
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2 } from 'lucide-react';
import { useRestaurantSearch } from '@/hooks/useRestaurantSearch';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { useNavigate } from 'react-router-dom';

interface Props {
  selectedOrg: RestaurantSearchResult | null;
  onSelect: (org: RestaurantSearchResult) => void;
  onClear: () => void;
}

function OrgInitial({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 rounded-lg bg-dc-teal/20 flex items-center justify-center text-xs font-bold text-dc-teal flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ResultRow({ org, onSelect }: { org: RestaurantSearchResult; onSelect: () => void }) {
  const resolvedLogo = useResolvedLogoUrl(org.logo_url);
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-dc-teal/5 transition-colors"
    >
      {resolvedLogo ? (
        <img src={resolvedLogo} alt="" className="h-8 w-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <OrgInitial name={org.name} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-dc-text truncate">{org.name}</p>
        {org.address && (
          <p className="text-xs text-dc-text-muted truncate">{org.address}</p>
        )}
      </div>
      {org.brand_category && (
        <span className="text-[10px] bg-dc-teal/10 text-dc-teal-btn px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize">
          {org.brand_category}
        </span>
      )}
    </button>
  );
}

export function RestaurantTypeahead({ selectedOrg, onSelect, onClear }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: results, isLoading, isFetching } = useRestaurantSearch(search, open);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedOrg) {
    return (
      <SelectedChip org={selectedOrg} onClear={onClear} />
    );
  }

  const showDropdown = open && search.trim().length > 0;
  const showLoading = showDropdown && (isLoading || isFetching);
  const showEmpty = showDropdown && !isLoading && !isFetching && (results?.length ?? 0) === 0;
  const showResults = showDropdown && !isLoading && (results?.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-teal" />
        <Input
          placeholder="Search restaurants..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="rounded-xl pl-9 border-dc-teal/30 focus-visible:ring-dc-teal/40 bg-dc-teal/[0.03]"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-dc-teal/20 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="max-h-72 overflow-y-auto p-1.5">
            {showLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 text-dc-teal animate-spin" />
              </div>
            )}
            {showEmpty && (
              <p className="text-sm text-dc-text-muted text-center py-4">
                No restaurants found
              </p>
            )}
            {showResults && results!.map((org) => (
              <ResultRow
                key={org.id}
                org={org}
                onSelect={() => {
                  onSelect(org);
                  setSearch('');
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="border-t border-dc-teal/10 px-3 py-2">
            <button
              onClick={() => navigate('/dashboard/creator/dragonshare/browse')}
              className="text-xs font-semibold text-dc-teal hover:text-dc-teal-dark transition-colors flex items-center gap-1"
            >
              <span>&rarr;</span> Browse all restaurants
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedChip({ org, onClear }: { org: RestaurantSearchResult; onClear: () => void }) {
  const resolvedLogo = useResolvedLogoUrl(org.logo_url);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dc-teal/30 bg-dc-teal/5 px-3 py-2">
      {resolvedLogo ? (
        <img src={resolvedLogo} alt="" className="h-6 w-6 rounded-full ring-1 ring-dc-teal/30 object-cover" />
      ) : (
        <div className="h-6 w-6 rounded-full bg-dc-teal/20 flex items-center justify-center text-[10px] font-bold text-dc-teal">
          {org.name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-medium text-dc-text flex-1 truncate">{org.name}</span>
      <button onClick={onClear} className="text-dc-text-muted hover:text-dc-text p-0.5">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors in RestaurantTypeahead.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/dragonshare/RestaurantTypeahead.tsx
git commit -m "feat(dragonshare): add RestaurantTypeahead component with dropdown and selected chip"
```

---

## Task 3: Extract `useDragonShareSubmitForm` Hook

**Files:**
- Create: `src/hooks/useDragonShareSubmitForm.ts`
- Reference: `src/components/dragonshare/DragonShareSubmitSheet.tsx` (extract form logic from here)

Extract the shared form state and handlers from `DragonShareSubmitSheet.tsx` into a reusable hook. Both the desktop inline form and mobile bottom sheet will consume this hook.

- [ ] **Step 1: Create the shared hook**

```typescript
// src/hooks/useDragonShareSubmitForm.ts
import { useState, useRef } from 'react';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { useDragonShareUpload } from '@/hooks/useDragonShareUpload';
import { detectPlatformFromUrl } from '@/lib/detectPlatform';
import { toast } from 'sonner';
import type { ContentType } from '@/types/dragonshare';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

export function useDragonShareSubmitForm(options?: { onSuccess?: () => void }) {
  const submitMutation = useSubmitDragonSharePost();
  const { upload, uploading } = useDragonShareUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<RestaurantSearchResult | null>(null);

  const detectedPlatform = postUrl ? detectPlatformFromUrl(postUrl) : null;

  const contentType: ContentType | null = uploadedFileType
    ? (uploadedFileType.startsWith('video/') ? 'video' : 'photo')
    : null;

  const canSubmit = (!!uploadedUrl || !!postUrl.trim()) && !!selectedOrg && !submitMutation.isPending && !uploading;

  function reset() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
    setPostUrl('');
    setSelectedOrg(null);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) {
      setUploadedUrl(url);
      setUploadedFileName(file.name);
      setUploadedFileType(file.type);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeUpload() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
  }

  async function handleSubmit() {
    if (!selectedOrg) return;
    if (!uploadedUrl && !postUrl.trim()) return;

    try {
      await submitMutation.mutateAsync({
        target_org_id: selectedOrg.id,
        content_type: contentType ?? 'photo',
        post_url: postUrl.trim() || null,
        platform: detectedPlatform,
        content_file_path: uploadedUrl,
      });
      toast.success('Content shared! The restaurant can now see and boost your post.');
      reset();
      options?.onSuccess?.();
    } catch {
      toast.error('Submission failed. Please try again.');
    }
  }

  return {
    // State
    uploadedUrl,
    uploadedFileName,
    uploadedFileType,
    postUrl,
    setPostUrl,
    selectedOrg,
    setSelectedOrg,
    detectedPlatform,
    contentType,
    canSubmit,
    submitting: submitMutation.isPending,
    uploading,
    fileInputRef,
    // Actions
    handleFileSelect,
    removeUpload,
    handleSubmit,
    reset,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDragonShareSubmitForm.ts
git commit -m "feat(dragonshare): extract useDragonShareSubmitForm shared hook"
```

---

## Task 4: Update `DragonShareSubmitSheet` to Use Shared Hook + Typeahead

**Files:**
- Modify: `src/components/dragonshare/DragonShareSubmitSheet.tsx`

Replace the inline form state/logic with `useDragonShareSubmitForm` hook, and replace the `OrgPickerButton` grid with `RestaurantTypeahead`.

- [ ] **Step 1: Rewrite DragonShareSubmitSheet**

Replace the entire file content. The component becomes a thin wrapper around the shared hook and components:

```typescript
// src/components/dragonshare/DragonShareSubmitSheet.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Link, X, Loader2 } from 'lucide-react';
import { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedOrgId?: string | null;
}

export function DragonShareSubmitSheet({ open, onOpenChange, preselectedOrgId: _preselectedOrgId }: Props) {
  const form = useDragonShareSubmitForm({
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) form.reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-dc-teal font-bold">Share Your Content</SheetTitle>
          <p className="text-xs text-dc-text-muted">Upload your content, tag the restaurant, get paid.</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Upload area */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Content
            </label>
            <input
              ref={form.fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={form.handleFileSelect}
            />
            {!form.uploadedUrl ? (
              <button
                onClick={() => form.fileInputRef.current?.click()}
                disabled={form.uploading}
                className="w-full border-2 border-dashed border-dc-teal/30 rounded-2xl p-6 text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/5"
              >
                {form.uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
                )}
                <p className="font-semibold text-sm text-dc-text">
                  {form.uploading ? 'Uploading...' : 'Tap to upload photo or video'}
                </p>
                <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
              </button>
            ) : (
              <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
                {form.uploadedFileType?.startsWith('video/') ? (
                  <div className="h-32 bg-dc-dark/10 flex items-center justify-center">
                    <span className="text-3xl">🎬</span>
                  </div>
                ) : (
                  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
                )}
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-dc-teal font-medium truncate">✓ {form.uploadedFileName}</span>
                  <button onClick={form.removeUpload} className="text-dc-text-muted hover:text-dc-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Post link (optional) */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Post Link <span className="text-dc-text-muted/60">(optional)</span>
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-text-muted" />
              <Input
                placeholder="Paste social media link..."
                value={form.postUrl}
                onChange={(e) => form.setPostUrl(e.target.value)}
                className="rounded-xl pl-9"
              />
            </div>
            {form.detectedPlatform && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs font-semibold text-dc-teal">
                  {PLATFORM_LABELS[form.detectedPlatform] ?? form.detectedPlatform} detected
                </span>
                <span className="text-[10px] text-dc-text-muted">· from link</span>
              </div>
            )}
            <p className="text-[10px] text-dc-text-muted/70 mt-1">
              Adds credibility — restaurants boost linked posts more often
            </p>
          </div>

          {/* Tag restaurant — typeahead */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Tag Restaurant
            </label>
            <RestaurantTypeahead
              selectedOrg={form.selectedOrg}
              onSelect={form.setSelectedOrg}
              onClear={() => form.setSelectedOrg(null)}
            />
          </div>

          {/* Submit button */}
          <Button
            className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-dc-dark font-bold"
            disabled={!form.canSubmit}
            onClick={form.handleSubmit}
          >
            {form.submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              'Submit'
            )}
          </Button>

          {/* Quick tip */}
          <div className="bg-dc-dark/5 border border-dc-teal/10 rounded-xl p-3">
            <p className="text-[11px] text-dc-teal font-semibold mb-1">💡 Quick tip</p>
            <p className="text-[11px] text-dc-text-muted leading-relaxed">
              When a restaurant boosts your post, it gets cross-posted to all your connected platforms — and theirs.
              More platforms connected = more reach = higher boost value.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors. The old `OrgPickerButton`, `useQuery` for orgs, and inline state are all removed.

- [ ] **Step 3: Commit**

```bash
git add src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "refactor(dragonshare): rewrite DragonShareSubmitSheet to use shared hook + typeahead"
```

---

## Task 5: Create `DragonShareInlineForm` Component

**Files:**
- Create: `src/components/dragonshare/DragonShareInlineForm.tsx`

Desktop inline version of the submit form. Renders as a sticky card on the left side of the page. Shares all logic with the bottom sheet via `useDragonShareSubmitForm`.

- [ ] **Step 1: Create the component**

```typescript
// src/components/dragonshare/DragonShareInlineForm.tsx
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Link, X, Loader2 } from 'lucide-react';
import { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};

interface Props {
  preselectedOrg?: RestaurantSearchResult | null;
}

export function DragonShareInlineForm({ preselectedOrg }: Props) {
  const form = useDragonShareSubmitForm();

  useEffect(() => {
    if (preselectedOrg && !form.selectedOrg) {
      form.setSelectedOrg(preselectedOrg);
    }
  }, [preselectedOrg]);

  return (
    <div className="bg-white border-2 border-dc-teal/30 rounded-2xl p-5 sticky top-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-dc-teal">Share Your Content</h2>
        <p className="text-xs text-dc-text-muted mt-0.5">Upload your content, tag the restaurant, get paid.</p>
      </div>

      {/* Upload area */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Content
        </label>
        <input
          ref={form.fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={form.handleFileSelect}
        />
        {!form.uploadedUrl ? (
          <button
            onClick={() => form.fileInputRef.current?.click()}
            disabled={form.uploading}
            className="w-full border-2 border-dashed border-dc-teal/30 rounded-2xl p-6 text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/[0.03]"
          >
            {form.uploading ? (
              <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
            ) : (
              <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
            )}
            <p className="font-semibold text-sm text-dc-text">
              {form.uploading ? 'Uploading...' : 'Tap to upload photo or video'}
            </p>
            <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
          </button>
        ) : (
          <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
            {form.uploadedFileType?.startsWith('video/') ? (
              <div className="h-32 bg-dc-dark/10 flex items-center justify-center">
                <span className="text-3xl">🎬</span>
              </div>
            ) : (
              <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
            )}
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-dc-teal font-medium truncate">✓ {form.uploadedFileName}</span>
              <button onClick={form.removeUpload} className="text-dc-text-muted hover:text-dc-text">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Post link (optional) */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Post Link <span className="text-dc-text-muted/60">(optional)</span>
        </label>
        <div className="relative">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-text-muted" />
          <Input
            placeholder="Paste social media link..."
            value={form.postUrl}
            onChange={(e) => form.setPostUrl(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
        {form.detectedPlatform && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs font-semibold text-dc-teal">
              {PLATFORM_LABELS[form.detectedPlatform] ?? form.detectedPlatform} detected
            </span>
            <span className="text-[10px] text-dc-text-muted">· from link</span>
          </div>
        )}
        <p className="text-[10px] text-dc-text-muted/70 mt-1">
          Adds credibility — restaurants boost linked posts more often
        </p>
      </div>

      {/* Tag restaurant */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Tag Restaurant
        </label>
        <RestaurantTypeahead
          selectedOrg={form.selectedOrg}
          onSelect={form.setSelectedOrg}
          onClear={() => form.setSelectedOrg(null)}
        />
      </div>

      {/* Submit button */}
      <Button
        className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
        disabled={!form.canSubmit}
        onClick={form.handleSubmit}
      >
        {form.submitting ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
        ) : (
          'Submit'
        )}
      </Button>

      {/* Quick tip */}
      <div className="bg-dc-pink/10 border border-dc-teal/10 rounded-xl p-3">
        <p className="text-[11px] text-dc-pink-accent font-semibold mb-1">⚡ Quick tip</p>
        <p className="text-[11px] text-dc-text-muted leading-relaxed">
          When a restaurant boosts your post, it gets cross-posted to all your connected platforms — and theirs.
          More platforms connected = more reach = higher boost value.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dragonshare/DragonShareInlineForm.tsx
git commit -m "feat(dragonshare): add DragonShareInlineForm for desktop side-by-side layout"
```

---

## Task 6: Redesign `CreatorDragonShare` Page with Side-by-Side Layout

**Files:**
- Modify: `src/pages/CreatorDragonShare.tsx`

Add side-by-side layout on `lg:` breakpoint. Desktop shows inline form on left, post history on right. Mobile keeps the current single-column layout with bottom sheet. Read `restaurant` query param to pre-fill the form when returning from browse.

- [ ] **Step 1: Rewrite the page component**

```typescript
// src/pages/CreatorDragonShare.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { safeUrl } from '@/lib/safeUrl';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useCreatorDragonSharePosts } from '@/hooks/useDragonShare';
import { DragonShareSubmitSheet } from '@/components/dragonshare/DragonShareSubmitSheet';
import { DragonShareInlineForm } from '@/components/dragonshare/DragonShareInlineForm';
import { DragonShareHowItWorks } from '@/components/dragonshare/DragonShareHowItWorks';
import { DragonShareQuickTip } from '@/components/dragonshare/DragonShareQuickTip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Clock, CheckCircle } from 'lucide-react';
import type { DragonSharePostWithRelations } from '@/types/dragonshare';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { useResolvedLogoUrl, useSignedUrl } from '@/hooks/useSignedUrl';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

type Tab = 'submitted' | 'boosted' | 'expired';

type ActivePostStatus = 'verified' | 'rejected' | 'expired';

const statusConfig: Record<ActivePostStatus, { label: string; className: string; icon: React.ElementType }> = {
  verified: { label: 'Verified', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: Clock },
  expired: { label: 'Expired', className: 'bg-dc-teal/10 text-dc-teal', icon: Clock },
};

function usePreselectedOrg() {
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant');

  const { data: org } = useQuery({
    queryKey: ['preselected-org', restaurantId],
    queryFn: async (): Promise<RestaurantSearchResult | null> => {
      if (!restaurantId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, logo_url, org_type, org_units ( address, brand_category )')
        .eq('id', restaurantId)
        .eq('org_units.is_primary', true)
        .maybeSingle();
      if (error || !data) return null;
      const unit = Array.isArray(data.org_units) ? data.org_units[0] : data.org_units;
      return {
        id: data.id,
        name: data.name,
        logo_url: data.logo_url,
        org_type: data.org_type,
        address: unit?.address ?? null,
        brand_category: unit?.brand_category ?? null,
      };
    },
    enabled: !!restaurantId,
  });

  useEffect(() => {
    if (restaurantId && org) {
      const next = new URLSearchParams(searchParams);
      next.delete('restaurant');
      setSearchParams(next, { replace: true });
    }
  }, [org, restaurantId, searchParams, setSearchParams]);

  return org ?? null;
}

const CreatorDragonShare: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('submitted');
  const [submitOpen, setSubmitOpen] = useState(false);
  const { data: posts, isLoading } = useCreatorDragonSharePosts();
  const preselectedOrg = usePreselectedOrg();

  // Auto-open sheet on mobile when returning from browse with preselected org
  useEffect(() => {
    if (preselectedOrg) setSubmitOpen(true);
  }, [preselectedOrg]);

  const filteredPosts = (posts ?? []).filter((p) => {
    if (activeTab === 'submitted') return p.status === 'verified';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return p.status === 'expired' || p.boost_status === 'expired';
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'submitted', label: 'Submitted', count: (posts ?? []).filter((p) => p.status === 'verified').length },
    { key: 'boosted', label: 'Boosted', count: (posts ?? []).filter((p) => p.boost_status === 'boosted').length },
    { key: 'expired', label: 'Expired', count: (posts ?? []).filter((p) => p.status === 'expired' || p.boost_status === 'expired').length },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <PrerequisiteGate feature="use DragonShare">
        <div className="space-y-6 pt-4">
          {/* Page header */}
          <div className="rounded-2xl bg-gradient-to-br from-dc-teal/10 to-pink-50 border border-dc-teal/15 p-5">
            <h1 className="text-2xl font-bold tracking-tight">DragonShare</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submit your organic posts and earn when restaurants boost them
            </p>
            {/* Mobile-only: show Share Content button */}
            <div className="flex items-center justify-end mt-3 lg:hidden">
              <Button
                onClick={() => setSubmitOpen(true)}
                className="rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold px-6"
              >
                + Share Content
              </Button>
            </div>
          </div>

          {/* Desktop: side-by-side / Mobile: single column */}
          <div className="flex flex-col lg:flex-row lg:gap-6 lg:items-start">
            {/* Left: Inline form (desktop only) */}
            <div className="hidden lg:block lg:w-[440px] lg:flex-shrink-0">
              <DragonShareInlineForm preselectedOrg={preselectedOrg} />
            </div>

            {/* Right: Post history */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-dc-teal-btn text-white'
                        : 'bg-dc-teal/10 text-dc-text-muted hover:bg-dc-teal/20'
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
                    )}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-dc-teal/10" />
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="space-y-4">
                  <DragonShareHowItWorks role="creator" />
                  <DragonShareQuickTip role="creator" />
                </div>
              ) : (
                <div className="space-y-4">
                  <DragonShareHowItWorks role="creator" />
                  <div className="grid gap-4 lg:grid-cols-2">
                    {filteredPosts.map((post) => (
                      <CreatorPostCard key={post.id} post={post} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile-only: bottom sheet */}
        <div className="lg:hidden">
          <DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} />
        </div>
      </PrerequisiteGate>
    </DashboardLayout>
  );
};

function CreatorPostCard({ post }: { post: DragonSharePostWithRelations }) {
  const resolvedLogoUrl = useResolvedLogoUrl(post.target_org?.logo_url);
  const contentImageUrl = useSignedUrl('dragonshare-content', post.content_file_path);

  const status = post.status as ActivePostStatus;
  const config = statusConfig[status] ?? statusConfig.verified;
  const StatusIcon = config.icon;
  const boost = post.boosts?.[0];

  const platformLabel = post.platform ?? 'direct upload';

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      {contentImageUrl && (
        <img
          src={contentImageUrl}
          alt="Submitted content"
          className="w-full rounded-xl object-cover max-h-48"
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{platformLabel}</span>
          <span className="text-xs text-muted-foreground capitalize">{post.content_type}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </div>
      </div>

      {post.caption && (
        <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {resolvedLogoUrl && (
            <img src={resolvedLogoUrl} alt="Brand logo" className="h-5 w-5 rounded-full ring-2 ring-teal-400" />
          )}
          <span className="text-muted-foreground">{post.target_org?.name ?? 'Unknown org'}</span>
        </div>
        <div className="flex items-center gap-3">
          {boost && boost.status === 'transferred' && (
            <span className="font-semibold text-teal-600">
              +${(boost.creator_payout_cents / 100).toFixed(0)}
            </span>
          )}
          {post.post_url && (
            <a
              href={safeUrl(post.post_url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreatorDragonShare;
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds. At this point the core desktop layout and typeahead are functional.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx
git commit -m "feat(dragonshare): redesign page with side-by-side desktop layout and query param pre-fill"
```

---

## Task 7: Create `RestaurantCard` Component

**Files:**
- Create: `src/components/dragonshare/RestaurantCard.tsx`

Card component for the restaurant browse grid. Shows logo/initial, name, location, cuisine badge, and "Select" action.

- [ ] **Step 1: Create the component**

```typescript
// src/components/dragonshare/RestaurantCard.tsx
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { MapPin } from 'lucide-react';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

interface Props {
  restaurant: RestaurantSearchResult;
  onSelect: (restaurant: RestaurantSearchResult) => void;
}

const GRADIENT_COLORS = [
  'from-teal-50 to-emerald-50',
  'from-pink-50 to-fuchsia-50',
  'from-amber-50 to-yellow-50',
  'from-violet-50 to-indigo-50',
  'from-orange-50 to-amber-50',
  'from-sky-50 to-blue-50',
];

function getGradient(name: string): string {
  const index = name.charCodeAt(0) % GRADIENT_COLORS.length;
  return GRADIENT_COLORS[index];
}

export function RestaurantCard({ restaurant, onSelect }: Props) {
  const resolvedLogo = useResolvedLogoUrl(restaurant.logo_url);
  const gradient = getGradient(restaurant.name);

  return (
    <button
      onClick={() => onSelect(restaurant)}
      className="text-left bg-white rounded-2xl overflow-hidden border border-dc-teal/10 hover:border-dc-teal/30 hover:shadow-md transition-all group"
    >
      {/* Header with gradient + logo */}
      <div className={`relative h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        {resolvedLogo ? (
          <img src={resolvedLogo} alt="" className="h-14 w-14 rounded-xl object-cover shadow-sm" />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-dc-teal/20 flex items-center justify-center text-2xl font-bold text-dc-teal">
            {restaurant.name.charAt(0).toUpperCase()}
          </div>
        )}
        {restaurant.brand_category && (
          <span className="absolute top-2 right-2 text-[10px] bg-dc-teal/15 text-dc-teal-btn px-2.5 py-0.5 rounded-full font-semibold capitalize">
            {restaurant.brand_category}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5">
        <h3 className="text-sm font-bold text-dc-text truncate">{restaurant.name}</h3>
        {restaurant.address && (
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3 text-dc-text-muted flex-shrink-0" />
            <span className="text-xs text-dc-text-muted truncate">{restaurant.address}</span>
          </div>
        )}
        <div className="flex items-center justify-end mt-2.5">
          <span className="text-xs font-semibold text-dc-teal group-hover:text-dc-teal-dark transition-colors">
            Select &rarr;
          </span>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dragonshare/RestaurantCard.tsx
git commit -m "feat(dragonshare): add RestaurantCard component for browse grid"
```

---

## Task 8: Create `useRestaurantBrowse` Hook

**Files:**
- Create: `src/hooks/useRestaurantBrowse.ts`

Manages browse page state: search term, cuisine filter, location filter, and fetches restaurants with those filters applied. Handles pagination.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useRestaurantBrowse.ts
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

export interface BrowseFilters {
  search: string;
  cuisine: string | null;
}

export function useRestaurantBrowse() {
  const [filters, setFilters] = useState<BrowseFilters>({ search: '', cuisine: null });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['restaurant-browse', debouncedSearch, filters.cuisine],
    queryFn: async (): Promise<RestaurantSearchResult[]> => {
      let query = supabase
        .from('organizations')
        .select('id, name, logo_url, org_type, org_units ( address, brand_category )')
        .is('deleted_at', null)
        .eq('org_units.is_primary', true)
        .limit(30);

      if (debouncedSearch.trim()) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results: RestaurantSearchResult[] = (data ?? []).map((org) => {
        const unit = Array.isArray(org.org_units) ? org.org_units[0] : org.org_units;
        return {
          id: org.id,
          name: org.name,
          logo_url: org.logo_url,
          org_type: org.org_type,
          address: unit?.address ?? null,
          brand_category: unit?.brand_category ?? null,
        };
      });

      if (filters.cuisine) {
        results = results.filter(
          (r) => r.brand_category?.toLowerCase() === filters.cuisine!.toLowerCase()
        );
      }

      return results;
    },
    staleTime: 30_000,
  });

  const { data: cuisines } = useQuery({
    queryKey: ['restaurant-cuisines'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('org_units')
        .select('brand_category')
        .eq('is_primary', true)
        .not('brand_category', 'is', null);
      if (error) throw error;
      const unique = [...new Set((data ?? []).map((u) => u.brand_category!).filter(Boolean))];
      return unique.sort();
    },
    staleTime: 60_000,
  });

  function setSearch(search: string) {
    setFilters((prev) => ({ ...prev, search }));
  }

  function setCuisine(cuisine: string | null) {
    setFilters((prev) => ({ ...prev, cuisine }));
  }

  function resetFilters() {
    setFilters({ search: '', cuisine: null });
  }

  return {
    restaurants: restaurants ?? [],
    cuisines: cuisines ?? [],
    isLoading,
    filters,
    setSearch,
    setCuisine,
    resetFilters,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRestaurantBrowse.ts
git commit -m "feat(dragonshare): add useRestaurantBrowse hook with cuisine and search filters"
```

---

## Task 9: Create `RestaurantBrowseHeader` Component

**Files:**
- Create: `src/components/dragonshare/RestaurantBrowseHeader.tsx`

Search bar + cuisine filter pills + result count. Follows the same pattern as `CreatorBrowseHeader.tsx`.

- [ ] **Step 1: Create the component**

```typescript
// src/components/dragonshare/RestaurantBrowseHeader.tsx
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  cuisines: string[];
  activeCuisine: string | null;
  onCuisineChange: (cuisine: string | null) => void;
  resultCount: number;
}

export function RestaurantBrowseHeader({
  search,
  onSearchChange,
  cuisines,
  activeCuisine,
  onCuisineChange,
  resultCount,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-text-muted" />
        <Input
          placeholder="Search by name or location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-full pl-10 h-11 border-dc-teal/20 focus-visible:ring-dc-teal/40"
        />
      </div>

      {/* Cuisine pills + result count */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onCuisineChange(null)}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            !activeCuisine
              ? 'bg-dc-teal-btn text-white'
              : 'bg-dc-teal/10 text-dc-text-muted hover:bg-dc-teal/20'
          }`}
        >
          All
        </button>
        {cuisines.map((cuisine) => (
          <button
            key={cuisine}
            onClick={() => onCuisineChange(activeCuisine === cuisine ? null : cuisine)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors capitalize ${
              activeCuisine === cuisine
                ? 'bg-dc-teal-btn text-white'
                : 'bg-dc-teal/10 text-dc-text-muted hover:bg-dc-teal/20'
            }`}
          >
            {cuisine}
          </button>
        ))}

        <div className="flex-1" />
        <span className="text-xs text-dc-text-muted">
          {resultCount} restaurant{resultCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dragonshare/RestaurantBrowseHeader.tsx
git commit -m "feat(dragonshare): add RestaurantBrowseHeader with search and cuisine pills"
```

---

## Task 10: Create `DragonShareBrowseRestaurants` Page + Add Route

**Files:**
- Create: `src/pages/DragonShareBrowseRestaurants.tsx`
- Modify: `src/App.tsx` (add route + lazy import)

The full-page restaurant browse experience. Uses `useRestaurantBrowse` hook, renders `RestaurantBrowseHeader` + grid of `RestaurantCard` components.

- [ ] **Step 1: Create the page component**

```typescript
// src/pages/DragonShareBrowseRestaurants.tsx
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { useRestaurantBrowse } from '@/hooks/useRestaurantBrowse';
import { RestaurantBrowseHeader } from '@/components/dragonshare/RestaurantBrowseHeader';
import { RestaurantCard } from '@/components/dragonshare/RestaurantCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

const DragonShareBrowseRestaurants: React.FC = () => {
  const navigate = useNavigate();
  const { restaurants, cuisines, isLoading, filters, setSearch, setCuisine, resetFilters } =
    useRestaurantBrowse();

  function handleSelect(restaurant: RestaurantSearchResult) {
    navigate(`/dashboard/creator/dragonshare?restaurant=${restaurant.id}`);
  }

  return (
    <DashboardLayout userRole="content_creator">
      <PrerequisiteGate feature="use DragonShare">
        <div className="space-y-5 pt-4">
          {/* Back link + page header */}
          <div>
            <button
              onClick={() => navigate('/dashboard/creator/dragonshare')}
              className="flex items-center gap-2 text-sm font-medium text-dc-teal hover:text-dc-teal-dark transition-colors mb-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to DragonShare
            </button>
            <h1 className="text-2xl font-bold tracking-tight">Find Restaurants</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse restaurants near you to tag in your content
            </p>
          </div>

          {/* Search + filters */}
          <RestaurantBrowseHeader
            search={filters.search}
            onSearchChange={setSearch}
            cuisines={cuisines}
            activeCuisine={filters.cuisine}
            onCuisineChange={setCuisine}
            resultCount={restaurants.length}
          />

          {/* Restaurant grid */}
          {isLoading ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-dc-teal/10" />
              ))}
            </div>
          ) : restaurants.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-dc-text-muted">
                No restaurants found matching your search.
              </p>
              <Button
                variant="outline"
                onClick={resetFilters}
                className="rounded-full"
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </PrerequisiteGate>
    </DashboardLayout>
  );
};

export default DragonShareBrowseRestaurants;
```

- [ ] **Step 2: Add lazy import and route to App.tsx**

In `src/App.tsx`, add the lazy import near line 83 (after `CreatorDragonShare`):

```typescript
const DragonShareBrowseRestaurants = lazy(() => import("./pages/DragonShareBrowseRestaurants"));
```

Add the route near line 271 (after the existing `/dashboard/creator/dragonshare` route). The browse route MUST come before the base dragonshare route if using exact matching, but since React Router v6 uses best-match, just place it adjacent:

```typescript
<Route path="/dashboard/creator/dragonshare/browse" element={<ProtectedRoute><DragonShareBrowseRestaurants /></ProtectedRoute>} />
```

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DragonShareBrowseRestaurants.tsx src/App.tsx
git commit -m "feat(dragonshare): add restaurant browse page with grid, filters, and route"
```

---

## Task 11: Final Build Verification + Manual Testing

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build with no errors or warnings related to dragonshare.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint 2>&1 | head -30`
Expected: No lint errors in the new/modified files. Fix any that appear (likely `no-console` or unused imports).

- [ ] **Step 4: Manual testing checklist**

Start the dev server (`npm run dev`) and test as the creator account (`damewillie@gmail.com` / `Pdi@mondz1`):

**Desktop (viewport > 1024px):**
- [ ] DragonShare page shows side-by-side layout (form left, history right)
- [ ] Submit form is sticky when scrolling
- [ ] Typing in "Tag Restaurant" shows typeahead dropdown with results
- [ ] Clicking a result shows the selected chip with × to clear
- [ ] "Browse all restaurants →" link navigates to browse page
- [ ] Browse page shows restaurant cards in 3-column grid
- [ ] Cuisine pills filter the grid
- [ ] Search bar filters by name
- [ ] Clicking "Select" on a card returns to DragonShare with restaurant pre-filled
- [ ] Submitting a post works end-to-end

**Mobile (viewport < 1024px):**
- [ ] DragonShare page shows single column with "+ Share Content" button
- [ ] Clicking button opens bottom sheet
- [ ] Bottom sheet has typeahead search (not the old OrgPickerButton grid)
- [ ] "Browse all restaurants →" link works from the sheet
- [ ] Returning from browse auto-opens sheet with restaurant pre-filled

- [ ] **Step 5: Commit any fixes**

If any issues found during testing, fix and commit each separately.

---

## Deferred from This Plan

**`RestaurantBrowseFilters.tsx` (side sheet with location filters):** The spec lists this as a file to create — a side sheet accessible from a "Filters" button on the browse page, with city and postal code inputs matching the `AdvancedCreatorFilters` pattern. This plan defers it because the search bar already covers name filtering and the cuisine pills cover category filtering. A dedicated location filter sheet adds value once there are enough restaurants across multiple cities to warrant it. Add it in a follow-up when the restaurant count justifies the extra UX surface.
