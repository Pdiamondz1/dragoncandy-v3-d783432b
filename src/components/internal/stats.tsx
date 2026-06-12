/** Shared UI primitives for /internal (AIOS) pages — ops-deck dark theme. */

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'teal' | 'pink';
}

export function StatCard({ label, value, sub, accent = 'teal' }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-white/[0.04] p-4 backdrop-blur-sm ${
        accent === 'teal' ? 'border-dc-teal/25' : 'border-dc-pink-accent/30'
      }`}
    >
      <p
        className={`font-mono text-[11px] uppercase tracking-wider ${
          accent === 'teal' ? 'text-dc-teal' : 'text-dc-pink'
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 text-lg font-bold text-white first:mt-0">{children}</h2>;
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink-accent/10 p-4 text-sm text-dc-pink">
      {message}
    </div>
  );
}
