import { createMcpClient, type McpClient, type McpToolDefinition, type McpToolResult } from "./mcp-client.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SOCIAL_TOOLS,
  filterToolsByTier,
  namespaceTools,
  buildForwardedArgs,
} from './outstand-mcp-tools.ts';
import { proxyRequestFor, requiresUpstream } from './outstand-mcp-paths.ts';
import { fetchActiveAccounts, resolveAccount } from './outstand-accounts.ts';
import {
  buildDraftCard,
  draftToolResult,
  disambiguationResult,
  noAccountResult,
  accountsUnavailableResult,
  missingScheduledAtResult,
  type SocialDraftCard,
} from './social-draft.ts';
import { summarizePerformance, type PerfRow } from './social-analytics.ts';
import { assessSignal, unattributableSignal } from './social-signal.ts';
import { stripAccountIds, stripAccountIdsFromMcpContent } from './strip-account-ids.ts';

interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
  /**
   * The caller's OWN Supabase session Authorization header, forwarded verbatim.
   *
   * outstand-proxy authenticates with auth.getUser() on an anon client, so it
   * needs a user JWT. This used to send SUPABASE_SERVICE_ROLE_KEY, which
   * resolves to no user — every social_* call in this function's history died
   * at 401 before any account logic ran.
   *
   * donny-orchestrator only supplies this on its Supabase-session branch. On
   * the OAuth-token branch there is no forwardable JWT, so no bridge is built
   * and no social tool is offered.
   *
   * Optional because some callers legitimately have no user session at all —
   * donny-auto-pilot is a cron (gated on a shared x-cron-secret, not a signed-in
   * user) iterating many users with a service-role client. It has no JWT to
   * forward and never will. Rather than inventing a second rule for that case,
   * callTool applies the same one donny-orchestrator's OAuth branch already
   * uses: no forwardable user JWT ⇒ refuse the proxy call instead of sending
   * one that cannot authenticate.
   */
  authHeader?: string;
}

export interface OutstandMcpBridge {
  tools: McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  /** Cards produced by the last callTool, for the orchestrator to collect. */
  takeCards(): SocialDraftCard[];
  /**
   * Whether this caller held at least one ACTIVE account when the bridge was
   * built. Reported, not enforced — what to do about it is the caller's
   * policy, and the two callers legitimately differ:
   *
   * - `donny-auto-pilot` is a cron with nothing to report on, so it skips.
   * - `donny-orchestrator` must NOT skip: the user is asking, and the honest
   *   refusal `callTool` already returns is the whole point.
   *
   * This used to be a hard `return null` here, which quietly made the
   * orchestrator's zero-account handling unreachable — the tools were never
   * offered, so the model could never call one, so the branch meant to count
   * that population never ran. Found by Codex.
   */
  hasConnectedAccount: boolean;
  disconnect(): void;
}

// A caller-safe reason derived from what actually happened. Donny has told a
// user their accounts "may not be connected" while an active row sat in the
// table — three times. He relays this instead of inventing a cause. No raw
// provider text, no ids.
function safeReason(status: number): { error: string; reason: string } {
  if (status === 401 || status === 403) {
    return {
      error: 'not_authorized',
      reason: 'That account could not be read with this session. Say so plainly; do not guess why.',
    };
  }
  if (status === 404) {
    return {
      error: 'not_found',
      reason: 'The connected account was not found upstream. Say so plainly; do not guess why.',
    };
  }
  return {
    error: 'upstream_error',
    reason: `The social service returned an error (${status}). Say so plainly; do not guess why.`,
  };
}

