// A proposed post, for the owner to confirm. NOT a publish.
//
// Publishing is irreversible and public: a misread request lands on a real
// business's feed before the owner sees it, and deleting a post does not
// un-see it. So create_post/schedule_post return one of these and the actual
// publish happens on the owner's tap, through the client's normal posting path.
// The LLM cannot publish — enforced by where the code lives, not by a prompt
// instruction a model may ignore.
import { describeAccount, type ConnectedAccount } from './outstand-accounts.ts';

export interface SocialDraftCard {
  type: 'social_post_draft';
  data: {
    /** "@areyouaman · Instagram" — what the user reads. */
    account_label: string;
    /** For the client's publish call only. Never rendered, never model-visible. */
    account_id: string;
    platform: string;
    caption: string;
    media_urls: string[];
    scheduled_at: string | null;
  };
}

export function buildDraftCard(input: {
  account: ConnectedAccount;
  caption: string;
  mediaUrls: string[];
  scheduledAt: string | null;
}): SocialDraftCard {
  return {
    type: 'social_post_draft',
    data: {
      account_label: describeAccount(input.account),
      account_id: input.account.id,
      platform: input.account.platform,
      caption: input.caption,
      media_urls: input.mediaUrls,
      scheduled_at: input.scheduledAt,
    },
  };
}

/**
 * What the MODEL is told. Deliberately never says "posted" or "published" —
 * the tool did neither, and a model that reads either word will tell the user
 * their post is live when it is sitting in a card waiting for a tap.
 */
export function draftToolResult(card: SocialDraftCard): { text: string; card: SocialDraftCard } {
  const when = card.data.scheduled_at
    ? ` scheduled for ${card.data.scheduled_at}`
    : '';
  return {
    text: JSON.stringify({
      status: 'draft_ready',
      account: card.data.account_label,
      scheduled_at: card.data.scheduled_at,
      instruction:
        `A draft${when} is now shown to the user as a card with a confirm button. ` +
        `Tell them it is ready to review and that it goes out only when they tap it. ` +
        `Do NOT say it is already live, sent, or on their feed.`,
    }),
    card,
  };
}

export function disambiguationResult(accounts: ConnectedAccount[]): string {
  return JSON.stringify({
    status: 'which_account',
    accounts: accounts.map(describeAccount),
    instruction:
      'Ask the user which of these accounts to use. Refer to them exactly as listed.',
  });
}

export function noAccountResult(): string {
  return JSON.stringify({
    status: 'no_social_account',
    instruction:
      'State that no social account is connected yet, and point the user at ' +
      'Social Media settings to connect one. Do not speculate about why.',
  });
}

/**
 * schedule_post with no (or non-string) scheduled_at must refuse, not silently
 * fall back to an unscheduled draft. Silent degradation on the one path that
 * ends in an irreversible public post is not an acceptable failure mode even
 * though a human still confirms the card — "probably caught" is not the bar.
 */
export function missingScheduledAtResult(): string {
  return JSON.stringify({
    status: 'missing_scheduled_at',
    instruction:
      'Ask the user when this post should go out, then call schedule_post again with that time.',
  });
}
