# Milestone 0 Runtime Notes: Studionet Verification

This document records the empirical results of the Milestone 0 runtime probe (`contracts/Probe.py`) executed on GenLayer Studionet (chain ID 61999) using throwaway account `0xA0281D21FeDB96a9c51413595E596c61f229b689`.

Probe Contract Address: `0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31`
Deploy Tx Hash: `0x49c0713e21680998242d0cfc82634919ddfa7f052e9f547c822cd8f86b273f9b`
Probe Source SHA256: `c233f4eca4c77d345c80ff4dc02852787dcb1ef18f890831681d964ecc4491c5`

---

## 1. Summary of Runtime Findings

1. **Sender Accessor**:
   - `gl.message.sender_address.as_hex` successfully returns the caller's checksummed hex address string (e.g. `0xA0281D21FeDB96a9c51413595E596c61f229b689`).
2. **View Returns**:
   - `bool`: Returned boolean primitive `true`.
   - `str`: Returned string `"studionet_probe_ok"`.
   - `list[str]`: Returned JSON array `["v0", "v1", "v2"]`.
   - `int` arguments in view: `probe_int_args(42)` successfully accepted integer and returned `"int_val:42"`.
3. **Write Method Arguments (`int` vs `str`)**:
   - `int` argument in write (`probe_imports_and_storage(large_payload, 12345)`) succeeded with transaction hash `0x87b5171fa68d7836930ede2e88b697a0ff09cf97bd5de0ad089ce8dc4035b1f8`.
   - Python integers serialize cleanly in GenVM write transactions.
4. **Stdlib Imports**:
   - `hashlib`, `json`, `re`, `urllib.parse`, `ipaddress`, and `html` imported cleanly at module level without error.
   - `urllib.parse.urlsplit` parsed netloc (`status.nimbus.example:443`) and scheme (`https`).
   - `ipaddress.ip_address("192.168.1.1")` succeeded.
   - `html.unescape` successfully decoded HTML entities (`&quot;` to `"`, `&amp;` to `&`).
   - `re.sub` executed regular expressions as expected.
5. **Storage Capacity (`TreeMap[str, str]`)**:
   - Stored 4000-character payload cleanly inside `TreeMap[str, str]`.
6. **Web Fetch (`gl.nondet.web.get`)**:
   - **Markdown raw URL** (`status-s0-operational.md`): Status 200, length 483 bytes, SHA256 `a53e84b7ce116d7256d90ffe7af5bb97e9982a7c3c4dbc3140680e8d2c40f664`.
   - **HTML raw URL** (`status-s5-operational-reformatted.html`): Status 200, length 816 bytes, SHA256 `ca10952b66d508977a0b4b636b17253e5efc36d8014579667206ef296bcb2ffb`.
   - **404 Behavior**: Returned integer status code `404` and body bytes `"404: Not Found"`.
   - **Byte Stability**: 5 consecutive fetches of the raw GitHub URL yielded identical body hashes across all 5 iterations (`stable: true`).
7. **LLM Prompt Execution (`gl.nondet.exec_prompt`)**:
   - Returned raw string without crashing; cleanly stripped markdown fences to yield `{"status":"OPERATIONAL","minutes":0,"quote":""}`.
8. **Consensus Primitive (`gl.vm.run_nondet` with Leader & Validator)**:
   - Evaluated `leader_fn` and `validator_fn` with consensus token comparison.
   - State mutation following `gl.vm.run_nondet` executed and persisted cleanly (`run_nondet_res` successfully read back from contract storage).
9. **Latency Metrics**:
   - Deployment: 10.75 s
   - Simple write (storage & imports): 5.39 s
   - Web fetch writes: 12.11 s - 15.44 s
   - LLM prompt write: 15.38 s
   - `run_nondet` pattern write: 8.76 s

---

## 2. Decision Gate Assessment

- **Web Readability**: PASS (both Markdown and HTML parsed with status 200).
- **Byte Stability**: PASS (5/5 identical SHA256 hashes).
- **Consensus Compatibility**: PASS (`gl.vm.run_nondet(leader, validator)` functional and validated on-chain).
- **Status**: GREEN. Proceed to Milestone 1.
