# Cover Limitations

This document is maintained as part of Step 0 and updated across development milestones.
It records design trade-offs, scope boundaries, and operational constraints of the Cover intelligent contract.

---

## 1. Credit Ledger Model (No Real Money)
- **Credits Only**: All balances, premiums, pool reserves, and settlement payouts are recorded on an internal contract ledger.
- **No Token Locks**: No ERC-20, native GEN tokens, or real assets are escrowed, transferred, or locked by the contract.
- **Not Regulated Insurance**: Cover is a computational experiment demonstrating autonomous, multi-validator parametric settlement on GenLayer. It does not constitute an insurance policy, warranty, or financial product.

## 2. Status Page Constraints and Trust Model
- **Provider-Authored Data**: Cover evaluates the public status page authored by the dependency provider. Cover verifies whether the provider *admitted* an outage in text; it does not independently probe the provider's infrastructure or network ports.
- **Single Incident Block with Explicit Minutes**: The contract parser is designed to extract an explicit integer duration stated in minutes (e.g. "Duration: 75 minutes") for a single current incident. Status pages that only report ISO timestamps, clock times (e.g. "10:15 UTC to 11:30 UTC"), or multi-incident tables without duration fail safe to `REVIEW` with zero payout.
- **JavaScript and Dynamic Rendering Unsupported**: GenLayer validators fetch raw HTTP responses via `gl.nondet.web.get`. Pages that require client-side JavaScript execution (SPAs), authentication cookies, CAPTCHAs, or headless browsers are unsupported and will trigger fetch/length UserErrors.
- **English-First Language Task**: Incident extraction prompts are formatted in English. Non-English status pages may produce unparseable responses or tripwires, triggering safe `REVIEW`.

## 3. Policy Lifecycle and Timing Boundaries
- **No On-Chain Clock**: GenVM on studionet does not expose a real-time block timestamp. Consequently, Cover policies do not have an automated expiration timestamp or waiting period.
- **Buy-Time Gate Protection**: Protection against retroactive claims (buying cover during an ongoing incident) is enforced by the buy-time validator check, which reads the current status page and refuses purchase if status is not `OPERATIONAL`.
- **Page-Changed Gate**: If `settle` is called when the page text has the exact same normalized hash as recorded at purchase time (`buy_norm_hash16`), Cover immediately resolves to `NO_PAY` without invoking the LLM.
- **No Premium Refund on Cancellation**: If a policyholder invokes `cancel`, the policy enters `CANCELLED` status and unreserves coverage, but the upfront premium is retained in the underwriter pool.
- **Multiple Settlement Attempts**: A settlement yielding `NO_PAY` or `REVIEW` leaves the policy in `ACTIVE` status so that genuine subsequent outages can be settled. However, repeated identical observations (same policy ID and normalized page hash) are rejected with a duplicate observation UserError.

## 4. Underwriter Privileges (update_source)
- **Source URL Updates**: The contract allows the product creator (underwriter) to call `update_source` to point to a new status page URL, provided the parsed host and directory path match the immutable terms hash. This allows tracking moving status feeds or archive paths, but represents an underwriter trust boundary: the underwriter designates which path represents the living status feed. Every settlement records the exact URL used.

## 5. Model Variance and Consensus Threshold
- **Multi-Validator Majority Consensus**: Non-deterministic execution runs across independent GenLayer validators. By comparing only the strict consensus token `<OUTCOME>|<norm_hash16>`, validators remain unaffected by minor differences in leader-extracted quotes or explanation phrasing.
- **Conservative Fail-Safe**: Any model hallucination, unparseable output, duplicate JSON keys, or injection trigger safely collapses to `REVIEW` (zero payout, policy remains active).
