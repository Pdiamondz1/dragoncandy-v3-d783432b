import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Package as PackageIcon } from 'lucide-react';
import { PACKAGES_ENABLED } from '@/lib/featureConfig';
import { useCreatorPackages } from '@/hooks/packages/useCreatorPackages';
import { useCreatorStorefront } from '@/hooks/packages/useCreatorStorefront';
import { PackageCard } from '@/components/packages/PackageCard';
import { PackageTemplatePicker } from '@/components/packages/PackageTemplatePicker';
import { PackageEditorSheet } from '@/components/packages/PackageEditorSheet';
import type { CreatorPackage, PackageTemplate } from '@/types/packages';

type EditorState =
  | { mode: 'create'; template: PackageTemplate }
  | { mode: 'edit'; pkg: CreatorPackage }
  | null;

const CreatorPackages = () => {
  // Hooks run unconditionally (rules of hooks); the flag is a module constant so the guard below is stable.
  const { packages, isLoading } = useCreatorPackages();
  const { slug, isPublic } = useCreatorStorefront();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);

  // Feature-flagged: hidden until the v1a package migrations are applied + the money-rail functions deployed.
  // (Also gated at the route in App.tsx; this is a defensive redirect if reached directly.)
  if (!PACKAGES_ENABLED) return <Navigate to="/dashboard/creator" replace />;

  // The public buyer page at /p/:creatorSlug/:packageSlug lands in v1c; PACKAGES_ENABLED must stay off until
  // then (see featureConfig) so this link is never shared before its destination exists.
  const shareUrlFor = (pkg: CreatorPackage): string | null =>
    slug ? `${window.location.origin}/p/${slug}/${pkg.slug}` : null;

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen w-full max-w-full overflow-x-hidden md:mx-auto md:max-w-3xl">
        <div className="px-4 py-6 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Your Packages</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sell your content services as fixed-price packages. Publish one, get a link, and send it to
                clients you already know — you keep 90% and we handle the payment safely.
              </p>
            </div>
            <Button onClick={() => setPickerOpen(true)} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" /> New package
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}

            {!isLoading && packages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <PackageIcon className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-3 font-semibold text-foreground">Create your first package</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Pick a format, set your price, and Donny will draft the rest. In a couple of minutes you’ll
                  have a link you can send to a restaurant to get booked.
                </p>
                <Button onClick={() => setPickerOpen(true)} className="mt-4 gap-1.5">
                  <Plus className="h-4 w-4" /> New package
                </Button>
              </div>
            )}

            {!isLoading &&
              packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  shareUrl={shareUrlFor(pkg)}
                  isProfilePublic={isPublic}
                  onEdit={(p) => setEditor({ mode: 'edit', pkg: p })}
                />
              ))}
          </div>
        </div>
      </div>

      <PackageTemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(template) => {
          setPickerOpen(false);
          setEditor({ mode: 'create', template });
        }}
      />

      {editor?.mode === 'create' && (
        <PackageEditorSheet
          open
          onOpenChange={(o) => !o && setEditor(null)}
          mode="create"
          template={editor.template}
        />
      )}
      {editor?.mode === 'edit' && (
        <PackageEditorSheet open onOpenChange={(o) => !o && setEditor(null)} mode="edit" pkg={editor.pkg} />
      )}
    </DashboardLayout>
  );
};

export default CreatorPackages;
