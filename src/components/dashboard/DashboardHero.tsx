// src/components/dashboard/DashboardHero.tsx
import React from 'react';

interface DashboardHeroProps {
  roleLabel: string;       // "Creator Dashboard" or "Business Dashboard"
  userName: string;        // Profile name to display
  badge?: React.ReactNode; // Optional badge next to roleLabel (e.g. LocationBadge)
  children?: React.ReactNode; // Donny bar, stats, quick actions go here
}

export function DashboardHero({ roleLabel, userName, badge, children }: DashboardHeroProps) {
  return (
    <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
              {roleLabel}
            </p>
            {badge}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 truncate mt-1">
            Welcome back, {userName}
          </h2>
          <p className="text-gray-500 mt-1 text-sm">
            Here's what's happening with your account today.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
