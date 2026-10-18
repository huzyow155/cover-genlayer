# Cover: Parametric Dependency Cover on GenLayer Studionet

> **Status: Preview (studionet)**

Cover is an intelligent contract on GenLayer that provides algorithmic, oracle-free parametric cover for software dependencies that publish their operational health on public web pages.

An underwriter creates a **PRODUCT** defining a status page URL, a plain-words outage rule, duration thresholds, and a premium rate, and funds the product payout pool with credits. A buyer purchases a **POLICY** by paying an upfront premium for coverage. When a service disruption occurs, anyone can trigger `settle`. Independent GenLayer validators fetch the status page, extract the status and incident duration using an on-chain LLM, verify the extracted quote character-by-character against the raw web text using deterministic Python logic, apply payout thresholds, and distribute credits directly from the pool.

---

## 1. The Pitch & Mechanism

- **Algorithmic Settlement**: No claims adjusters, claim forms, or trusted third-party oracle daemons. Settlement is permissionlessly callable by any account.
- **Quote-Verified Extraction**: Model predictions must be backed by a verbatim quote located at token boundaries in the fetched page, containing the exact duration integer. Fabricated quotes or hallucinated durations safely fail to `REVIEW` with zero payout.
- **Strict Consensus Primitive**: Validators compare a single canonical consensus token:
  $$\text{Consensus Token} = \langle\text{OUTCOME}\rangle \mid \langle\text{norm\_hash16}\rangle$$
  where `OUTCOME` $\in \{\text{PAY\_100}, \text{PAY\_50}, \text{PAY\_25}, \text{NO\_PAY}, \text{REVIEW}\}$ and `norm_hash16` is the first 16 hex characters of $\text{SHA256}(\text{norm\_text}(\text{page}))$.
- **Credits Only**: All accounting is conducted using an internal credit ledger. No real currency, ERC-20 tokens, or native GEN tokens are locked.

---

## 2. Why GenLayer

Traditional blockchains (like Ethereum) cannot fetch arbitrary public HTTP web pages without centralized oracle servers. Moreover, extracting duration numbers and incident status from unstructured natural language text requires machine intelligence.

A centralized web scraper creates a single point of failure and makes the operator the sole judge of claims. On GenLayer, independent validator nodes each fetch the provider's status page directly and must reach majority agreement on the outcome token.

---

## 3. Non-Goals & Limitations

1. **Credits Only**: No real money or regulated insurance.
2. **No On-Chain Clock**: Policies do not have automated timestamp expiration; purchase-time operational checks and `PAGE_UNCHANGED` gates protect against retroactive purchases.
3. **Explicit Minutes Duration**: Status pages must state an explicit integer duration in minutes for a single incident block. Pages requiring JavaScript execution or reporting only clock timestamps fail safe to `REVIEW` or UserError.
4. **Provider-Written Pages**: Cover evaluates what the provider admits on their status page; it does not independently test network sockets.
5. **Fictional Fixtures**: Test fixtures utilize fictional provider "Nimbus Cloud" (`status.nimbus.example`).

---

## 4. Repository Structure

- `contracts/Cover.py`: Core intelligent contract (products, policies, settlements, credit ledger).
- `contracts/CoverGuard.py`: Consumer contract performing synchronous cross-contract view checks and attestations.
- `contracts/Probe.py`: Runtime probe contract for Milestone 0.
- `contracts/ProbeExtract.py`: Standalone model extraction probe contract.
- `fixtures/pages/`: Reference status page fixtures for Nimbus Cloud.
- `docs/`:
  - `PRIOR_ART.md`: Comparative landscape analysis (Etherisc, Nexus Mutual, Arbol).
  - `DESIGN.md`: Architecture, consensus token design, and security invariants.
  - `LIMITATIONS.md`: Comprehensive constraint documentation.
  - `INTEGRATION.md`: Frontend developer reference with exact schemas and receipt rules.
  - `RUNTIME_NOTES.md`: Empirical Studionet runtime probe measurements.
  - `VERIFICATION.md`: Cryptographic source verification report.
  - `ERROR_CODES.md`: Complete catalog of UserError strings.
  - `ROBUSTNESS.md`: Pre-registered robustness plan.
  - `EXPECTED_VS_ACTUAL.md`: Pre-registered vs actual outcome matrix.
- `tests/`: 23 layered unit tests covering pure helpers, star trap comparisons, mock lifecycle, and consensus agreement.
- `scripts/`: Deployment, robustness runner, facts reporting, and evidence extraction scripts.

---

## 5. Deployed Contracts on Studionet

- **Network**: GenLayer Studionet (Chain ID: 61999)
- **RPC Endpoint**: `https://studio.genlayer.com/api`
- **Probe Contract**: [`0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31`](https://explorer-studio.genlayer.com/address/0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31)
- **ProbeExtract Contract**: [`0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D`](https://explorer-studio.genlayer.com/address/0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D)
- **Fixtures Repository**: [https://github.com/huzyow155/cover-fixtures](https://github.com/huzyow155/cover-fixtures) (Pinned Commit: `92c69bc636517656b9e7ee031a503adfb2d26bb4`)

---

## 6. How to Run Tests

### Running Unit Tests
```bash
python -m unittest discover -s tests -p "test_*.py"
```

### Running the Consumer Demo
```bash
python examples/consumer/consumer_demo.py
```

### Reporting Verified Facts
```bash
node scripts/report_facts.js
```

---

## License
MIT License. Copyright (c) 2026 Hyper.
