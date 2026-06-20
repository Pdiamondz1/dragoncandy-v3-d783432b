import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Play, Plus, X } from 'lucide-react';
import {
  usePlaybooks,
  useUpsertPlaybook,
  useSetPlaybookStatus,
  useRunPlaybook,
  type Playbook,
  type ProposalTarget,
} from '@/hooks/internal/usePlaybooks';
import { ErrorCard } from '@/components/internal/stats';
import { Spinner } from '@/components/ui/spinner';

const PROPOSAL_LABELS: Record<ProposalTarget, string> = {
  dashboard_setting: 'Dashboard setting',
  strategy_doc: 'Strategy doc',
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Form state for creating/editing a playbook. */
interface FormState {
  id?: string;
  title: string;
  slug: string;
  slugTouched: boolean;
  task_md: string;
  preferences_md: string;
  done_criteria_md: string;
  allowed_proposals: ProposalTarget[];
  source_finding_id: string | null;
}

const EMPTY_FORM: FormState = {
  title: '',
  slug: '',
  slugTouched: false,
  task_md: '',
  preferences_md: '',
  done_criteria_md: '',
  allowed_proposals: [],
  source_finding_id: null,
};

const inputCls =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-dc-teal/50 focus:outline-none';

const PlaybookForm = ({
  initial,
  onClose,
}: {
  initial: FormState;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<FormState>(initial);
  const upsert = useUpsertPlaybook();
  const isEdit = !!form.id;

  const slug = form.slugTouched ? form.slug : slugify(form.title);

  const toggleProposal = (t: ProposalTarget) =>
    setForm((f) => ({
      ...f,
      allowed_proposals: f.allowed_proposals.includes(t)
        ? f.allowed_proposals.filter((x) => x !== t)
        : [...f.allowed_proposals, t],
    }));

  const submit = () => {
    if (!form.title.trim() || !slug || !form.task_md.trim()) {
      toast.error('Title, slug, and task are required.');
      return;
    }
    upsert.mutate(
      {
        id: form.id,
        slug,
        title: form.title.trim(),
        task_md: form.task_md,
        preferences_md: form.preferences_md,
        done_criteria_md: form.done_criteria_md,
        allowed_proposals: form.allowed_proposals,
        source_finding_id: form.source_finding_id,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? 'Playbook saved.' : 'Playbook created.');
          onClose();
        },
        onError: (e) =>
          toast.error(`Save failed — ${(e as Error)?.message ?? 'try again.'}`),
      },
    );
  };

  return (
    <div className="rounded-2xl border border-dc-teal/40 bg-dc-teal/[0.05] p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-bold text-dc-teal">{isEdit ? 'Edit playbook' : 'New playbook'}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">
            Title
          </label>
          <input
            className={inputCls}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Weekly KPI variance check"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">
            Slug <span className="font-mono normal-case text-white/30">(stable handle)</span>
          </label>
          <input
            className={`${inputCls} font-mono`}
            value={slug}
            onChange={(e) =>
              setForm((f) => ({ ...f, slug: slugify(e.target.value), slugTouched: true }))
            }
            disabled={isEdit}
          />
          {isEdit && (
            <p className="mt-1 text-[0.7rem] text-white/40">Slug can't change after creation.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">
            Task — what the playbook does
          </label>
          <textarea
            className={`${inputCls} min-h-[5rem]`}
            value={form.task_md}
            onChange={(e) => setForm((f) => ({ ...f, task_md: e.target.value }))}
            placeholder="Compare this week's live platform stats against the KPI targets in the scorecard and report variances."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">
            Preferences & constraints
          </label>
          <textarea
            className={`${inputCls} min-h-[3.5rem]`}
            value={form.preferences_md}
            onChange={(e) => setForm((f) => ({ ...f, preferences_md: e.target.value }))}
            placeholder="No dollar figures except aggregate revenue. Be terse."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/50">
            Definition of done
          </label>
          <textarea
            className={`${inputCls} min-h-[3.5rem]`}
            value={form.done_criteria_md}
            onChange={(e) => setForm((f) => ({ ...f, done_criteria_md: e.target.value }))}
            placeholder="Every KPI in the scorecard is reported with its target and a variance verdict."
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/50">
            Allowed proposals{' '}
            <span className="normal-case text-white/30">(empty = report-only)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {(['dashboard_setting', 'strategy_doc'] as ProposalTarget[]).map((t) => {
              const on = form.allowed_proposals.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleProposal(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    on
                      ? 'bg-dc-teal font-bold text-dc-dark'
                      : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12]'
                  }`}
                >
                  {PROPOSAL_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={upsert.isPending}
            className="rounded-full bg-dc-teal px-5 py-1.5 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
          >
            {upsert.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create playbook'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/[0.06] px-5 py-1.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.12]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const PlaybookCard = ({ playbook, onEdit }: { playbook: Playbook; onEdit: () => void }) => {
  const navigate = useNavigate();
  const run = useRunPlaybook();
  const setStatus = useSetPlaybookStatus();
  const archived = playbook.status === 'archived';

  const handleRun = () =>
    run.mutate(playbook.slug, {
      onSuccess: () => {
        toast.success('Playbook run complete.');
        navigate(`/internal/playbooks/${playbook.slug}`);
      },
      onError: (e) => toast.error(`Run failed — ${(e as Error)?.message ?? 'try again.'}`),
    });

  return (
    <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/internal/playbooks/${playbook.slug}`}
              className="font-bold text-white hover:text-dc-teal"
            >
              {playbook.title}
            </Link>
            {archived && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold uppercase text-white/60">
                Archived
              </span>
            )}
            {playbook.allowed_proposals.length === 0 ? (
              <span className="rounded-full bg-dc-teal/20 px-2.5 py-0.5 text-xs font-semibold text-dc-teal">
                Report-only
              </span>
            ) : (
              playbook.allowed_proposals.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-dc-pink/20 px-2.5 py-0.5 text-xs font-semibold text-dc-pink"
                >
                  Proposes: {PROPOSAL_LABELS[t]}
                </span>
              ))
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-white/50">{playbook.slug}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {!archived && (
            <button
              type="button"
              onClick={handleRun}
              disabled={run.isPending}
              className="flex items-center gap-1.5 rounded-full bg-dc-teal px-4 py-1 text-xs font-bold text-dc-dark transition-colors hover:bg-dc-teal/80 disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              {run.isPending ? 'Running…' : 'Run'}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.12]"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() =>
              setStatus.mutate({ id: playbook.id, status: archived ? 'active' : 'archived' })
            }
            disabled={setStatus.isPending}
            className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/50 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
          >
            {archived ? 'Reactivate' : 'Archive'}
          </button>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-white/60">{playbook.task_md}</p>
    </div>
  );
};

const InternalPlaybooks = () => {
  const playbooks = usePlaybooks();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState | null>(null);

  // Promote-from-Loop-Scout: a finding's "Promote to playbook" action navigates
  // here with a pre-filled draft in router state.
  useEffect(() => {
    const draft = (location.state as { promoteDraft?: Partial<FormState> } | null)?.promoteDraft;
    if (draft) {
      setForm({ ...EMPTY_FORM, ...draft, slugTouched: false });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (playbooks.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (playbooks.isError || !playbooks.data) {
    return <ErrorCard message="Playbooks failed to load." />;
  }

  const startEdit = (p: Playbook) =>
    setForm({
      id: p.id,
      title: p.title,
      slug: p.slug,
      slugTouched: true,
      task_md: p.task_md,
      preferences_md: p.preferences_md,
      done_criteria_md: p.done_criteria_md,
      allowed_proposals: p.allowed_proposals,
      source_finding_id: p.source_finding_id,
    });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">PLAYBOOKS</h1>
          <p className="mt-1 text-sm text-white/60">
            Saved repeatable tasks Donny runs on demand — report-only, and any fix is just a
            proposal you approve at{' '}
            <Link to="/internal/corrections" className="text-dc-teal hover:underline">
              Corrections
            </Link>
            . Nothing auto-applies.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={() => setForm({ ...EMPTY_FORM })}
            className="flex items-center gap-1.5 rounded-full bg-dc-teal px-4 py-1.5 text-sm font-bold text-dc-dark transition-colors hover:bg-dc-teal/80"
          >
            <Plus className="h-4 w-4" /> New playbook
          </button>
        )}
      </div>

      {form && (
        <div className="mt-4">
          <PlaybookForm key={form.id ?? 'new'} initial={form} onClose={() => setForm(null)} />
        </div>
      )}

      <div className="mt-4 space-y-3">
        {playbooks.data.length === 0 ? (
          <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-sm text-white/60 backdrop-blur-sm">
            No playbooks yet — create one, or promote a loop-candidate from{' '}
            <Link to="/internal/findings" className="text-dc-teal hover:underline">
              Findings
            </Link>
            .
          </div>
        ) : (
          playbooks.data.map((p) => (
            <PlaybookCard key={p.id} playbook={p} onEdit={() => startEdit(p)} />
          ))
        )}
      </div>
    </div>
  );
};

export default InternalPlaybooks;
