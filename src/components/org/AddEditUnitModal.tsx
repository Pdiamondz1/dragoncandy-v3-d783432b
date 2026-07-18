import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateOrgUnit, useUpdateOrgUnit, useOrgUnits } from '@/hooks/useOrgData';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org';

export interface AddEditUnitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  unitType: 'location' | 'product';
  editUnit?: OrgUnit | null;
}

interface FormState {
  name: string;
  secondaryField: string;
  isPrimary: boolean;
  cloneFromId: string;
}

function buildInitialForm(editUnit?: OrgUnit | null): FormState {
  if (!editUnit) return { name: '', secondaryField: '', isPrimary: false, cloneFromId: '' };
  const secondaryField = editUnit.unit_type === 'location'
    ? (editUnit.address ?? '')
    : (editUnit.website_url ?? '');
  return { name: editUnit.name, secondaryField, isPrimary: editUnit.is_primary, cloneFromId: '' };
}

export function AddEditUnitModal({
  open,
  onOpenChange,
  orgId,
  unitType,
  editUnit,
}: AddEditUnitModalProps) {
  const { toast } = useToast();
  const { switchOrgUnit } = useAuth();
  const navigate = useNavigate();
  const createUnit = useCreateOrgUnit(orgId);
  const updateUnit = useUpdateOrgUnit();
  const { data: existingUnits } = useOrgUnits(orgId);

  const isLocation = unitType === 'location';
  const [form, setForm] = useState<FormState>(() => buildInitialForm(editUnit));

  useEffect(() => {
    setForm(buildInitialForm(editUnit));
  }, [editUnit, open]);

  const isEditing = !!editUnit;
  const isSaving = createUnit.isPending || updateUnit.isPending;
  const canSave = form.name.trim().length > 0 && !isSaving;

  const secondaryLabel = unitType === 'location' ? 'Address' : 'Website URL';
  const secondaryPlaceholder =
    unitType === 'location' ? '123 Main St, City, State' : 'https://example.com';

  function handleField(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    const name = form.name.trim();
    const secondary = form.secondaryField.trim() || null;

    try {
      const fieldPayload = isLocation
        ? { address: secondary }
        : { website_url: secondary };

      if (isEditing) {
        await updateUnit.mutateAsync({
          id: editUnit!.id,
          name,
          is_primary: form.isPrimary,
          ...fieldPayload,
        });
      } else {
        const cloneSource = form.cloneFromId
          ? existingUnits?.find(u => u.id === form.cloneFromId)
          : null;

        const cloneFields = cloneSource
          ? {
              description: cloneSource.description,
              brand_category: cloneSource.brand_category,
              logo_url: cloneSource.logo_url,
              sample_content_urls: cloneSource.sample_content_urls,
              show_parent_brand: cloneSource.show_parent_brand,
              instagram_url: cloneSource.instagram_url,
              tiktok_url: cloneSource.tiktok_url,
              youtube_url: cloneSource.youtube_url,
              facebook_url: cloneSource.facebook_url,
              linkedin_url: cloneSource.linkedin_url,
              x_url: cloneSource.x_url,
              other_social_url: cloneSource.other_social_url,
            }
          : {};

        const newUnit = await createUnit.mutateAsync({
          name,
          unit_type: unitType,
          is_primary: form.isPrimary,
          ...fieldPayload,
          ...cloneFields,
        });
        await switchOrgUnit(newUnit.id);
        toast({ title: 'Location created', description: `"${name}" is now active. Complete your setup in Settings.` });
        onOpenChange(false);
        navigate('/dashboard/business/settings');
        return;
      }
      toast({
        title: 'Unit updated',
        description: `"${name}" has been updated successfully.`,
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      toast({
        title: 'Failed to save location',
        description: message,
        variant: 'destructive',
      });
    }
  }

  const title = `${isEditing ? 'Edit' : 'Add'} ${unitType === 'location' ? 'Location' : 'Product'}`;
  const cloneableUnits = existingUnits?.filter(u => u.id !== editUnit?.id) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-name">Name *</Label>
            <Input
              id="unit-name"
              placeholder={unitType === 'location' ? 'Downtown Branch' : 'Product Name'}
              value={form.name}
              onChange={(e) => handleField('name', e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-secondary">{secondaryLabel}</Label>
            <Input
              id="unit-secondary"
              placeholder={secondaryPlaceholder}
              value={form.secondaryField}
              onChange={(e) => handleField('secondaryField', e.target.value)}
              disabled={isSaving}
            />
          </div>

          {!isEditing && cloneableUnits.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clone-from">Clone profile from</Label>
              <Select
                value={form.cloneFromId}
                onValueChange={(value) => handleField('cloneFromId', value === 'none' ? '' : value)}
              >
                <SelectTrigger id="clone-from" className="mt-1">
                  <SelectValue placeholder="Start fresh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Start fresh</SelectItem>
                  {cloneableUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Copies description, logo, social links, and content. Stripe and connected accounts are not cloned.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-dc-teal/15 px-4 py-3">
            <Label htmlFor="unit-primary" className="cursor-pointer text-sm font-medium">
              Set as default
            </Label>
            <Switch
              id="unit-primary"
              checked={form.isPrimary}
              onCheckedChange={(checked) => handleField('isPrimary', checked)}
              disabled={isSaving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            variant="dc-primary"
            className="rounded-full disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
