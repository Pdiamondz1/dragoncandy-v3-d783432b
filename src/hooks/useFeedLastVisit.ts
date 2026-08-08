import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const key = (userId: string) => `dc:dragonfeed:lastVisit:${userId}`;

/**
 * The viewer's PREVIOUS visit to the Dragon Feed, for the NEW badge.
 *
 * Captured once on mount and held for the lifetime of the page, then the marker is advanced to
 * "now". Reading the previous value first is the whole point: if we stamped and read in the other
 * order, every item would instantly stop being new and the badge would never render.
 *
 * localStorage is deliberate — this is a per-device reading position, not an account fact worth a
 * table, an RLS policy and a write on every feed open. A first visit (or a cleared browser) simply
 * shows no badges, which `isNewSince` already treats as "not new" rather than "everything is new".
 */
export function useFeedLastVisit(): { lastVisit: string | null } {
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;

      try {
        const storageKey = key(userId);
        setLastVisit(window.localStorage.getItem(storageKey));
        window.localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // Private mode / storage disabled — no badges, which is the safe direction.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { lastVisit };
}
