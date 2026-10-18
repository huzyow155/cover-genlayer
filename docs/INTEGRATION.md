# Integration Guide: Cover & CoverGuard

This guide provides frontend and smart contract developers with the technical specification for integrating with `Cover` and `CoverGuard` on GenLayer studionet.

---

## 1. Network & Contract Addresses

- **Network**: GenLayer Studionet
- **Chain ID**: 61999
- **RPC Endpoint**: `https://studio.genlayer.com/api`
- **Explorer Base**: `https://explorer-studio.genlayer.com/address/<address>`
- **Client SDK**: `genlayer-js@^1.1.8`

---

## 2. Public Methods (`Cover`)

### Writes
1. `claim_demo_credits() -> str`:
   - Claims 1,000 demo credits (one claim per address).
2. `create_product(name: str, url: str, rule_text: str, min_full: int, min_half: int, premium_bps: int) -> str`:
   - Creates a cover product. Returns generated `product_id`.
3. `fund_product(product_id: str, amount: int) -> None`:
   - Underwriter deposits credits into the product payout pool.
4. `withdraw_unreserved(product_id: str, amount: int) -> None`:
   - Creator withdraws unreserved credits from the pool (`amount <= pool_balance - reserved`).
5. `update_source(product_id: str, new_url: str) -> None`:
   - Updates target status page URL (host and directory path must match immutable terms).
6. `buy(product_id: str, coverage: int) -> str`:
   - Purchases cover policy. Returns generated `policy_id`.
7. `settle(policy_id: str) -> str`:
   - Anyone can call. Evaluates page and triggers payout. Returns `outcome` (`PAY_100`, `PAY_50`, `PAY_25`, `NO_PAY`, `REVIEW`).
8. `cancel(policy_id: str) -> None`:
   - Holder cancels active policy and unreserves coverage.

### Views
- `balance_of(addr: str) -> str`: Decimal string credit balance.
- `get_product(product_id: str) -> str`: JSON product record.
- `list_products(limit: int = 10) -> list[str]`: Bounded list of product JSON records (limit <= 20).
- `get_policy(policy_id: str) -> str`: JSON policy record.
- `list_policies_by_holder(addr: str, limit: int = 10) -> list[str]`.
- `list_policies_by_product(product_id: str, limit: int = 10) -> list[str]`.
- `get_settlement(settlement_id: str) -> str`: JSON settlement record.
- `pool_health(product_id: str) -> str`: Returns `{"pool_balance", "reserved", "free", "coverage_ratio_bps"}`.
- `quote_premium(coverage: int, premium_bps: int) -> str`: Pure premium calculation.
- `get_stats() -> str`: Platform counts (`total_minted`, `next_product`, etc.).
- `get_limits() -> str`: Contract parameters and thresholds.

---

## 3. Receipt Verification Rule

A write transaction is successful **only if**:
```javascript
const isSuccess = (
  (receipt.status_name === "ACCEPTED" || receipt.status_name === "FINALIZED") &&
  receipt.result_name === "MAJORITY_AGREE" &&
  receipt.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS"
);
```

When checking write transaction receipts:
```javascript
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  retries: 120,
  interval: 3000,
});
```

---

## 4. UserError Messages Reference

| Method | UserError String | Cause |
| :--- | :--- | :--- |
| `claim_demo_credits` | `already claimed demo credits` | Address has already claimed 1,000 demo credits. |
| `create_product` | `bad name` | Name length not 3-60 or contains non-ASCII characters. |
| `create_product` | `bad rule text` | Rule text length not 10-200 or contains non-ASCII characters. |
| `create_product` | `bad thresholds` | `min_full` not 2-10080 or `min_half` not in range 1 to `min_full - 1`. |
| `create_product` | `bad premium rate` | `premium_bps` not 100-5000. |
| URL Validation | `bad URL: length must be between 1 and 300 characters` | URL exceeds length limit. |
| URL Validation | `bad URL: scheme must be https` | URL scheme is not https. |
| URL Validation | `bad URL: userinfo not allowed` | URL contains username/password (`user@host`). |
| URL Validation | `bad URL: fragment not allowed` | URL contains hash fragment `#...`. |
| URL Validation | `bad URL: missing host` | URL lacks valid hostname. |
| URL Validation | `bad URL: IP literals not allowed` | URL host is an IPv4 or IPv6 address. |
| URL Validation | `bad URL: port must be 443 or omitted` | URL specifies port other than 443. |
| `update_source` | `host or directory mismatch on update_source` | New URL host or directory differs from product terms. |
| `fund_product` | `insufficient balance` | Sender does not have enough demo credits. |
| `buy` | `pool cannot cover this coverage` | `pool_balance - reserved < coverage` before purchase. |
| `buy` | `event already in progress or status unclear at purchase` | Status page is not `OPERATIONAL` during purchase check. |
| `settle` | `policy not active` | Policy status is not `ACTIVE` (`PAID` or `CANCELLED`). |
| `settle` | `duplicate observation: <settlement_id>` | Repeated identical page text settled against the same policy. |
| `settle` | `page unreadable` | Cleaned text extracted from page is under 200 characters. |
| `withdraw_unreserved` | `withdraw exceeds unreserved` | Attempted withdrawal exceeds `pool_balance - reserved`. |