export async function createOutstandMcpBridge(config: OutstandMcpConfig): Promise<OutstandMcpBridge | null> {
  // "Does this user hold at least one ACTIVE account" is REPORTED, not enforced
  // — see hasConnectedAccount above for why the two callers differ. It uses the
  // same reader resolveAccount does rather than a second, drifted one. The
  // function that used to answer this (a) swallowed a Postgrest error via
  // `const { data }` with no error check — supabase-js v2 RESOLVES rather than
  // rejects on a query error, so a transient failure silently produced `[]` and
  // donny-orchestrator told the user "No social account is connected to this
  // account yet", a confident false claim. Adding the error check was only half
  // of that fix and this comment claimed the whole of it: the checked version
  // still returned `[]`, so the false claim survived, just no longer silently.
  // fetchActiveAccounts now returns an explicit `{ ok: false }` a caller cannot
  // mistake for emptiness — and (b) filtered
  // `.neq('status', 'revoked')`, which counts an `error`-status row as usable.
  // Verified on prod: user 7cc82738 holds 2 `error` + 2 `revoked` + 0 `active`,
  // so the old gate offered all four tools to someone none of them could serve.
  const lookup = await fetchActiveAccounts(config.supabase, config.userId);

  const mcpUrl = Deno.env.get("OUTSTAND_MCP_URL");
  const apiKey = Deno.env.get("OUTSTAND_API_KEY");
  if (!apiKey) return null;

  let client: McpClient | null = null;
  let rawTools: McpToolDefinition[];

  if (mcpUrl) {
    try {
      client = await createMcpClient(mcpUrl, apiKey);
      rawTools = await client.listTools();
    } catch {
      console.warn('[outstand-mcp] MCP server unavailable, using REST fallback');
      rawTools = SOCIAL_TOOLS;
    }
  } else {
    rawTools = SOCIAL_TOOLS;
  }

  // A remote MCP server's list is NOT a permission to offer a tool, and its
  // SCHEMA is not authoritative either — both buildForwardedArgs' allow-list
  // and RESOLUTION_ONLY_KEYS (outstand-mcp-tools.ts) enforce against OUR
  // schema (SOCIAL_TOOLS), not whatever the remote declares. If the model
  // were shown the remote's own property set instead, a field it forwards
  // that we don't allow-list on our side would silently vanish before
  // reaching the provider — and, concretely, the `handle` disambiguation
  // property (outstand-accounts.ts) exists only in SOCIAL_TOOLS, so a
  // remote-schema-driven tool list would never advertise it, reopening the
  // same ask-loop this fix exists to close. Task 3 already established the
  // "never trust the remote's tool NAMES" rule (dropped three tools with no
  // backing operation); this uses the remote list ONLY to decide which
  // names are actually supported upstream, then substitutes our own
  // definition for every field of the offered schema.
  //
  // The intersection binds ONLY upstream-backed tools (requiresUpstream —
  // today just get_account_metrics). The other three are answered entirely
  // here: create_post/schedule_post build a draft card and never call out,
  // get_post_analytics reads our own content_performance. Their availability
  // is a fact about THIS code, so a remote server that advertises a different
  // vocabulary must not be able to veto them — that would hide three working
  // tools the first time OUTSTAND_MCP_URL points somewhere new, which is the
  // same "offered ≠ implemented" mismatch as the three dropped tools, just
  // pointing the other way.
  const supportedNames = new Set(rawTools.map((t) => t.name));
  rawTools = SOCIAL_TOOLS.filter((t) => !requiresUpstream(t.name) || supportedNames.has(t.name));

  const namespacedTools = namespaceTools(filterToolsByTier(rawTools, config.orgTier));

  const proxyUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/outstand-proxy";

  let pendingCards: SocialDraftCard[] = [];

  return {
    tools: namespacedTools,
    // False when the read FAILED as well as when the caller genuinely holds
    // none — a deliberate collapse, safe only because of where this value is
    // consumed. It drives one decision, auto-pilot's `continue`, and skipping
    // is the correct action under both facts: a cron that cannot read the
    // account list cannot fetch metrics either, and would otherwise feed an
    // error into Claude and generate a digest out of it. No user-facing claim
    // is ever derived from this. The claim path is callTool, which resolves
    // fresh per call and distinguishes the two cases there — see the
    // `lookup.ok` guard below.
    hasConnectedAccount: lookup.ok && lookup.accounts.length > 0,

    takeCards() {
      const out = pendingCards;
      pendingCards = [];
      return out;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const rawName = name.replace(/^social_/, "");

      // get_post_analytics MUST run before account resolution below, and
      // stay above it. It reads content_performance filtered on user_id
      // alone — it never resolves an account, and its schema (see
      // outstand-mcp-tools.ts) carries no `platform`/account property at
      // all. Every other branch resolves an account first and can hand back
      // a "which account?" disambiguation; this tool has no field the model
      // could use to answer that question, so a caller with 2+ active
      // accounts would dead-end here forever — an infinite ask-loop, not a
      // usability wrinkle. Do NOT "tidy" this back down below resolution:
      // create_post/schedule_post/get_account_metrics genuinely need an
      // account, this one deliberately does not.
      if (rawName === 'get_post_analytics') {
        const days = typeof args.days === 'number' && args.days > 0 ? Math.floor(args.days) : 30;
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        // Own rows only. config.supabase is service-role in the orchestrator,
        // so the user_id filter IS the tenant boundary here — it is not
        // enforced by RLS on this client.
        //
        // THE VERIFIED GATE. `verified_at` is stamped only by server-side code,
        // from a signed Outstand event; an unstamped social_post_log row is
        // client-asserted, and its outstand_post_id was never checked against
        // anything. Both existing readers of this table already apply this
        // filter — content-performance-capture/index.ts:94-104 to decide what
        // is worth measuring, and the Analytics page
        // (src/hooks/outstand/usePostPerformance.ts:64-72) to decide what is
        // worth showing — so Donny reading it ungated would answer a question
        // differently from the screen sitting next to him.
        //
        // Concretely: prod holds 9 legacy rows for 3 posts, 6 of them all-zero
        // measurements the pre-fix capture job wrote whenever the provider
        // returned nothing, and NONE of the 9 verified. Ungated, Donny states
        // those zeros as measured fact — and worse, they clear the sample-size
        // gate, so the answer arrives with no caveat at all. A gate that counts
        // unverifiable rows toward its own sample is a gate that lies while
        // looking rigorous.
        //
        // `!inner` makes the embed a filter rather than a nullable join; the
        // .not() is still required, because !inner only proves the joined row
        // exists, not that it is stamped.
        const { data, error } = await config.supabase
          .from('content_performance')
          .select(
            'outstand_post_id, platform, views, likes, comments, shares, engagement_rate, milestone, social_post_log!inner(verified_at)',
          )
          .eq('user_id', config.userId)
          .not('social_post_log.verified_at', 'is', null)
          .gte('captured_at', since);

        if (error) {
          console.error('[outstand-mcp] performance read failed:', error.message);
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'performance_unavailable', reason: 'Performance data could not be read. Say so plainly; do not guess why.' }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: summarizePerformance((data ?? []) as PerfRow[]) }],
        };
      }

      // Resolved fresh per call, from the authenticated user. The model never
      // sends an id, so there is nothing to validate and nothing to forge.
      // `handle` is the answer to a disambiguation question this same
      // function asked on a prior call (see the `many` branch below) — it is
      // consumed here, by resolveAccount, and MUST NOT be part of what
      // reaches the upstream provider request (buildForwardedArgs excludes
      // it explicitly; see RESOLUTION_ONLY_KEYS in outstand-mcp-tools.ts).
      const lookup = await fetchActiveAccounts(config.supabase, config.userId);
      // A failed read is NOT zero accounts. Falling through with `[]` here
      // would resolve to `none` and tell the user their accounts are not
      // connected — the original complaint, re-created by a database blip.
      if (!lookup.ok) {
        return { content: [{ type: 'text', text: accountsUnavailableResult() }], isError: true };
      }
      const platformHint = typeof args.platform === 'string' ? args.platform : null;
      const handleHint = typeof args.handle === 'string' ? args.handle : null;
      const resolution = resolveAccount(lookup.accounts, platformHint, handleHint);

      if (resolution.kind === 'none') {
        return { content: [{ type: 'text', text: noAccountResult() }], isError: true };
      }
      if (resolution.kind === 'many') {
        // Not an error: the tool did its job and needs one more fact.
        return { content: [{ type: 'text', text: disambiguationResult(resolution.accounts) }] };
      }
      const account = resolution.account;
      const accountId = account.id;

      if (rawName === 'create_post' || rawName === 'schedule_post') {
        const caption = typeof args.caption === 'string' ? args.caption : '';
        if (!caption.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ status: 'missing_caption', instruction: 'Ask the user what the post should say.' }) }],
            isError: true,
          };
        }
        // schedule_post with no usable time must refuse rather than silently
        // fall back to an unscheduled draft — this is the one path that ends
        // in an irreversible public post, so "a human will probably notice
        // the card says Draft, not Scheduled" is not the bar.
        let scheduledAt: string | null = null;
        if (rawName === 'schedule_post') {
          if (typeof args.scheduled_at !== 'string' || !args.scheduled_at.trim()) {
            return {
              content: [{ type: 'text', text: missingScheduledAtResult() }],
              isError: true,
            };
          }
          scheduledAt = args.scheduled_at;
        }

        const mediaUrls = Array.isArray(args.media_urls)
          ? args.media_urls.filter((u): u is string => typeof u === 'string')
          : [];

        // A fresh identity per draft — the once-only guard's key (CT-4b). Two
        // drafts with identical text are two drafts: the user asking again
        // after publishing is a legitimate second post, so this must NOT be a
        // hash of the content.
        const card = buildDraftCard({
          draftId: crypto.randomUUID(),
          account,
          caption,
          mediaUrls,
          scheduledAt,
        });
        const result = draftToolResult(card);
        pendingCards.push(result.card);
        return { content: [{ type: 'text', text: result.text }] };
      }

      // get_account_metrics is the only tool that reaches the client/proxy
      // dispatch below (proxyRequestFor has no route for any other tool
      // name). Its response is the provider's raw payload, which per
      // outstand-metrics-map.test.ts's captured live shape carries the
      // account's own id at top level, and it exposes an engagement RATE —
      // a comparative claim exactly like the ones get_post_analytics gates
      // (§7). The spec listed this tool as "keep, sample-size gated"; the
      // original pass gated only get_post_analytics. Both gaps close here:
      // strip ids from whatever comes back, and attach the same signal
      // verdict used above so the model is told not to lean on a rate below
      // the bar. A follower COUNT is a fact, never suppressed — only the
      // rate is caveated.
      if (rawName === 'get_account_metrics') {
        // Same verified gate as get_post_analytics above, for the same reason
        // and with more at stake: this count is ONLY ever used as a sample-size
        // bar. An unverified row contributes nothing a human could check, so
        // letting it clear the bar hands the model permission to state an
        // engagement rate as meaningful on the strength of rows nobody
        // measured. See the block above for why `!inner` and `.not()` are both
        // required.
        //
        // Scoped to the RESOLVED ACCOUNT'S PLATFORM, not the whole user. Unlike
        // get_post_analytics — which reports across everything the user has and
        // is therefore correctly user-wide — this tool answers about ONE
        // account, and its payload carries that account's engagement rate. A
        // user-wide count lets five measured Instagram posts certify a YouTube
        // rate: the gate would be about a different thing than the claim.
        // Platform is the finest grain available (content_performance records a
        // platform, never an account id) and the vocabularies match — verified
        // on prod 2026-08-09, all three tables use lowercase provider names
        // (instagram/youtube/facebook). If they ever diverge this returns 0 and
        // caveats, which is the safe direction.
        const { data: perfRows, error: perfError } = await config.supabase
          .from('content_performance')
          .select('outstand_post_id, social_post_log!inner(verified_at)')
          .eq('user_id', config.userId)
          .eq('platform', account.platform)
          .not('social_post_log.verified_at', 'is', null);
        if (perfError) {
          // Mirror get_post_analytics above: a read failure must say so, not
          // silently fall through as `postCount = 0`. Otherwise a transient
          // or RLS-drift failure reads identically to "this user genuinely
          // has 0 measured posts" — more caution than a false claim, but it
          // would mask a real, ongoing read failure indefinitely.
          console.error('[outstand-mcp] performance read failed (metrics gate):', perfError.message);
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'performance_unavailable', reason: 'Performance data could not be read. Say so plainly; do not guess why.' }) }],
            isError: true,
          };
        }
        // Same dedup as summarizePerformance: a post yields one row per
        // milestone, so counting raw rows would clear the bar off one post.
        const postCount = new Set(
          (perfRows ?? [])
            .map((r: { outstand_post_id: string | null }) => r.outstand_post_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ).size;
        // Platform is as fine as this table goes, so two connected accounts on
        // ONE platform share the count above and it cannot be attributed to
        // either. Refuse the signal rather than let the sibling's posts vouch
        // for this account. Latent today — no prod user holds two active
        // accounts on the same platform (checked 2026-08-09) — but it is
        // exactly the case handle-disambiguation exists for, so it will happen.
        const sharesPlatform =
          lookup.accounts.filter(
            (a) => (a.platform ?? '').toLowerCase() === (account.platform ?? '').toLowerCase(),
          ).length > 1;
        const verdict = sharesPlatform
          ? unattributableSignal(postCount)
          : assessSignal(postCount);

        let raw: unknown;
        if (client) {
          // Model-supplied args are forwarded through an ALLOW-LIST derived
          // from this tool's own schema (buildForwardedArgs), never a raw
          // `...args` spread. This is a request WE wrote, so "the accepted
          // fields" is a fact, not a guess, the way the response shape below
          // is the provider's. account_id is always the server-resolved
          // one; no schema declares that key, so it can never be shadowed
          // by an allow-listed field or by a model-emitted alternate
          // selector (social_account_id, socialAccountId, accounts,
          // social_account_ids — see outstand-post-authz.ts's
          // extractRequestAccountIds for the exact set the provider
          // ecosystem treats as account selectors) reaching this org-wide-
          // authenticated upstream call.
          const forwardedArgs = buildForwardedArgs(rawName, args, accountId);
          const clientResult = await client.callTool(rawName, forwardedArgs);

          // Strip BEFORE branching on isError, and strip the CONTENT, not
          // just top-level keys: the standard MCP shape (mcp-client.ts) puts
          // the actual payload as a JSON-encoded STRING inside
          // content[].text, and stripAccountIds only removes object keys —
          // it walks past that string without parsing it, so an id
          // serialized inside would survive untouched. stripAccountIdsFromMcpContent
          // parses each text field as JSON, strips it, and re-serializes;
          // text that isn't JSON (plain prose) is returned byte-identical.
          const sanitized: McpToolResult = {
            ...clientResult,
            content: stripAccountIdsFromMcpContent(clientResult.content),
          };

          // Mirror the proxy branch's early-return-on-error below: an
          // upstream error must keep isError:true at the OUTER result so
          // donny-orchestrator's status=mcpResult.isError ? 'error' : 'success'
          // audit log stays correct, rather than getting buried inside the
          // gate-wrapped `data` field of a result that reads as success.
          //
          // Still key-stripped too, not returned verbatim: mcp-client.ts's
          // own error path forwards the upstream res.text() BODY straight
          // into content[0].text, so an error result can echo the same raw
          // provider payload — and the same account id — as a success one.
          // Unlike the REST branch's error return (safeReason(), a fully
          // synthetic string with nothing to leak), this one carries real
          // upstream content and must go through the same blocklist walk.
          if (sanitized.isError) return stripAccountIds(sanitized) as McpToolResult;
          raw = sanitized;
        } else {
          const req = proxyRequestFor(rawName, accountId);
          if (!req) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'unsupported_tool' }) }],
              isError: true,
            };
          }
          if (!config.authHeader) {
            // No user session to act on behalf of (e.g. the donny-auto-pilot
            // cron). Refusing here is the same rule donny-orchestrator applies
            // on its OAuth branch: a proxy call needs a user JWT, so without
            // one we say so rather than sending a request we know cannot
            // authenticate.
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'no_user_session', reason: 'This account read needs a signed-in session. Say so plainly; do not guess why.' }) }],
              isError: true,
            };
          }
          // Path-addressed, on the CALLER's credential. The old request sent
          // {action} in the body over the service-role key and also carried
          // an x-outstand-user-id header nothing in supabase/functions/ read.
          const res = await fetch(`${proxyUrl}${req.path}`, {
            method: req.method,
            headers: {
              Authorization: config.authHeader,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            return { content: [{ type: 'text', text: JSON.stringify(safeReason(res.status)) }], isError: true };
          }
          raw = await res.json();
        }

        // Never an allow-list — this endpoint has never once returned
        // successfully, so a field list would be a guess that could empty
        // the tool the first time it does. Recursive blocklist walk instead.
        const data = stripAccountIds(raw);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              data,
              has_signal: verdict.hasSignal,
              caveat: verdict.caveat,
              instruction: verdict.hasSignal
                ? 'A follower count is a fact; state it normally. There is enough measured-post sample to also state the engagement rate.'
                : `${verdict.caveat} A follower count is a fact and may still be stated; do not name the engagement rate as meaningful.`,
            }),
          }],
        };
      }

      // No other tool reaches here — create_post/schedule_post/
      // get_post_analytics/get_account_metrics are all handled above. Kept
      // as a defined fallback rather than an assert so a future tool added
      // to SOCIAL_TOOLS without its own branch fails honestly (unsupported)
      // instead of silently returning undefined.
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'unsupported_tool' }) }],
        isError: true,
      };
    },

    disconnect() {
      client?.disconnect();
    },
  };
}
