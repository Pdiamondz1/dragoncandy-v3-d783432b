import { describe, it, expect } from 'vitest';
import {
  extractRequestAccountIds,
  firstUnownedAccountId,
  decidePostAccess,
  type PostAccessInput,
} from './outstand-post-authz';

// The caller and a stranger. Every test below is some arrangement of "MINE is
// connected to my DragonCandy account; THEIRS is not".
const MINE = 'acct_mine';
const ALSO_MINE = 'acct_mine_2';
const THEIRS = 'acct_stranger';
const OWNED = new Set([MINE, ALSO_MINE]);

const ME = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

function input(over: Partial<PostAccessInput> = {}): PostAccessInput {
  return {
    ownedAccountIds: OWNED,
    requestedAccountIds: [],
    postAccountIds: [],
    bindingUserId: null,
    callerUserId: ME,
    ...over,
  };
}

describe('decidePostAccess — defect (A): request-body ids are not a grant', () => {
  // THE ORIGINAL BUG, stated as a test. The replaced code parsed
  // social_account_ids/accounts out of the caller's own body and set
  // allowed = true if .some() of them was owned, WITHOUT ever checking the post
  // in the path against those accounts. `DELETE /posts/{any_post_id}` with a
  // body naming your own account id therefore deleted any post in the org —
  // and the org key is shared across every tenant.
  it('DENIES a mutating request whose body names only the caller\'s OWN account, when nothing ties the caller to the post', () => {
    const decision = decidePostAccess(
      input({
        requestedAccountIds: [MINE],
        postAccountIds: [THEIRS], // the post is somebody else's
        bindingUserId: STRANGER,
      }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'no_ownership_evidence' });
  });

  it('DENIES even when the body names every account the caller owns', () => {
    // Volume of owned ids in the body is still zero evidence about the post.
    expect(
      decidePostAccess(input({ requestedAccountIds: [MINE, ALSO_MINE] })).allowed,
    ).toBe(false);
  });
});

describe('decidePostAccess — defect (B): platform is not ownership', () => {
  // The replaced code fell back to listOwnedPlatforms() and allowed when the
  // post's PLATFORM matched one the caller owned any account on — so owning one
  // Instagram account authorized every Instagram post in the org. There is no
  // longer any platform input to this decision AT ALL, which is the strongest
  // form the fix can take: the fallback cannot be reintroduced by a caller
  // passing the wrong argument, because no such argument exists.
  it('has no platform input — a post on a platform the caller uses is still denied', () => {
    const decision = decidePostAccess(input({ postAccountIds: [THEIRS] }));
    expect(decision).toEqual({ allowed: false, reason: 'no_ownership_evidence' });
    // Guard against a future signature change quietly re-adding it.
    expect(Object.keys(input())).not.toContain('platform');
  });
});

describe('decidePostAccess — the two surviving grants', () => {
  it('GRANTS on the provider-fetched account intersection (server-side fact #1)', () => {
    expect(decidePostAccess(input({ postAccountIds: [THEIRS, MINE] }))).toEqual({
      allowed: true,
      grant: 'post_account',
    });
  });

  it('GRANTS on the server-established ownership binding naming the caller (server-side fact #2)', () => {
    expect(decidePostAccess(input({ bindingUserId: ME }))).toEqual({
      allowed: true,
      grant: 'ownership_binding',
    });
  });

  it('DENIES when the binding names somebody else', () => {
    expect(decidePostAccess(input({ bindingUserId: STRANGER })).allowed).toBe(false);
  });

  it('never grants on two pieces of missing information (empty binding vs empty caller)', () => {
    // Without the non-empty guard, '' === '' would authorize a post with no
    // binding for a caller with no id.
    expect(decidePostAccess(input({ bindingUserId: '', callerUserId: '' })).allowed).toBe(false);
  });
});

