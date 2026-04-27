import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skull } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface DeleteUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrgMembership {
  org_id: string;
  organizations: { name: string } | null;
}

export function DeleteUserSheet({ open, onOpenChange }: DeleteUserSheetProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const confirmed = confirmText === 'DELETE';

  const checkOwnedOrgs = async (): Promise<string | null> => {
    const { data: ownedOrgs } = await supabase
      .from('org_members')
      .select('org_id, organizations!inner(name)')
      .eq('user_id', user!.id)
      .eq('role', 'owner')
      .eq('invitation_status', 'active');

    if (!ownedOrgs || ownedOrgs.length === 0) return null;

    for (const membership of ownedOrgs as unknown as OrgMembership[]) {
      const { count } = await supabase
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', membership.org_id)
        .eq('invitation_status', 'active')
        .neq('user_id', user!.id);

      if (count && count > 0) {
        return `Transfer ownership of "${membership.organizations?.name}" or delete it first.`;
      }
    }
    return null;
  };

  const softDeleteProfile = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: 'Deleted User',
        avatar_url: null,
        org_id: null,
        active_org_unit_id: null,
      })
      .eq('id', user!.id);
    if (error) throw error;
  };

  const schedulePurge = async () => {
    await supabase
      .from('account_deletion_requests')
      .insert({
        requested_by: user!.id,
        target_type: 'user_self',
        target_id: user!.id,
        status: 'soft_deleted',
        reason_code: 'user_requested',
        soft_deleted_at: new Date().toISOString(),
        hard_purge_scheduled_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
  };

  const handleDelete = async () => {
    if (!confirmed || !user) return;
    setDeleting(true);

    try {
      const blockReason = await checkOwnedOrgs();
      if (blockReason) {
        setBlocked(blockReason);
        setDeleting(false);
        return;
      }

      await softDeleteProfile();
      await schedulePurge();

      toast({ title: 'Account scheduled for deletion', description: 'You have 30 days to restore it.' });
      await signOut();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <Skull className="h-5 w-5 text-red-500" />
            <SheetTitle>Delete your account?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            This deletes your DragonCandy login. Profiles, portfolio, messages, and payouts
            will be soft-deleted for 30 days then permanently purged.
            {blocked && (
              <span className="block mt-2 text-red-500 font-medium">{blocked}</span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type <strong>DELETE</strong> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmed || deleting || !!blocked}
            className="flex-1 rounded-full"
          >
            {deleting ? 'Deleting...' : 'Delete my account'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
