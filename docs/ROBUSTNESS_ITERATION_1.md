# Robustness Plan - Iteration 1

## 1. Reason for Prompt Iteration 1
In the initial baseline run (Iteration 0), fixture `status-s4-degraded-90.md` achieved only 7/10 matches against the pre-registered `PAY_25` outcome (failing the 9/10 pass rule).
Root cause analysis of the 3 misses revealed:
- The model extracted `status: "DEGRADED"` and `minutes: 90`, but selected an truncated quote `"Status: Degraded performance."` that omitted the duration clause `"Duration: 90 minutes."`.
- Because the quote lacked the duration integer `90`, `number_in_quote("Status: Degraded performance.", 90)` returned `False`, safely routing the evaluation to `REVIEW` instead of `PAY_25`.
- Additionally, on `status-s7-no-duration.md`, the model attempted to calculate minutes (extracting 150) from start/end times even though no duration was explicitly stated on the page.

## 2. Iteration 1 Refinement
To resolve this without altering any parsing rules, gates, or deterministic python logic:
- The instruction prompt is clarified:
  `"Extract the status of the single current incident block and the stated duration in minutes. The quote must be copied character-for-character from the page text and MUST include both the stated status and the stated duration number (if minutes > 0). If no explicit duration in minutes is stated on the page, set minutes to 0."`

## 3. Pre-Registered Pass Rule
- Strict JSON parse success: 10 / 10 runs per page.
- Pre-registered outcome match: >= 9 / 10 runs per page.
- Tested across the full suite of fixtures.
