import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreatorGroups } from '@/hooks/useCreatorGroups';
import {
  useCreatorGroupMemberCounts,
  type GroupMemberCounts,
} from '@/hooks/useCreatorGroupMemberCounts';
import { CrewsHowItWorks } from '@/components/groups/CrewsHowItWorks';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { Users, Plus, ChevronRight, Loader2 } from 'lucide-react';

/** Roster size on a crew card. Absent counts mean an empty crew, not a gap —
 *  the grouped query returns no rows for a crew with no members. */
const CrewCounts: React.FC<{ counts?: GroupMemberCounts }> = ({ counts }) => {
  const active = counts?.active ?? 0;
  const invited = counts?.invited ?? 0;

  if (active === 0 && invited === 0) {
    return <AppStatusBadge tone="teal">No members yet</AppStatusBadge>;
  }

  return (
    <>
      {active > 0 && (
        <AppStatusBadge tone="teal">
          {active} {active === 1 ? 'member' : 'members'}
        </AppStatusBadge>
      )}
      {invited > 0 && <AppStatusBadge tone="pink">{invited} pending</AppStatusBadge>}
    </>
  );
};

const EmptyState: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <div className="rounded-3xl border-2 border-dashed border-dc-teal/40 bg-dc-teal/5 p-10 text-center">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-dc-teal/12 text-dc-teal">
      <Users className="h-7 w-7" />
    </div>
    <h2 className="mt-4 text-xl font-bold text-dc-text">Build your first crew</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-dc-text-muted">
      Invite creators you've worked with — or want to. They choose whether to accept, then you
      can post free collabs only they see.
    </p>
    <Button variant="dc-primary" size="sm" onClick={onCreate} className="mt-6">
      <Plus className="h-4 w-4" /> New crew
    </Button>
  </div>
);

const CreatorGroupsInner: React.FC = () => {
  const { groups, isLoading, isError, createGroup } = useCreatorGroups();
  const {
    counts,
    isLoading: countsLoading,
    isError: countsError,
  } = useCreatorGroupMemberCounts(groups.map((g) => g.id));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const resetForm = () => {
    setName('');
    setDescription('');
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || createGroup.isPending) return;
    try {
      await createGroup.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
      });
      resetForm();
      setDialogOpen(false);
    } catch {
      // Error toast is handled in the hook's onError; keep the dialog open.
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 bg-white min-h-screen overflow-x-hidden">
        <PageHeader>
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-dc-text">Crews</h1>
              <p className="mt-1 text-sm text-dc-text-muted">
                Your private roster of creators. They accept an invite, then you post free
                collabs only they can see.
              </p>
            </div>
            <Button
              variant="dc-primary"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" /> New crew
            </Button>
          </div>
        </PageHeader>

        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
          {/* Shown whether or not crews exist — "what is this?" is asked before
              the first crew, and again by anyone inheriting the account. */}
          <div className="mb-6">
            <CrewsHowItWorks />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-dc-teal">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink/10 p-6 text-center">
              <p className="font-semibold text-dc-text">Couldn't load your crews</p>
              <p className="mt-1 text-sm text-dc-text-muted">Please refresh and try again.</p>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState onCreate={() => setDialogOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  to={`/dashboard/business/crews/${group.id}`}
                  className="group block rounded-2xl border-2 border-dc-teal/40 bg-dc-card p-6 shadow-sm transition-all hover:border-dc-teal hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-dc-teal/12 text-dc-teal">
                      <Users className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-5 w-5 text-dc-text-muted transition-colors group-hover:text-dc-teal" />
                  </div>
                  <h2 className="mt-4 truncate text-lg font-bold text-dc-text">{group.name}</h2>
                  {group.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-dc-text-muted">{group.description}</p>
                  ) : (
                    <p className="mt-1 text-sm italic text-dc-text-muted/70">No description</p>
                  )}
                  {/* Nothing while loading — a skeleton would jitter the grid
                      for a secondary detail. Nothing on error either: an absent
                      count is indistinguishable from an empty crew, so showing
                      it would assert "No members yet" about a full roster. */}
                  {!countsLoading && !countsError && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <CrewCounts counts={counts.get(group.id)} />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New crew</DialogTitle>
            <DialogDescription>
              Name your crew, then invite creators. Each one gets an invite to accept — you can
              add more any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="crew-name">Name</Label>
              <Input
                id="crew-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hoboken regulars"
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crew-description">
                Description <span className="font-normal text-dc-text-muted">(optional)</span>
              </Label>
              <Textarea
                id="crew-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this crew for?"
                maxLength={280}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="dc-outline"
              size="sm"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="dc-primary"
              size="sm"
              onClick={handleCreate}
              disabled={!name.trim() || createGroup.isPending}
              isLoading={createGroup.isPending}
            >
              Create crew
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const CreatorGroupsPage: React.FC = () => (
  <ErrorBoundary level="page">
    <CreatorGroupsInner />
  </ErrorBoundary>
);

export default CreatorGroupsPage;
