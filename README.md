# Cover: Parametric Dependency Cover on GenLayer Studionet

> **Status: Preview (studionet)**

Cover is an intelligent contract on GenLayer that provides autonomous parametric cover for software dependencies that publish their status on public web pages.

An underwriter creates a **PRODUCT** by defining a status page URL, an outage rule, duration thresholds, and a premium rate, and funds the product pool with credits. A buyer purchases a **POLICY** by paying a premium for coverage. When an outage occurs, anyone can trigger `settle`. Independent GenLayer validators fetch the web page, extract the status and incident duration with an on-chain LLM, verify the extracted quote verbatim against the page text, apply deterministic payout thresholds, and distribute credits from the pool.

---

## The Pitch
- **No Claims Adjuster**: Payouts are triggered permissionlessly when the provider's status page admits an outage meeting threshold criteria.
- **Quote-Verified Extraction**: Model predictions must be backed by a verbatim quote located at token boundaries in the fetched page, containing the exact duration integer.
- **Strict Consensus Primitive**: Validators compare a canonical consensus token `<OUTCOME>|<norm_hash16>`.
- **Credits Only**: All operations utilize an internal accounting ledger of demo credits. No real cryptocurrency or tokens are locked.

---

## Repository Structure
- `contracts/Cover.py`: Core intelligent contract managing products, policies, settlements, and credits.
- `contracts/CoverGuard.py`: Consumer contract performing synchronous cross-contract view checks and attestations.
- `fixtures/pages/`: Reference status page fixtures for fictional provider Nimbus Cloud.
- `docs/`: Complete architectural specifications, prior art analysis, limitations, runtime notes, and verification logs.
- `tests/`: Multi-layer test suite covering pure functions, user errors, naive baseline comparisons, and fuzzing.

---

## License
MIT License. Copyright (c) 2026 Hyper.
