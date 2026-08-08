import { describe, it, expect } from "vitest";
import { authorizeNotify, type NotifyAuthzInput } from "./authz";

const CREATOR = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const input = (over: Partial<NotifyAuthzInput>): NotifyAuthzInput => ({
  event: "submission",
  isIngest: false,
  callerId: CREATOR,
  post: { creator_id: CREATOR, target_org_id: ORG },
  callerOrgIds: [],
  ...over,
});

describe("authorizeNotify — the trusted backend", () => {
  it("allows every event, including boost_paid", () => {
    for (const event of ["submission", "boost_paid", "declined"]) {
      expect(authorizeNotify(input({ event, isIngest: true, callerId: null, post: null })))
        .toEqual({ ok: true });
    }
  });
});

describe("authorizeNotify — boost_paid is service-role only", () => {
  // The regression that mattered: anon key + body-chosen creator_id + body-chosen amount
  // => the platform's own AI tells any user they were paid $N.
  it("denies an anonymous caller", () => {
    const r = authorizeNotify(input({ event: "boost_paid", callerId: null, post: null }));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("denies even a legitimately authenticated user", () => {
    const r = authorizeNotify(input({ event: "boost_paid", callerId: CREATOR, post: null }));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("denies the post's own creator — ownership does not make it a payer", () => {
    const r = authorizeNotify(input({ event: "boost_paid", callerId: CREATOR }));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("authorizeNotify — submission", () => {
  it("allows the post's creator", () => {
    expect(authorizeNotify(input({}))).toEqual({ ok: true });
  });

  it("denies a different authenticated user", () => {
    expect(authorizeNotify(input({ callerId: STRANGER })))
      .toMatchObject({ ok: false, status: 403 });
  });

  it("denies an anonymous caller with 401, not 403", () => {
    expect(authorizeNotify(input({ callerId: null })))
      .toMatchObject({ ok: false, status: 401 });
  });

  it("denies a missing post as 403, not 404 — no existence oracle", () => {
    // Must match the not-the-creator status exactly, or the pair distinguishes
    // "this post id exists" from "it does not" for any authenticated prober.
    const missing = authorizeNotify(input({ post: null }));
    const notMine = authorizeNotify(input({ callerId: STRANGER }));
    expect(missing).toMatchObject({ ok: false, status: 403 });
    expect((missing as { status: number }).status).toBe((notMine as { status: number }).status);
  });
});

describe("authorizeNotify — declined", () => {
  it("allows an active member of the post's target org", () => {
    expect(authorizeNotify(input({ event: "declined", callerId: OWNER, callerOrgIds: [ORG] })))
      .toEqual({ ok: true });
  });

  it("denies a member of a DIFFERENT org", () => {
    expect(
      authorizeNotify(input({ event: "declined", callerId: OWNER, callerOrgIds: [OTHER_ORG] })),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("denies a user with no active membership (invited/removed resolve to an empty list)", () => {
    expect(authorizeNotify(input({ event: "declined", callerId: OWNER, callerOrgIds: [] })))
      .toMatchObject({ ok: false, status: 403 });
  });

  it("denies when the post has no target org rather than defaulting open", () => {
    expect(
      authorizeNotify(
        input({
          event: "declined",
          callerId: OWNER,
          post: { creator_id: CREATOR, target_org_id: null },
          callerOrgIds: [ORG],
        }),
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("does NOT let the creator decline their own post on the creator_id check", () => {
    // submission and declined must not share an ownership rule — the creator is not the business.
    expect(authorizeNotify(input({ event: "declined", callerId: CREATOR, callerOrgIds: [] })))
      .toMatchObject({ ok: false, status: 403 });
  });
});

describe("authorizeNotify — unknown events fail closed", () => {
  it("rejects an event string outside the union", () => {
    expect(authorizeNotify(input({ event: "__probe__", callerId: CREATOR })))
      .toMatchObject({ ok: false, status: 400 });
  });
});
