// Resolve the caller's profile for a Donny turn.
//
// Internal-only AIOS users (account_scope='internal', the stakeholder-invite flow)
// have NO consumer `profiles` row by design — handle_new_user skips it. The donny-chat
// handler used to load the profile with `.single()` and `throw "Profile not found"` on
// zero rows, which blocked internal-only users from Internal Donny entirely. On the
// internal surface we synthesize a minimal profile instead; consumer callers still must
// have a real profile (a missing one there is a genuine error). Pure (no Deno/global
// deps) so it is unit tested under vitest.

export type DonnyProfile = {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export function resolveDonnyProfile(opts: {
  profile: DonnyProfile | null;
  internalMode: boolean;
  userId: string;
  /** Optional display name (e.g. from auth.users) for an internal-only caller. */
  fallbackName?: string | null;
}): DonnyProfile {
  if (opts.profile) return opts.profile;
  if (!opts.internalMode) throw new Error("Profile not found");
  return {
    id: opts.userId,
    role: null,
    full_name: opts.fallbackName ?? null,
    email: null,
    avatar_url: null,
  };
}
