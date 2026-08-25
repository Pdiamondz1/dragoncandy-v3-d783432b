---
title: CSP Applies To Every Redirect Hop
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-onboarding-prod-test.md]
tags: [csp, security, frontend, geolocation, testing]
---
# CSP Applies To Every Redirect Hop

A `Content-Security-Policy` `connect-src` entry authorises the host you **land on**, not
just the host you **name**. A 3xx to a different host is a new hop, and it is checked
against the same policy. Allow-listing only the first host blocks the request just as
completely as allow-listing nothing.

## The instance

`useAutoDetect` turns coordinates into a city by fetching
`https://api.bigdatacloud.net/data/reverse-geocode-client`. That host was missing from
`connect-src`, so city and country came back empty for every user who ever signed up, while
`timezone` kept working and made the hook look alive — `Intl` needs no network.

The fix added `https://api.bigdatacloud.net`. **It did not work**, and was reported as
fixed. That host answers **307 → `https://api-bdc.io`**, so the browser refused the second
hop:

```
Connecting to 'https://api-bdc.io/...' violates the following Content Security Policy
directive: "connect-src 'self' … https://api.bigdatacloud.net"
```

`detectLocation`'s `catch { return null }` swallowed the refusal, exactly as before. Found
on 2026-08-24 only because a brand-new production signup showed `timezone` set with
`city`/`country` null — the same signature the original defect had.

Closed by adding `https://api-bdc.io` as well. Check where a host actually LANDS before
trusting the URL in the source:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://api.bigdatacloud.net/...'
```

## Two instruments that lie about this

**A CSP-blocked fetch never appears in the network panel.** It is refused before a request
is made, so an empty network log reads as "the call never fired" when the truth is "the call
was refused". The first diagnosis on 2026-08-24 went down exactly that path. The **console**
is the instrument that answers it — the violation is reported there and nowhere else.

**A source-derived allow-list test is blind to redirect targets.** `cspConnectSrc.test.ts`
extracts hosts from `fetch(...)` call sites and asserts each is in `connect-src`. That is a
good guard for a NEW third-party host, and it structurally cannot see this class:
`api-bdc.io` appears nowhere in the source, because it only ever exists as a `Location`
header. It reported green while the request was blocked. The redirect target is now pinned
by hand with the reason attached — a derived guard and a hand-written one covering different
failures, kept side by side deliberately.

## Rules

- The policy must list every host in the chain, not the entry point.
- A `<meta>` CSP ships in the bundle, so it is identical in every environment — there is no
  per-environment override that could rescue production.
- When a fetch fails and the network panel is empty, read the console before concluding
  nothing was sent.
- A test that derives its expectations from source can only ever check what the source
  names. Anything the network introduces at run time needs its own assertion.

## See Also

- [[Onboarding Resume & Post-Login Routing]] — same session; the geolocation split is what
  exposed this.
- [[Honest Analytics]] — the sibling discipline: a silent `catch` that returns a default is
  where absent data becomes indistinguishable from real data.
