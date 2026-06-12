import React from 'react';

interface DashboardGreetingProps {
  roleLabel: string;       // "Restaurant Dashboard" or "Creator Dashboard"
  userName: string;        // Profile name to display
  badge?: React.ReactNode; // Optional badge next to roleLabel (e.g. LocationBadge)
  subtitle?: string;
}

/**
 * Calm replacement for the pink-gradient DashboardHero. White background,
 * quiet eyebrow, one bold greeting line — the pink tick is the only accent.
 */
export function DashboardGreeting({
  roleLabel,
  userName,
  badge,
  subtitle = "Here's what's happening with your account today.",
}: DashboardGreetingProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-1 rounded-full bg-dc-pink" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wider text-dc-text-muted">
          {roleLabel}
        </p>
        {badge}
      </div>
      <h2 className="text-2xl lg:text-3xl font-bold text-dc-text truncate mt-2">
        Welcome back, {userName}
      </h2>
      <p className="text-sm text-dc-text-muted mt-1">{subtitle}</p>
    </div>
  );
}
