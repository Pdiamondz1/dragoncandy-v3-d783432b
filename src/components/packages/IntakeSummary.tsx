import { ExternalLink } from 'lucide-react';

// Renders the buyer's intake answers as a readable brief for the creator. Answers are keyed by intake-field id
// (e.g. reference_examples, shoot_date, dish_count, address); we humanise the key and render the value by its
// shape (URLs → links, lists → bullets) rather than depending on the snapshotted schema — robust to any
// template. This is the FIRST thing the creator sees on an order so they know exactly what to make (F2: taste
// specified by example — the reference reels — plus the hard scope bounds).

const humanize = (key: string): string =>
  key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const isUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//i.test(v.trim());

const Link = ({ href }: { href: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 break-all text-primary underline underline-offset-2 hover:opacity-80"
  >
    {href}
    <ExternalLink className="h-3 w-3 shrink-0" />
  </a>
);

const Value = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (items.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground">
            {isUrl(item) ? <Link href={String(item).trim()} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (isUrl(value)) return <Link href={value.trim()} />;
  if (value === null || value === undefined || String(value).trim() === '')
    return <span className="text-muted-foreground">—</span>;
  return <span className="text-sm text-foreground">{String(value)}</span>;
};

export const IntakeSummary = ({ answers }: { answers: Record<string, unknown> | null | undefined }) => {
  const entries = Object.entries(answers ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && String(v).trim() !== '',
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The buyer didn’t add any brief details at checkout.
      </p>
    );
  }

  return (
    <dl className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{humanize(key)}</dt>
          <dd className="mt-1">
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
};
