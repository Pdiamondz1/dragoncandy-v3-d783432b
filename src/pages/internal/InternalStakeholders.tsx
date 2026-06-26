import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import {
  useInternalUsers,
  useInviteInternalUser,
  useRevokeInternalUser,
  type InternalTier,
  type InternalUser,
} from '@/hooks/internal/useInternalUsers';
import { ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { Spinner } from '@/components/ui/spinner';

const TIER_LABELS: Record<InternalTier, string> = {
  admin: 'Admin',
  stakeholder: 'Stakeholder',
};

const TIER_STYLES: Record<InternalTier, string> = {
  admin: 'bg-dc-teal text-dc-dark',
  stakeholder: 'bg-dc-pink/30 text-dc-pink',
};

const STATUS_STYLES: Record<InternalUser['status'], string> = {
  active: 'bg-dc-teal/20 text-dc-teal',
  invited: 'bg-dc-yellow/80 text-dc-dark',
};

const TierToggle = ({
  value,
  onChange,
  disabled,
}: {
  value: InternalTier;
  onChange: (t: InternalTier) => void;
  disabled?: boolean;
}) => (
  <div className="flex gap-1.5">
    {(['admin', 'stakeholder'] as const).map((t) => (
      <button
        key={t}
        type="button"
        disabled={disabled}
        onClick={() => onChange(t)}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
          value === t
            ? 'bg-dc-teal font-bold text-dc-dark'
            : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]'
        }`}
      >
        {TIER_LABELS[t]}
      </button>
    ))}
  </div>
);

const InviteForm = () => {
  const invite = useInviteInternalUser();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState<InternalTier>('admin');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invite.isPending) return;
    invite.mutate(
      { email: email.trim(), full_name: name.trim() || undefined, tier },
      {
        onSuccess: (res) => {
          if (res.status === 'already_has_access') {
            toast(`${email.trim()} already has ${TIER_LABELS[res.tier]} access.`);
            return;
          }
          if (res.email_sent === false) {
            toast.error(
              'Access granted, but the email failed to send. Try inviting again to re-send.',
            );
          } else if (res.status === 'invited') {
            toast.success(`Invite sent to ${email.trim()}.`);
          } else {
            toast.success(`${email.trim()} was granted ${TIER_LABELS[res.tier]} access.`);
          }
          setEmail('');
          setName('');
          setTier('admin');
        },
        onError: (err) =>
          toast.error(`Invite failed — ${(err as Error)?.message ?? 'try again.'}`),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-dc-teal" />
        <h2 className="font-bold text-white">Invite a stakeholder</h2>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Creates an AIOS-only account. They set their own password from an emailed link and never get
        access to the consumer DragonCandy app.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-email" className="block text-xs font-semibold uppercase tracking-wider text-dc-teal">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="mt-1.5 w-full rounded-full border border-white/10 bg-dc-dark/60 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-shadow focus:border-dc-teal/60 focus:shadow-[0_0_0_3px_rgba(77,217,192,0.18)]"
          />
        </div>
        <div>
          <label htmlFor="invite-name" className="block text-xs font-semibold uppercase tracking-wider text-dc-teal">
            Name <span className="text-white/30">(optional)</span>
          </label>
          <input
            id="invite-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adrian Vella"
            className="mt-1.5 w-full rounded-full border border-white/10 bg-dc-dark/60 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-shadow focus:border-dc-teal/60 focus:shadow-[0_0_0_3px_rgba(77,217,192,0.18)]"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-dc-teal">
            Access level
          </span>
          <div className="mt-1.5">
            <TierToggle value={tier} onChange={setTier} disabled={invite.isPending} />
          </div>
        </div>
        <button
          type="submit"
          disabled={invite.isPending || !email.trim()}
          className="rounded-full bg-dc-teal px-6 py-2.5 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-40"
        >
          {invite.isPending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      <p className="mt-3 text-[0.7rem] leading-relaxed text-white/40">
        {tier === 'admin'
          ? 'Admin = full AIOS access, including financials, Corrections, Playbooks and Internal Donny.'
          : 'Stakeholder = read-only access to Overview, Weight, Briefings, Strategy and Workspace.'}
      </p>
    </form>
  );
};

const UserRow = ({ user }: { user: InternalUser }) => {
  const revoke = useRevokeInternalUser();
  const [confirming, setConfirming] = useState(false);

  const doRevoke = () =>
    revoke.mutate(user.user_id, {
      onSuccess: () => toast.success(`Revoked access for ${user.email}.`),
      onError: (err) => toast.error(`Revoke failed — ${(err as Error)?.message ?? 'try again.'}`),
      onSettled: () => setConfirming(false),
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dc-teal/20 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-white">{user.full_name || user.email}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${TIER_STYLES[user.tier]}`}>
            {TIER_LABELS[user.tier]}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[user.status]}`}>
            {user.status === 'active' ? 'Active' : 'Invited'}
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-white/50">
          {user.full_name ? `${user.email} · ` : ''}
          {user.invited_at ? new Date(user.invited_at).toLocaleDateString() : 'unknown date'}
        </p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-white/60">Revoke?</span>
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={doRevoke}
            className="rounded-full bg-dc-pink-accent px-4 py-1 text-xs font-bold text-white transition-colors hover:bg-dc-pink-accent/80 disabled:opacity-50"
          >
            {revoke.isPending ? '…' : 'Confirm'}
          </button>
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() => setConfirming(false)}
            className="rounded-full bg-white/[0.06] px-4 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-dc-pink-accent/40 px-4 py-1.5 text-xs font-semibold text-dc-pink transition-colors hover:bg-white/[0.06]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Revoke
        </button>
      )}
    </div>
  );
};

const InternalStakeholders = () => {
  const users = useInternalUsers();

  return (
    <PageContainer size="md">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-dc-teal" />
            STAKEHOLDERS
          </span>
        }
        subtitle="People with access to the AIOS. Invite stakeholders by email, see who has access, and revoke it. These are internal-only accounts — they have no access to the consumer DragonCandy app."
      />

      <InviteForm />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-white/70">
        Current access
      </h2>

      {users.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Spinner className="h-10 w-10 border-teal-400" />
        </div>
      ) : users.isError || !users.data ? (
        <ErrorCard message="Could not load internal users." />
      ) : users.data.length === 0 ? (
        <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-sm text-white/60 backdrop-blur-sm">
          No internal users yet — invite your first stakeholder above.
        </div>
      ) : (
        <div className="space-y-3">
          {users.data.map((u) => (
            <UserRow key={u.user_id} user={u} />
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default InternalStakeholders;
