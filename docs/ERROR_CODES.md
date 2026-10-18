# Error Codes & User Error Reference: Cover

This document catalogs every UserError raised by `Cover` and `CoverGuard`.
Tests assert the exact text of each message.

---

## 1. Credit & Account Errors
- `already claimed demo credits`: The sender address has already executed `claim_demo_credits()`.
- `insufficient balance`: The sender does not possess enough credits to complete the requested fund or buy operation.

## 2. Product Creation & Source Management Errors
- `bad name`: Product name does not satisfy 3-60 ASCII characters.
- `bad rule text`: Product plain-words rule does not satisfy 10-200 ASCII characters.
- `bad thresholds`: Outage threshold invalid (`min_full` outside 2-10080 or `min_half` outside 1 to `min_full - 1`).
- `bad premium rate`: Premium basis points outside 100-5000 (1% - 50%).
- `not creator`: Sender is not the recorded creator of the product.
- `unknown product`: Target product ID does not exist in storage.
- `host or directory mismatch on update_source`: The new URL passed to `update_source` does not match the product's immutable host or directory path.

## 3. Strict URL Validation Errors
- `bad URL: length must be between 1 and 300 characters`: Empty URL or exceeds 300 character cap.
- `bad URL: must be pure ASCII`: URL contains non-ASCII characters or invalid UTF-8 sequences.
- `bad URL: scheme must be https`: Scheme is HTTP or another non-HTTPS protocol.
- `bad URL: userinfo not allowed`: URL contains credentials (e.g. `https://user:pass@host/`).
- `bad URL: fragment not allowed`: URL contains a hash fragment (`#section`).
- `bad URL: missing host`: URL netloc is missing or malformed.
- `bad URL: IP literals not allowed`: URL host is an IPv4 or IPv6 literal.
- `bad URL: port must be 443 or omitted`: URL specifies a non-standard port (e.g. `:8080`).

## 4. Policy Purchase & Cancellation Errors
- `bad amount`: Coverage amount outside 10-100000, or funding amount outside 1-1000000.
- `pool cannot cover this coverage`: Product pool does not have sufficient unreserved liquidity (`pool_balance - reserved < coverage`).
- `event already in progress or status unclear at purchase`: Buy-time validator probe detected an ongoing incident or non-operational status.
- `unknown policy`: Target policy ID does not exist in storage.
- `not holder`: Caller is not the registered owner of the policy.
- `policy not active`: Attempted operation on a policy that is already `PAID` or `CANCELLED`.
- `withdraw exceeds unreserved`: Creator attempted to withdraw more than `pool_balance - reserved`.

## 5. Settlement Pipeline Errors
- `source unreachable`: HTTP request failed or connection timed out.
- `HTTP status not 200: <status>`: Target status page returned non-200 status code (e.g. 404, 500).
- `page too large`: Status page response body exceeds the 400KB byte cap.
- `page unreadable`: Extracted and cleaned text is under 200 characters.
- `duplicate observation: <settlement_id>`: Exact same page text (`norm_hash16`) has already been settled against this policy.

## 6. CoverGuard Consumer Errors
- `unknown attestation`: Target attestation ID not found.
- `not covered: <reason>`: Caller does not hold an active, solvent policy (`NO_POLICY`, `NOT_HOLDER`, `PAID`, `CANCELLED`, `POOL_SHORT`).
