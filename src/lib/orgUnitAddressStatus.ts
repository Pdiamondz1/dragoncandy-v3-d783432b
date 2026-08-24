/**
 * What we can honestly say about one location's address, from stored data alone.
 *
 * Three states, because the database holds exactly two facts — the address string and
 * the server-written `address_verified_at` stamp — and there is no third column saying
 * "a geocode is in flight". Anything that looked like a fourth state would be invented.
 *
 * `unconfirmed` deliberately does NOT mean "wrong". `address_verified_at` was added with
 * no backfill, so every location that predates it reads unconfirmed no matter how correct
 * its address is. The copy has to survive that: it asks the owner to confirm, it never
 * tells them their address is bad.
 */
export type UnitAddressStatus = 'verified' | 'unconfirmed' | 'missing';

export interface AddressFacts {
  address: string | null;
  address_verified_at: string | null;
}

export function deriveUnitAddressStatus(unit: AddressFacts): UnitAddressStatus {
  if (!unit.address || unit.address.trim().length === 0) return 'missing';
  return unit.address_verified_at != null ? 'verified' : 'unconfirmed';
}

interface Presentation {
  label: string;
  tone: 'teal' | 'amber' | 'neutral';
  /** Shown under the card; empty for the state that needs no explanation. */
  hint: string;
}

export const ADDRESS_STATUS_PRESENTATION: Record<UnitAddressStatus, Presentation> = {
  verified: {
    label: 'Address confirmed',
    tone: 'teal',
    hint: '',
  },
  unconfirmed: {
    label: 'Address needs confirming',
    tone: 'amber',
    hint: 'Open Edit and save to confirm it — that is what puts you in local creator searches.',
  },
  missing: {
    label: 'No address yet',
    tone: 'neutral',
    hint: 'Creators are matched by how close they are, so a location without one is never matched.',
  },
};
