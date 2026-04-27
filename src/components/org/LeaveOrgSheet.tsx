import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface LeaveOrgSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeaveOrgSheet({ open, onOpenChange }: LeaveOrgSheetProps) {
  const { user, activeOrg } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    if (!user || !activeOrg) return;
    setLeaving(true);
    try {
      const { error } = await supabase
        .from('org_members')
        .update({ invitation_status: 'suspended' })
        .eq('org_id', activeOrg.id)
        .eq('user_id', user.id);
      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ org_id: null, active_org_unit_id: null })
        .eq('id', user.id);

      toast({ title: `You left ${activeOrg.name}` });
      navigate('/profile/setup', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setLeaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-500" />
            <SheetTitle>Leave {activeOrg?.name}?</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            You'll lose access to all campaigns, team data, and analytics for this organization.
            You can be re-invited later.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className="flex-row gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaving}
            className="flex-1 rounded-full"
          >
            {leaving ? 'Leaving...' : 'Leave organization'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
