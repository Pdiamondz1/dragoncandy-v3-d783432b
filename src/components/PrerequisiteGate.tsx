import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePrerequisiteStatus } from '@/hooks/usePrerequisiteStatus';

interface PrerequisiteGateProps {
  feature: string;
  children: ReactNode;
  inline?: boolean;
}

export function PrerequisiteGate({ feature, children, inline }: PrerequisiteGateProps) {
  const { isLoading, items, allMet } = usePrerequisiteStatus();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (allMet) return <>{children}</>;

  const firstUnmet = items.find((i) => !i.met);

  if (inline) {
    return (
      <div className="rounded-2xl border-2 border-teal-300 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">
          Complete setup to {feature}
        </p>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.met ? (
                <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />
              )}
              <span className={item.met ? 'text-gray-500' : 'text-gray-800'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        {firstUnmet && (
          <Button
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold text-sm py-2"
            onClick={() => navigate(firstUnmet.actionPath)}
          >
            {firstUnmet.actionLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border-2 border-teal-300 p-6 space-y-5">
        <div className="text-center">
          <Sparkles className="h-8 w-8 text-teal-500 mx-auto mb-2" />
          <h2 className="text-xl font-bold text-gray-900">Almost there!</h2>
          <p className="text-sm text-gray-500 mt-1">
            Complete these steps to {feature}
          </p>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.met ? (
                  <CheckCircle2 className="h-5 w-5 text-teal-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${item.met ? 'text-gray-500 line-through' : 'text-gray-800 font-medium'}`}
                >
                  {item.label}
                </span>
              </div>
              {!item.met && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs flex-shrink-0 border-teal-300 text-teal-700 hover:bg-teal-50"
                  onClick={() => navigate(item.actionPath)}
                >
                  {item.actionLabel}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {firstUnmet && (
          <Button
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold text-base py-6"
            onClick={() => navigate(firstUnmet.actionPath)}
          >
            {firstUnmet.actionLabel} to get started
          </Button>
        )}
      </div>
    </div>
  );
}
