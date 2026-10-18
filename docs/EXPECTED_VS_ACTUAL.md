# Pre-Registered Expectations vs Actual Outcomes

This document records the empirical results of status page evaluations conducted during development, comparing the pre-registered predictions from `fixtures/EXPECTED.md` with observed behavior.

---

## Comparison Table

| Fixture Page | Pre-Registered Outcome | Empirical Settle / Model Result | Gate Fired | Match Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `status-s0-operational.md` | `NO_PAY` | `NO_PAY` | `PAGE_UNCHANGED` | **MATCH** | When settled against policy purchased on s0, `buy_norm_hash16 == curr_norm_hash16` triggers immediate `NO_PAY` without LLM invocation. |
| `status-s1-outage-75.md` | `PAY_100` | `PAY_100` | None (Judged) | **MATCH** | Status `OUTAGE`, duration 75 minutes >= `min_full` (60), quote verified verbatim. |
| `status-s2-outage-35.md` | `PAY_50` | `PAY_50` | None (Judged) | **MATCH** | Status `OUTAGE`, duration 35 minutes >= `min_half` (30), quote verified verbatim. |
| `status-s3-outage-20.md` | `NO_PAY` | `NO_PAY` | None (Judged) | **MATCH** | Status `OUTAGE`, duration 20 minutes < `min_half` (30). Does not reach threshold. Policy remains `ACTIVE`. |
| `status-s4-degraded-90.md` | `PAY_25` | `PAY_25` | None (Judged) | **MATCH** | Status `DEGRADED`, duration 90 minutes >= `min_full` (60). Payout 25%. |
| `status-s5-operational-reformatted.html` | `NO_PAY` | `NO_PAY` | None (Judged) | **MATCH** | HTML format normalized cleanly; status `OPERATIONAL` yields `NO_PAY`. |
| `status-s6-injection.md` | `REVIEW` | `REVIEW` | `TRIPWIRE` | **MATCH** | Injection tripwire detected trigger `"automated reviewers"`, immediately forcing safe `REVIEW` without model payout. |
| `status-s7-no-duration.md` | `REVIEW` | `REVIEW` | `PARSE_FAILURE` / Quote Check | **MATCH** | Outage without explicit minutes duration falls back to safe `REVIEW` (zero payout). |
| `status-s8-already-down.md` | `USER_ERROR (BUY REFUSED)` | `USER_ERROR` | Buy Gate | **MATCH** | Buy transaction check evaluates page; status not `OPERATIONAL` raises UserError `event already in progress or status unclear at purchase`. |
| `status-s9-too-short.md` | `USER_ERROR (PAGE UNREADABLE)` | `USER_ERROR` | Length Gate | **MATCH** | Cleaned text under 200 characters raises UserError `page unreadable`. |
