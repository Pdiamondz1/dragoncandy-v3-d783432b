import { describe, it, expect } from 'vitest';
import { ROLE_REQUIREMENTS } from './requirements';
import { ACTION_REQUIREMENTS, ACTION_ROLES, GATE_RENDERABLE_KEYS, type GatedAction } from './actions';
import type { AccountRole } from './types';

const ROLES: AccountRole[] = ['business_client', 'content_creator', 'brand'];
const ACTIONS = Object.keys(ACTION_REQUIREMENTS) as GatedAction[];

describe('registry consistency', () => {
  /**
   * The failure this prevents: an action demanding a key its role never has is a
   * permanent, silent block — a user who simply cannot publish, with no error to
   * search for and nothing in the logs.
   */
  it('every key an action demands exists for every role that can perform it', () => {
    for (const action of ACTIONS) {
      for (const role of ACTION_ROLES[action]) {
        const available = new Set(ROLE_REQUIREMENTS[role].map((r) => r.key));
        for (const key of ACTION_REQUIREMENTS[action]) {
          expect(
            available.has(key),
            `action "${action}" demands "${key}", which role "${role}" does not have`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * Forcing function: the gate renders copy per requirement key. Adding a key to
   * an action without adding copy for it would render a blocking card with no
   * explanation. A later slice adding `address` must add its copy at the same time.
   */
  it('every key an action demands is renderable by the gate', () => {
    for (const action of ACTIONS) {
      for (const key of ACTION_REQUIREMENTS[action]) {
        expect(GATE_RENDERABLE_KEYS).toContain(key);
      }
    }
  });

  it('every action names at least one role', () => {
    for (const action of ACTIONS) expect(ACTION_ROLES[action].length).toBeGreaterThan(0);
  });

  /**
   * Spec §4.4, in a form that fails rather than in prose nobody re-reads: "`address` is
   * business-only. A brand's primary `org_unit` is a `product`, not a location; demanding
   * a street address of it would be a requirement no brand can meaningfully satisfy."
   *
   * Slice 1 obeyed it, slice 2 quietly reversed it, and the result was live on production
   * as a `required` row — undismissable by tier — that no brand could ever clear, pointing
   * at a page with no address field. Written as a test because the comment beside the
   * registry entry was not enough the first time.
   */
  it('does not demand an address of brands, whose units are products', () => {
    const brandKeys = ROLE_REQUIREMENTS.brand.map((r) => r.key);
    expect(brandKeys).not.toContain('address');
    // Control: the requirement still exists where it CAN be satisfied, so this test is
    // about the role and not about the key having quietly disappeared everywhere.
    expect(ROLE_REQUIREMENTS.business_client.map((r) => r.key)).toContain('address');
  });

  it('requirement keys are unique within a role', () => {
    for (const role of ROLES) {
      const keys = ROLE_REQUIREMENTS[role].map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every requirement has a non-empty label, why and resolve route', () => {
    for (const role of ROLES) {
      for (const req of ROLE_REQUIREMENTS[role]) {
        expect(req.label.trim().length, `${role}/${req.key} label`).toBeGreaterThan(0);
        expect(req.why.trim().length, `${role}/${req.key} why`).toBeGreaterThan(0);
        expect(req.resolve.route.startsWith('/'), `${role}/${req.key} route`).toBe(true);
      }
    }
  });

  it('slice 1 gates on stripe only — nothing without a shipped capture flow', () => {
    for (const action of ACTIONS) {
      expect(ACTION_REQUIREMENTS[action]).toEqual(['stripe']);
    }
  });
});
