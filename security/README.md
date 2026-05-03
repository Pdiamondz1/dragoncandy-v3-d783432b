# DragonCandy — Security & Compliance Bundle

Three files. Read in this order:

```
security/
├── README.md                          ← This file (overview + sequencing)
├── security-audit-checklist.md        ← Pre-launch one-time audit
├── automated-monitoring-plan.md       ← Ongoing automation via DragonClaw + GH Actions
└── legal-policies.md                  ← Privacy, Terms, DMCA, FTC starter docs
```

## What this bundle covers

✅ Stripe payment integrity (webhook verification, idempotency, ledger discipline)
✅ PCI DSS SAQ A (the lightest PCI tier — what you actually need)
✅ Authentication (password rules, session mgmt, role enforcement)
✅ Supabase RLS audit (every table, every role, every policy)
✅ Data protection (encryption, backups, PII handling, deletion)
✅ FTC creator disclosure automation
✅ Content/IP/watermarking/DMCA
✅ Operational security (secrets, incident response, logging)
✅ Supply chain (npm audit, Dependabot, branch protection)
✅ Legal/policy starter templates (with strong attorney-review caveat)

## What this bundle does NOT cover

❌ GDPR (you're not serving EU)
❌ HIPAA (no health data)
❌ SOC 2 (premature for launch — typically Year 2+)
❌ Full CCPA-covered-business obligations (you're below thresholds at launch)
❌ Specific state laws beyond data breach notification basics
❌ Anything an attorney must draft (limitation of liability, arbitration clauses, indemnification)

## Verified facts driving these recommendations

- **CCPA threshold for 2026:** $26.625M revenue OR 100K+ California residents OR 50%+ data sales revenue. You're below all three at launch.
- **PCI tier for Stripe Connect Express + Stripe-hosted card collection:** SAQ A (lightest possible). Annual self-attestation via Stripe Dashboard.
- **DMCA agent registration:** $6 fee at https://dmca.copyright.gov, renews every 3 years. Required for safe harbor.
- **Anthropic API training:** Anthropic does not train on your API data per their commercial terms. Safe to send creator profiles and campaign briefs to Donny.

## Sequencing

### Pre-launch (this month):
1. Read `security-audit-checklist.md` end to end
2. Hire an attorney for 2-hour review of `legal-policies.md` (~$500–1,200)
3. Register DMCA agent (10 min, $6)
4. Work through audit checklist Sections 1, 3, 5 (CRITICAL — gates launch)
5. Work through Sections 2, 4, 6, 7, 8 (Sections 4, 6, 7, 8 can have minor gaps documented as Phase 2)
6. Publish privacy policy, terms, DMCA policy on launch day (Section 9 GO-002 through GO-004)

### Launch week:
7. Section 9 go-live checklist
8. First 5 real test transactions reconciled cleanly

### Launch + 2 weeks (Phase 1 of monitoring):
9. Ship payment integrity jobs (J-001, J-002, J-003)

### Launch + 4 weeks (Phase 2):
10. Ship compliance & audit jobs (J-005, J-006, J-007, J-008, J-014, J-019)

### Launch + 6 weeks (Phase 3):
11. Ship operational jobs (J-004, J-009, J-010, J-011, J-012, J-013, J-015, J-016, J-017, J-018)

## Ongoing time investment

| Cadence | Time | What |
|---|---|---|
| Daily | 30 sec | Glance at Telegram for bot alerts |
| Weekly | 10 min | Review GitHub Issues from automated jobs |
| Monthly | 10 min | Access review confirmation, CCPA threshold check |
| Quarterly | 30 min | Webhook secret rotation, pen test review |
| Annually | 30 min | PCI SAQ A renewal via Stripe Dashboard |

**Total: ~1.5 hours/month of Dame's attention. That's the bottleneck removal.**

## Costs at a glance

| Item | One-time | Annual |
|---|---|---|
| Attorney review | $1,500–3,500 | — |
| DMCA agent registration | $6 | — |
| Domain privacy / registered agent | — | $50–150 |
| Cyber liability + professional liability insurance | — | $500–2,000 |
| Termly/Iubenda (optional policy generator) | — | $240–480 |
| Sentry (error monitoring, free tier covers Year 1) | — | $0 |
| UptimeRobot (free tier covers Year 1) | — | $0 |
| Automated monitoring infra (DragonClaw repurposed) | — | ~$300 |
| **Total launch budget** | **~$1,500–3,500** | **~$1,000–3,000** |

## What this bundle is NOT a substitute for

- An attorney
- A penetration test by qualified third party (consider Year 2 once you have funding/revenue to support it)
- A SOC 2 audit (Year 2+ when enterprise customers ask)
- Cyber insurance (buy now regardless)

## Drop location

Place this bundle at: `C:\Users\dwill\Documents\Claude\Projects\DragonCandy App\security\`

Then commit:
```bash
cd "C:\Users\dwill\Documents\Claude\Projects\DragonCandy App"
git add security/
git commit -m "Add security & compliance bundle"
```
