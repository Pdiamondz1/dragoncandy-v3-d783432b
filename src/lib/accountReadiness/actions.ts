import type { AccountRole, RequirementKey } from './types';

export type GatedAction = 'publish_campaign' | 'apply_campaign' | 'accept_offer';

/**
 * Which requirement keys each action demands. Changing what publishing demands
 * is a one-line edit here, not a hunt through call sites — and Donny answers
 * "why can't I publish?" from this same table, so the gate and the assistant
 * cannot drift apart.
 *
 * Slice 1 demands `stripe` and nothing else: that is exactly today's behaviour,
 * refactored. Adding a key here before its capture flow exists would brick the
 * action for everyone (spec §11).
 */
export const ACTION_REQUIREMENTS: Record<GatedAction, readonly RequirementKey[]> = {
  publish_campaign: ['stripe'],
  apply_campaign: ['stripe'],
  accept_offer: ['stripe'],
};

/** Which roles can perform each action. Drives the registry consistency test. */
export const ACTION_ROLES: Record<GatedAction, readonly AccountRole[]> = {
  publish_campaign: ['business_client', 'brand'],
  apply_campaign: ['content_creator'],
  accept_offer: ['content_creator'],
};

/**
 * Keys the gate has blocking copy for. A key may only be added to
 * ACTION_REQUIREMENTS once it appears here — enforced by test.
 */
export const GATE_RENDERABLE_KEYS: readonly RequirementKey[] = ['stripe'];
