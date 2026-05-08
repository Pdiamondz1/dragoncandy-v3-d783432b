import React from 'react';
import { type SocialAccount } from '@outstand-so/ui';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { Share2 } from 'lucide-react';
import { CustomComposeForm } from './CustomComposeForm';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';

interface ComposeTabProps {
  accounts: SocialAccount[];
  accountsLoading: boolean;
  onPosted?: (wasScheduled: boolean) => void;
}

export const ComposeTab: React.FC<ComposeTabProps> = ({ accounts, accountsLoading, onPosted }) => {
  const { accountsTab } = useOutstandPaths();
  if (accountsLoading) {
    return (
      <div className="space-y-3">
        <DCSkeleton variant="card" />
        <DCSkeleton variant="list-row" count={2} />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <DCEmptyState
        icon={Share2}
        title="Connect an account first"
        subtitle="You need at least one connected social account before you can compose a post."
        cta={{ label: 'Go to Accounts', to: accountsTab }}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
      <CustomComposeForm accounts={accounts} onPosted={(_post, wasScheduled) => onPosted?.(wasScheduled)} />
    </div>
  );
};
