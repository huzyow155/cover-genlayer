# Prior Art Analysis: Parametric Protection and Settlement Oracles

This document compares **Cover** with existing decentralized parametric insurance protocols, oracle systems, and smart contract designs.

---

## 1. Landscape Overview

Parametric insurance models replace manual claims adjusters with deterministic, verifiable triggers. In traditional Web3 implementations, triggers rely either on numeric price feeds (e.g., Chainlink feeds for depeg cover) or specialized external APIs (e.g., weather stations for crop cover).

### Existing Projects Analyzed:
1. **Etherisc**: Generic framework for decentralized insurance applications (flight delay, hurricane). Uses centralized/multisig oracle workers querying flight databases via FlightStats API.
2. **Nexus Mutual**: Discretionary mutual for smart contract hack and technical risk. Claims assessment is handled via human member voting (staking capital on claim votes), rather than programmatic status evaluation.
3. **Arbol**: Institutional climate risk platform. Settles parametric weather risk using weather satellite and NOAA datasets through smart contracts.
4. **Chainlink Functions**: Serverless runtime allowing smart contracts to request off-chain web data. However, off-chain computation runs in isolated JavaScript sandboxes where each node must make identical JSON HTTP calls; unstructured natural language analysis requires calling external third-party AI APIs with associated API keys, which cannot achieve deterministic consensus over raw web text.
5. **UMA (Optimistic Oracle)**: "Propose and dispute" oracle. Uses human disputers with financial bonds to verify whether an arbitrary text statement occurred in the real world. Settlements require a multi-day dispute window.

---

## 2. The Single Closest Existing Protocol: Etherisc Flight Delay

The single closest existing project in Web3 is **Etherisc Flight Delay** (`FlightDelayClerk` / `FlightDelayOracle`).

### Mechanism Comparison:
- **Etherisc**: A traveler purchases flight delay cover. An off-chain oracle service periodically polls a proprietary aviation database API (FlightStats). When the flight status API returns delay minutes > 45, the oracle pushes a transaction on-chain to trigger an automated payout.
- **Cover**: An underwriter creates a cover pool against a public dependency status page (e.g. Nimbus Cloud). A buyer buys coverage. When the service goes down, anyone can call `settle`. GenLayer validators directly fetch the public HTTP web page, use an on-chain LLM to extract incident status and duration, verify the extracted quote character-by-character against the raw web text using deterministic Python string functions, and execute the payout directly in the same block.

---

## 3. Honest Difference Table

| Feature / Property | Etherisc (Flight Delay) | Cover (GenLayer Intelligent Contract) |
| :--- | :--- | :--- |
| **Data Source** | Specialized, structured JSON API behind commercial API keys (FlightStats). | Public, free-form HTML/Markdown status pages published by the provider. |
| **Parsing Mechanism** | Hardcoded JSON field extractor in off-chain worker node. | Hybrid: GenLayer LLM extracts status & duration; deterministic Python code verifies verbatim quote boundaries. |
| **Trust Model** | Relies on the trusted oracle operator running the off-chain scraper without censorship. | Trustless consensus: multiple independent GenLayer validators fetch the URL and must agree on the consensus token `<OUTCOME>\|<norm_hash16>`. |
| **Quote Verification** | None. Assumes oracle reports authentic numbers. | Verbatim quote check: quote must match normalized page text at token boundaries, and the stated duration integer must be inside the quote. |
| **Adversarial Resilience** | Vulnerable if API changes schema or returns unexpected status codes. | Hardened multi-layer defense: input byte caps, injection tripwires, duplicate JSON key rejection, conservative fail-safe to `REVIEW`. |
| **Settlement Trigger** | Off-chain daemon or cron job. | Permissionless: any account can invoke `settle(policy_id)` at any time. |
| **Cross-Contract Integration** | Dedicated callback contracts or token transfers. | Synchronous cross-contract view calls via `CoverGuard` (`is_covered`, `is_covered_for`, `attest`). |
| **Asset Type** | Real cryptocurrency (ETH, DAI). | Internal demo credit ledger. No real money or tokens locked. |
| **Trigger Specificity** | Numeric flight delay minutes from a structured schema. | Natural language incident blocks requiring an explicit duration in minutes. |
| **Dispute / Resolution Window** | Instant upon oracle post or subject to multisig dispute. | Resolved synchronously during transaction consensus (~20-40 seconds). |

---

## 4. Honest Trade-Offs

1. **Credits vs Real Money**: Etherisc handles real economic risk with ERC-20 tokens. Cover deliberately runs as an internal credit ledger without financial liability.
2. **Provider-Authored Dependency**: If a service provider experiences a silent outage and refuses to update their status page, Cover cannot trigger a payout. Cover covers *acknowledged* outages, not unacknowledged network anomalies.
3. **Duration Formatting Requirement**: Cover requires an explicit integer duration in minutes. Status pages that only state start and end times without duration minutes are routed to `REVIEW`.
4. **Latency and Compute Cost**: Fetching web pages and executing LLM inference inside validator consensus takes ~20-35 seconds per judged write, compared to simple EVM state updates.
