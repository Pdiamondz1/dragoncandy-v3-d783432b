import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useInviteMembers } from '@/hooks/useOrgMembers';
import { useAuth } from '@/hooks/useAuth';
import { SEAT_LIMITS } from '@/types/org';
import type { OrgRole } from '@/types/org';

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  myRole: OrgRole;
}

const ROLES: { value: OrgRole; label: string; description: string }[] = [
  { value: 'standard', label: 'Member', description: 'Can view and switch units' },
  { value: 'admin', label: 'Admin', description: 'Can manage units and invite members' },
  { value: 'owner', label: 'Owner', description: 'Full control including billing and deletion' },
];

export function InviteModal({ open, onOpenChange, orgId, myRole }: InviteModalProps) {
  const { activeOrg } = useAuth();
  const invite = useInviteMembers(orgId);
  const [emailText, setEmailText] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>('standard');
  const [results, setResults] = useState<{ email: string; status: string; error?: string }[] | null>(null);

  const tier = activeOrg?.subscription_tier ?? 'free';
  const limits = SEAT_LIMITS[tier];
  const currentSeats = activeOrg?.seat_count ?? 1;
  const maxSeats = limits.included + (limits.maxAdditional ?? 999);
  const seatsRemaining = maxSeats - currentSeats;

  const availableRoles = ROLES.filter((r) => {
    if (myRole === 'owner') return true;
    if (myRole === 'admin') return r.value !== 'owner';
    return false;
  });

  const emails = emailText
    .split(/[,\n]/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  const handleSend = async () => {
    if (emails.length === 0) return;

    if (tier === 'free' && emails.length > 0) {
      setResults([{ email: '', status: 'failed', error: 'Upgrade to Starter to add teammates.' }]);
      return;
    }

    if (emails.length > seatsRemaining) {
      setResults([{ email: '', status: 'failed', error: `Only ${seatsRemaining} seat(s) remaining on your ${tier} plan.` }]);
      return;
    }

    const res = await invite.mutateAsync({ emails, role: selectedRole });
    setResults(res);
  };

  const handleClose = () => {
    setEmailText('');
    setSelectedRole('standard');
    setResults(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammates</DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 py-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {r.status === 'sent' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="truncate">{r.email || 'Error'}</span>
                {r.error && <span className="text-xs text-red-500">— {r.error}</span>}
              </div>
            ))}
            <DialogFooter className="pt-2">
              <Button onClick={handleClose} className="rounded-full">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Email addresses</Label>
                <Textarea
                  placeholder="colleague@company.com, another@company.com"
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple emails with commas or new lines.
                  {seatsRemaining < 999 && ` ${seatsRemaining} seat(s) remaining.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r) => (
                    <Button
                      key={r.value}
                      variant={selectedRole === r.value ? 'default' : 'outline'}
                      size="sm"
                      className={`rounded-full text-xs ${selectedRole === r.value ? 'bg-teal-500 hover:bg-teal-600 text-white' : ''}`}
                      onClick={() => setSelectedRole(r.value)}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {availableRoles.find((r) => r.value === selectedRole)?.description}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleSend}
                disabled={emails.length === 0 || invite.isPending}
                className="gap-2 bg-teal-500 hover:bg-teal-600 text-white"
              >
                {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send {emails.length > 0 ? `(${emails.length})` : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
