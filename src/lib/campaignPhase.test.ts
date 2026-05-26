import { describe, it, expect } from 'vitest';
import { deriveCurrentStep } from './campaignPhase';

describe('deriveCurrentStep', () => {
  it('returns "submitted" for revision_requested status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'revision_requested' })
    ).toBe('submitted');
  });

  it('returns "payment" for auto_approved status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'auto_approved' })
    ).toBe('payment');
  });

  it('returns "review" for submitted status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'submitted' })
    ).toBe('review');
  });

  it('returns "payment" for approved status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'approved' })
    ).toBe('payment');
  });

  it('returns "hired" for pending status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'pending' })
    ).toBe('hired');
  });

  it('returns "hired" for in_progress status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: 'in_progress' })
    ).toBe('hired');
  });

  it('returns "review_left" for completed collaboration', () => {
    expect(
      deriveCurrentStep({ status: 'completed', content_status: 'approved' })
    ).toBe('review_left');
  });

  it('returns "payment" when business_completion_status is requested', () => {
    expect(
      deriveCurrentStep({
        status: 'active',
        content_status: 'approved',
        business_completion_status: 'requested',
      })
    ).toBe('payment');
  });

  it('returns "hired" for null content_status', () => {
    expect(
      deriveCurrentStep({ status: 'active', content_status: null })
    ).toBe('hired');
  });
});
