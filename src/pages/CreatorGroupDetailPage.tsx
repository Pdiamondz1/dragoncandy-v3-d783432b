import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InviteCreatorsSheet } from '@/components/groups/InviteCreatorsSheet';
import { CrewActivityFeed } from '@/components/groups/CrewActivityFeed';
import { useCreatorGroups } from '@/hooks/useCreatorGroups';
import { useCrewActivity } from '@/hooks/useCrewActivity';
import {
  useCreatorGroupMembers,
  type CreatorGroupMember,
} from '@/hooks/useCreatorGroupMembers';
import { partitionMembers } from '@/lib/groups/groupMembers';
import { resolveProfileAssetUrl } from '@/hooks/useSignedUrl';
import { ArrowLeft, Check, Loader2, Pencil, Trash2, UserPlus, Users, X } from 'lucide-react';

const StatusPill: React.FC<{ status: CreatorGroupMember['status'] }> = ({ status }) => {
  const label =
    status === 'active'
      ? 'Active'
      : status === 'invited'
        ? 'Pending'
        : status === 'declined'
          ? 'Declined'
          : 'Removed';
  const tone =
    status === 'active'
      ? 'bg-dc-teal/15 text-dc-teal-btn'
      : 'bg-dc-pink/30 text-dc-pink-accent';
  return (
    <span
      className={`mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
};

const MemberRow: React.FC<{
  member: CreatorGroupMember;
  onRemove: () => void;
  disabled: boolean;
}> = ({ member, onRemove, disabled }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const url = resolveProfileAssetUrl(member._avatar_url ?? undefined);
  const name = member._creator_name ?? 'Creator';
  const initials =
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dc-teal/25 bg-dc-card p-3">
      {url && !imgFailed ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-teal-400"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-dc-teal to-dc-teal-dark ring-2 ring-teal-400">
          <span className="text-sm font-bold text-white">{initials}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-dc-text">{name}</p>
        <StatusPill status={member.status} />
      </div>
      <Button
        variant="dc-ghost"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-dc-pink-accent hover:bg-dc-pink/10 hover:text-dc-pink-accent-btn"
      >
        Remove
      </Button>
    </div>
  );
};

const MemberSection: React.FC<{
  title: string;
  members: CreatorGroupMember[];
  emptyLabel?: string;
  onRemove: (member: CreatorGroupMember) => void;
  removeDisabled: boolean;
}> = ({ title, members, emptyLabel, onRemove, removeDisabled }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-bold uppercase tracking-wide text-dc-text">
      {title} ({members.length})
    </h2>
    {members.length === 0 ? (
      emptyLabel ? (
        <p className="text-sm text-dc-text-muted">{emptyLabel}</p>
      ) : null
    ) : (
      <div className="space-y-2">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onRemove={() => onRemove(member)}
            disabled={removeDisabled}
          />
        ))}
      </div>
    )}
  </section>
);

const CreatorGroupDetailInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const groupId = id ?? '';

  const navigate = useNavigate();
  const { groups, isLoading: groupsLoading, renameGroup, deleteGroup } = useCreatorGroups();
  const group = groups.find((g) => g.id === groupId);

  const {
    members,
    isLoading: membersLoading,
    isError,
    inviteCreators,
    removeMember,
  } = useCreatorGroupMembers(groupId);

  const {
    activity,
    isLoading: activityLoading,
    isError: activityError,
  } = useCrewActivity(groupId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<CreatorGroupMember | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { active, invited } = partitionMembers(members);

  const startRename = () => {
    setDraftName(group?.name ?? '');
    setIsRenaming(true);
  };

  const saveRename = async () => {
    const trimmed = draftName.trim();
    if (!group || !trimmed || trimmed === group.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await renameGroup.mutateAsync({
        id: group.id,
        name: trimmed,
        // Preserve the existing description (the hook nulls it when omitted).
        description: group.description ?? undefined,
      });
    } catch {
      // Error toast handled in the hook's onError.
    }
    setIsRenaming(false);
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember.mutateAsync({
        creatorId: memberToRemove.creator_id,
        // Drives whether the creator gets a "you're no longer in this crew"
        // bell — rescinding a pending invite must not send one.
        wasActive: memberToRemove.status === 'active',
      });
    } catch {
      // Error toast handled in the hook's onError.
    }
    setMemberToRemove(null);
  };

  const confirmDelete = async () => {
    if (!groupId) return;
    try {
      await deleteGroup.mutateAsync(groupId);
      navigate('/dashboard/business/crews');
    } catch {
      // Error toast handled in the hook's onError — including the ON DELETE
      // RESTRICT case, where the crew still owns campaigns ("Cannot delete this
      // crew — remove or reassign this crew's campaigns first").
    }
    setDeleteOpen(false);
  };

  // Group list still loading and not yet found.
  if (groupsLoading && !group) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex flex-1 items-center justify-center bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  // Loaded but the crew doesn't exist / isn't owned by this user.
  if (!group) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 bg-white min-h-screen">
          <div className="mx-auto max-w-3xl p-8 text-center">
            <p className="text-lg font-bold text-dc-text">Crew not found</p>
            <p className="mt-1 text-sm text-dc-text-muted">It may have been deleted.</p>
            <Button asChild variant="dc-outline" size="sm" className="mt-6">
              <Link to="/dashboard/business/crews">Back to crews</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 bg-white min-h-screen overflow-x-hidden">
        <PageHeader>
          <div className="mx-auto max-w-3xl">
            <Link
              to="/dashboard/business/crews"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-dc-text-muted transition-colors hover:text-dc-teal"
            >
              <ArrowLeft className="h-4 w-4" /> Crews
            </Link>

            <div className="mt-3 flex items-start justify-between gap-4">
              {isRenaming ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={80}
                    autoFocus
                    className="rounded-full bg-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveRename();
                      } else if (e.key === 'Escape') {
                        setIsRenaming(false);
                      }
                    }}
                  />
                  <Button
                    variant="dc-primary"
                    size="icon"
                    onClick={saveRename}
                    disabled={renameGroup.isPending}
                    aria-label="Save crew name"
                    className="h-10 w-10 shrink-0"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="dc-outline"
                    size="icon"
                    onClick={() => setIsRenaming(false)}
                    aria-label="Cancel rename"
                    className="h-10 w-10 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-2xl font-bold text-dc-text lg:text-3xl">
                      {group.name}
                    </h1>
                    <button
                      type="button"
                      onClick={startRename}
                      aria-label="Rename crew"
                      className="shrink-0 rounded-full p-1.5 text-dc-text-muted transition-colors hover:bg-dc-teal/10 hover:text-dc-teal"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      aria-label="Delete crew"
                      className="shrink-0 rounded-full p-1.5 text-dc-text-muted transition-colors hover:bg-dc-pink/20 hover:text-dc-pink-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {group.description && (
                    <p className="mt-1 text-sm text-dc-text-muted">{group.description}</p>
                  )}
                </div>
              )}

              {!isRenaming && (
                <Button
                  variant="dc-primary"
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  className="shrink-0"
                >
                  <UserPlus className="h-4 w-4" /> Invite creators
                </Button>
              )}
            </div>
          </div>
        </PageHeader>

        <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6 lg:p-8">
          {membersLoading ? (
            <div className="flex items-center justify-center py-16 text-dc-teal">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink/10 p-6 text-center">
              <p className="font-semibold text-dc-text">Couldn't load members</p>
              <p className="mt-1 text-sm text-dc-text-muted">Please refresh and try again.</p>
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-dc-teal/40 bg-dc-teal/5 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dc-teal/12 text-dc-teal">
                <Users className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-dc-text">No members yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-dc-text-muted">
                Invite creators to build this crew. Each one chooses whether to accept — they'll
                sit under Pending until they do.
              </p>
              <Button
                variant="dc-primary"
                size="sm"
                onClick={() => setInviteOpen(true)}
                className="mt-6"
              >
                <UserPlus className="h-4 w-4" /> Invite creators
              </Button>
            </div>
          ) : (
            <>
              <MemberSection
                title="Active"
                members={active}
                emptyLabel="No active members yet — pending invites appear below."
                onRemove={setMemberToRemove}
                removeDisabled={removeMember.isPending}
              />
              {invited.length > 0 && (
                <MemberSection
                  title="Pending"
                  members={invited}
                  onRemove={setMemberToRemove}
                  removeDisabled={removeMember.isPending}
                />
              )}
            </>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-dc-text">Activity</h2>
            <CrewActivityFeed
              items={activity}
              isLoading={activityLoading}
              isError={activityError}
            />
          </section>
        </div>
      </div>

      <InviteCreatorsSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        currentMembers={members}
        onInvite={(ids) => inviteCreators.mutateAsync(ids)}
        isInviting={inviteCreators.isPending}
      />

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from crew?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove?._creator_name ?? 'This creator'} will lose access to this crew's
              campaigns. You can re-invite them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="rounded-full bg-dc-pink-accent-btn text-white hover:bg-dc-pink-accent-btn-hover"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this crew?</AlertDialogTitle>
            <AlertDialogDescription>
              {active.length > 0 || invited.length > 0 ? (
                <>
                  {active.length + invited.length}{' '}
                  {active.length + invited.length === 1 ? 'creator' : 'creators'} will lose access
                  to this crew. They aren't notified, and this can't be undone. A crew that still
                  has campaigns can't be deleted — reassign or remove those first.
                </>
              ) : (
                <>
                  This can't be undone. A crew that still has campaigns can't be deleted — reassign
                  or remove those first.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteGroup.isPending}
              className="rounded-full bg-dc-pink-accent-btn text-white hover:bg-dc-pink-accent-btn-hover"
            >
              Delete crew
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

const CreatorGroupDetailPage: React.FC = () => (
  <ErrorBoundary level="page">
    <CreatorGroupDetailInner />
  </ErrorBoundary>
);

export default CreatorGroupDetailPage;
