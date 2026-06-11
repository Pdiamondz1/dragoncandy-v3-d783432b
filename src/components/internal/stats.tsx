/** Shared UI primitives for /internal (AIOS) pages. */

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'teal' | 'pink';
}

export function StatCard({ label, value, sub, accent = 'teal' }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border-2 bg-dc-card p-4 ${
        accent === 'teal' ? 'border-teal-300' : 'border-dc-pink'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-dc-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-dc-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-dc-text-muted">{sub}</p>}
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-lg font-bold text-dc-text first:mt-0">{children}</h2>;
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-dc-pink bg-dc-pink/10 p-4 text-sm text-dc-text">
      {message}
    </div>
  );
}
