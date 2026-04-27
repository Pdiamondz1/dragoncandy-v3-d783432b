import { useState, useEffect } from 'react';
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
import { useCreateOrgUnit, useUpdateOrgUnit } from '@/hooks/useOrgData';
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
  secondaryField: string; // address for location, website_url for product
  isPrimary: boolean;
}

function buildInitialForm(editUnit?: OrgUnit | null): FormState {
  if (!editUnit) return { name: '', secondaryField: '', isPrimary: false };
  const secondaryField = editUnit.unit_type === 'location'
    ? (editUnit.address ?? '')
    : (editUnit.website_url ?? '');
  return { name: editUnit.name, secondaryField, isPrimary: editUnit.is_primary };
}

export function AddEditUnitModal({
  open,
  onOpenChange,
  orgId,
  unitType,
  editUnit,
}: AddEditUnitModalProps) {
  const { toast } = useToast();
  const createUnit = useCreateOrgUnit(orgId);
  const updateUnit = useUpdateOrgUnit();

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
      if (isEditing) {
        await updateUnit.mutateAsync({
          id: editUnit!.id,
          name,
          is_primary: form.isPrimary,
          description: secondary,
        });
      } else {
        await createUnit.mutateAsync({
          name,
          description: secondary,
          is_primary: form.isPrimary,
        });
      }
      toast({
        title: isEditing ? 'Unit updated' : 'Unit created',
        description: `"${name}" has been ${isEditing ? 'updated' : 'added'} successfully.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Something went wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }

  const title = `${isEditing ? 'Edit' : 'Add'} ${unitType === 'location' ? 'Location' : 'Product'}`;

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

          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
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
            className="rounded-full bg-teal-400 text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
