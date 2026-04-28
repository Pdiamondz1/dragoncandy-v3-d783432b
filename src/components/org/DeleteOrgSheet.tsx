import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface DeleteOrgSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteOrgSheet({ open, onOpenChange }: DeleteOrgSheetProps) {
  const { activeOrg, signOut } = useAuth();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const orgName = activeOrg?.name ?? '';
  const confirmed = confirmText === orgName;

  const handleDelete = async () => {
    if (!confirmed || !activeOrg) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('request_org_deletion', { p_org_id: activeOrg.id });
      if (error) throw error;
      toast({ title: 'Organization scheduled for deletion', description: 'You have 30 days to restore it. Check your email.' });
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
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <SheetTitle>Delete {orgName}?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            This will soft-delete your organization. You have <strong>30 days</strong> to restore it.
            After that, all team data, campaigns in flight, and PII will be permanently purged.
            Delivered campaign content stays with the creators and brands who licensed it.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type <strong>{orgName}</strong> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
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
            disabled={!confirmed || deleting}
            className="flex-1 rounded-full"
          >
            {deleting ? 'Deleting…' : 'Delete organization'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
