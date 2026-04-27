import { useState } from 'react';
import { UserPlus, Search, Shield, ShieldCheck, User, MoreVertical } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useOrgMembers, useUpdateMemberRole, useRemoveMember } from '@/hooks/useOrgMembers';
import { InviteModal } from '@/components/org/InviteModal';
import { useToast } from '@/hooks/use-toast';
import type { OrgMember, OrgRole } from '@/types/org';

const ROLE_BADGES: Record<OrgRole, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  owner: { label: 'Owner', variant: 'default' },
  admin: { label: 'Admin', variant: 'secondary' },
  standard: { label: 'Member', variant: 'outline' },
};

const FILTERS = ['All', 'Owners', 'Admins', 'Standard', 'Pending'] as const;
type Filter = typeof FILTERS[number];

export default function TeamPage() {
  const { user, profile, activeOrg } = useAuth();
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const { data: members = [], isLoading } = useOrgMembers(activeOrg?.id);
  const updateRole = useUpdateMemberRole(activeOrg?.id);
  const removeMember = useRemoveMember(activeOrg?.id);
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  const userRole = profile?.role ?? 'business_client';
  const canInvite = myRole?.role === 'owner' || myRole?.role === 'admin';

  const filtered = members.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.full_name?.toLowerCase().includes(q) && !m.email?.toLowerCase().includes(q)) return false;
    }
    switch (filter) {
      case 'Owners': return m.role === 'owner';
      case 'Admins': return m.role === 'admin';
      case 'Standard': return m.role === 'standard';
      case 'Pending': return m.invitation_status === 'invited';
      default: return true;
    }
  });

  const canChangeRole = (target: OrgMember): OrgRole[] => {
    if (!myRole) return [];
    if (myRole.role === 'owner') return ['owner', 'admin', 'standard'].filter((r) => r !== target.role) as OrgRole[];
    if (myRole.role === 'admin' && target.role === 'standard') return ['admin'];
    if (myRole.role === 'admin' && target.role === 'admin') return ['standard'];
    return [];
  };

  const canRemove = (target: OrgMember): boolean => {
    if (!myRole || !user) return false;
    if (target.user_id === user.id) return true;
    if (myRole.role === 'owner') return target.role !== 'owner' || members.filter((m) => m.role === 'owner').length > 1;
    if (myRole.role === 'admin') return target.role === 'standard' || target.role === 'admin';
    return false;
  };

  const handleRoleChange = async (member: OrgMember, newRole: OrgRole) => {
    try {
      await updateRole.mutateAsync({ memberId: member.id, newRole });
      toast({ title: `${member.full_name ?? member.email} is now ${ROLE_BADGES[newRole].label}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemove = async (member: OrgMember) => {
    const isSelf = member.user_id === user?.id;
    try {
      await removeMember.mutateAsync(member.id);
      toast({ title: isSelf ? 'You left the organization' : `${member.full_name ?? member.email} removed` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const roleIcon = (role: OrgRole) => {
    if (role === 'owner') return <ShieldCheck className="h-3.5 w-3.5" />;
    if (role === 'admin') return <Shield className="h-3.5 w-3.5" />;
    return <User className="h-3.5 w-3.5" />;
  };

  return (
    <DashboardLayout userRole={userRole as any}>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            {activeOrg && <p className="text-sm text-muted-foreground">{activeOrg.name}</p>}
          </div>
          {canInvite && (
            <Button onClick={() => setInviteOpen(true)} className="gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white">
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              className={`rounded-full text-xs ${filter === f ? 'bg-teal-500 hover:bg-teal-600 text-white' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {members.length > 10 && (
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse"><CardContent className="h-16 p-4" /></Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((member) => {
              const badge = ROLE_BADGES[member.role];
              const roles = canChangeRole(member);
              const removable = canRemove(member);
              const isPending = member.invitation_status === 'invited';

              return (
                <Card key={member.id} className="border border-border/50">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Avatar className="h-10 w-10 ring-2 ring-teal-400/50">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-teal-50 text-teal-600 text-sm font-semibold">
                        {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {member.full_name ?? member.email}
                        </p>
                        <Badge variant={badge.variant} className="text-[10px] gap-1">
                          {roleIcon(member.role)}
                          {badge.label}
                        </Badge>
                        {isPending && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Pending</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    {(roles.length > 0 || removable) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {roles.length > 0 && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {roles.map((r) => (
                                  <DropdownMenuItem key={r} onClick={() => handleRoleChange(member, r)}>
                                    {ROLE_BADGES[r].label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          {removable && (
                            <DropdownMenuItem
                              onClick={() => handleRemove(member)}
                              className="text-red-600"
                            >
                              {member.user_id === user?.id ? 'Leave organization' : 'Remove member'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No members match this filter.</p>
            )}
          </div>
        )}
      </div>

      {activeOrg && (
        <InviteModal
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          orgId={activeOrg.id}
          myRole={myRole?.role ?? 'standard'}
        />
      )}
    </DashboardLayout>
  );
}