describe('decidePostAccess — the constraint outranks the grants', () => {
  // Owning the post does NOT entitle you to re-point it at somebody else's
  // connected account, so the constraint must survive a valid grant.
  it('DENIES re-targeting onto an unowned account even with a valid binding grant', () => {
    expect(
      decidePostAccess(input({ requestedAccountIds: [THEIRS], bindingUserId: ME })),
    ).toEqual({ allowed: false, reason: 'unowned_target_account', accountId: THEIRS });
  });

  it('DENIES re-targeting onto an unowned account even with a valid post-account grant', () => {
    expect(
      decidePostAccess(input({ requestedAccountIds: [THEIRS], postAccountIds: [MINE] })).allowed,
    ).toBe(false);
  });

  it('requires EVERY named account to be owned, not just one (.every, not .some)', () => {
    // The exact shape of the replaced code's mistake: one owned id smuggling an
    // unowned one alongside it.
    expect(
      decidePostAccess(input({ requestedAccountIds: [MINE, THEIRS], bindingUserId: ME })),
    ).toEqual({ allowed: false, reason: 'unowned_target_account', accountId: THEIRS });
  });

  it('ALLOWS a mutating request that names only owned accounts, given a grant', () => {
    expect(
      decidePostAccess(input({ requestedAccountIds: [MINE, ALSO_MINE], bindingUserId: ME })).allowed,
    ).toBe(true);
  });

  it('does not block a mutating request that names no accounts — it just still needs a grant', () => {
    expect(decidePostAccess(input({ requestedAccountIds: [] })).allowed).toBe(false);
    expect(decidePostAccess(input({ requestedAccountIds: [], bindingUserId: ME })).allowed).toBe(true);
  });
});

describe('decidePostAccess — fail closed on every "we do not know"', () => {
  // Each of these is a real runtime path: the provider fetch 500s or its shape
  // moved (empty ids), the binding table read errored or predates the post
  // (null). None may produce an allow.
  it.each([
    ['provider fetch returned nothing AND no binding', { postAccountIds: [], bindingUserId: null }],
    ['provider fetch returned nothing, binding unreadable', { postAccountIds: [], bindingUserId: null }],
    ['post belongs to a stranger, no binding', { postAccountIds: [THEIRS], bindingUserId: null }],
  ])('DENIES: %s', (_label, over) => {
    expect(decidePostAccess(input(over)).allowed).toBe(false);
  });

  it('denies when the caller owns no accounts at all', () => {
    expect(
      decidePostAccess(input({ ownedAccountIds: new Set(), postAccountIds: [THEIRS, MINE] })).allowed,
    ).toBe(false);
  });
});

describe('extractRequestAccountIds', () => {
  it('reads every field name the two call sites use', () => {
    expect(extractRequestAccountIds({ accounts: ['a'] })).toEqual(['a']);
    expect(extractRequestAccountIds({ social_account_ids: ['b'] })).toEqual(['b']);
    expect(extractRequestAccountIds({ socialAccountIds: ['c'] })).toEqual(['c']);
    expect(extractRequestAccountIds({ social_account_id: 'd' })).toEqual(['d']);
    expect(extractRequestAccountIds({ socialAccountId: 'e' })).toEqual(['e']);
  });

  it('unions and deduplicates across fields', () => {
    expect(
      extractRequestAccountIds({ accounts: [MINE], social_account_ids: [MINE, THEIRS] }),
    ).toEqual([MINE, THEIRS]);
  });

  it('returns [] for bodies that name no accounts, so a comment POST is unconstrained', () => {
    expect(extractRequestAccountIds({ text: 'nice post' })).toEqual([]);
    expect(extractRequestAccountIds(null)).toEqual([]);
    expect(extractRequestAccountIds('not an object')).toEqual([]);
    expect(extractRequestAccountIds([1, 2])).toEqual([]);
  });

  it('stringifies unrecognized entries rather than unwrapping them — an id it cannot read must FAIL CLOSED', () => {
    // An object entry becomes "[object Object]", which is in nobody's owned set,
    // so the request is denied. Unwrapping ids out of objects would be a
    // widening of what gets ALLOWED.
    const ids = extractRequestAccountIds({ accounts: [{ id: THEIRS }] });
    expect(ids).toEqual(['[object Object]']);
    expect(firstUnownedAccountId(ids, OWNED)).toBe('[object Object]');
  });
});

describe('firstUnownedAccountId', () => {
  it('names the offending account so the denial is attributable', () => {
    expect(firstUnownedAccountId([MINE, THEIRS], OWNED)).toBe(THEIRS);
  });

  it('returns null when every id is owned, and for the vacuous empty case', () => {
    expect(firstUnownedAccountId([MINE, ALSO_MINE], OWNED)).toBeNull();
    expect(firstUnownedAccountId([], OWNED)).toBeNull();
  });
});
