import { useState } from 'react';
import { MapPin, Tag, MoreVertical, Plus, Building2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits, useMyOrgRole, useDeleteOrgUnit } from '@/hooks/useOrgData';
import { AddEditUnitModal } from '@/components/org/AddEditUnitModal';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUnitInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function getUnitSubtext(unit: OrgUnit): string | null {
  if (unit.unit_type === 'location') return unit.address ?? null;
  return unit.website_url ?? null;
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function UnitCardSkeleton() {
  return (
    <Card className="border border-teal-300 rounded-2xl">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded" />
          <div className="h-3 w-3/4 bg-gray-200 animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Unit card ─────────────────────────────────────────────────────────────────

interface UnitCardProps {
  unit: OrgUnit;
  canManage: boolean;
  isLastUnit: boolean;
  onEdit: (unit: OrgUnit) => void;
  onDelete: (unit: OrgUnit) => void;
}

function UnitCard({ unit, canManage, isLastUnit, onEdit, onDelete }: UnitCardProps) {
  const resolvedLogoUrl = useResolvedLogoUrl(unit.logo_url);
  const [logoError, setLogoError] = useState(false);
  const subtext = getUnitSubtext(unit);
  const Icon = unit.unit_type === 'location' ? MapPin : Tag;

  return (
    <Card className="border border-teal-300 rounded-2xl hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-4 p-4">
        {resolvedLogoUrl && !logoError ? (
          <img
            src={resolvedLogoUrl}
            alt={unit.name}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-teal-400 flex-shrink-0"
            loading="lazy"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-teal-100 ring-2 ring-teal-400 flex items-center justify-center flex-shrink-0">
            <span className="text-teal-700 font-bold text-lg">{getUnitInitial(unit.name)}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{unit.name}</span>
            {unit.is_primary && (
              <Badge className="bg-teal-100 text-teal-700 border border-teal-300 text-xs rounded-full">
                Primary
              </Badge>
            )}
          </div>
          {subtext && (
            <p className="text-sm text-gray-500 truncate flex items-center gap-1 mt-0.5">
              <Icon className="h-3 w-3 flex-shrink-0" />
              {subtext}
            </p>
          )}
        </div>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-gray-700 flex-shrink-0"
                aria-label="Unit options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(unit)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(unit)}
                disabled={isLastUnit}
                className="text-red-600 focus:text-red-600 disabled:opacity-40"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrgUnitsPage() {
  const { profile, activeOrg } = useAuth();
  const { toast } = useToast();

  const { data: units = [], isLoading } = useOrgUnits(activeOrg?.id);
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const deleteUnit = useDeleteOrgUnit();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null>(null);

  const canManage = myRole?.role === 'owner' || myRole?.role === 'admin';
  const isRestaurant = activeOrg?.org_type === 'restaurant';
  const unitLabel = isRestaurant ? 'Location' : 'Product';
  const pluralLabel = isRestaurant ? 'Locations' : 'Products';
  const headingTitle = `Your ${pluralLabel}`;
  const singleUnitHint = isRestaurant
    ? 'Add another location to manage multiple stores'
    : 'Add another product to manage multiple brands';

  function openAdd() {
    setEditingUnit(null);
    setModalOpen(true);
  }

  function openEdit(unit: OrgUnit) {
    setEditingUnit(unit);
    setModalOpen(true);
  }

  async function handleDelete(unit: OrgUnit) {
    if (units.length <= 1) {
      toast({ title: `Cannot delete the last ${unitLabel.toLowerCase()}`, variant: 'destructive' });
      return;
    }
    try {
      await deleteUnit.mutateAsync(unit.id);
      toast({ title: `${unitLabel} deleted`, description: `"${unit.name}" has been removed.` });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }

  const userRole = profile?.role ?? 'business_client';

  return (
    <DashboardLayout userRole={userRole}>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{headingTitle}</h1>
              {activeOrg?.name && (
                <p className="text-sm text-gray-500 mt-0.5">{activeOrg.name}</p>
              )}
            </div>
            {canManage && (
              <Button
                onClick={openAdd}
                className="rounded-full bg-teal-500 text-white hover:bg-teal-600 gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </PageHeader>
        <div className="px-4 py-6 space-y-6">
        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-3">
            <UnitCardSkeleton />
            <UnitCardSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && units.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Building2 className="h-14 w-14 text-teal-300" />
            <div>
              <p className="text-lg font-semibold text-gray-700">No {pluralLabel.toLowerCase()} yet</p>
              <p className="text-sm text-gray-500 mt-1">
                {canManage
                  ? `Add your first ${unitLabel.toLowerCase()} to get started.`
                  : `No ${pluralLabel.toLowerCase()} have been added yet.`}
              </p>
            </div>
            {canManage && (
              <Button
                onClick={openAdd}
                className="rounded-full bg-teal-500 text-white hover:bg-teal-600 gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add {unitLabel}
              </Button>
            )}
          </div>
        )}

        {/* Unit cards */}
        {!isLoading && units.length > 0 && (
          <div className="space-y-3">
            {units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                canManage={canManage}
                isLastUnit={units.length <= 1}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}

            {/* Single-unit hint */}
            {units.length === 1 && canManage && (
              <p className="text-xs text-gray-400 text-center pt-1">{singleUnitHint}</p>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {activeOrg && (
        <AddEditUnitModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          orgId={activeOrg.id}
          unitType={isRestaurant ? 'location' : 'product'}
          editUnit={editingUnit}
        />
      )}
    </DashboardLayout>
  );
}
