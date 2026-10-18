# Source Code Verification Report: Cover

This document records the exact method and cryptographic evidence verifying contract source integrity between the local repository and the GenLayer Studionet execution environment.

---

## 1. Local Source Hashes

- `contracts/Cover.py`:
  - SHA256: `3b2b4bc663c651e44a4f80164c09d85eb5f3336bcf8dcf89a576392095f9d2d0`
  - Encoding: Pure ASCII (all strings use standard ASCII or `\uXXXX` unicode escapes).
- `contracts/CoverGuard.py`:
  - SHA256: `248eeebf6762330a1ebc4656fa9f783141f2a33db5515273d611bf7ca0d72477`
- `contracts/Probe.py`:
  - SHA256: `c233f4eca4c77d345c80ff4dc02852787dcb1ef18f890831681d964ecc4491c5`
- `contracts/ProbeExtract.py`:
  - SHA256: `a937a0755a30e84b3d87dbd761668fdb6ca5ef9d59ea5ea34c89c8a1fe459639`

---

## 2. On-Chain Deployment Hashes & Addresses

### Probe Contract:
- Address: `0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31`
- Deploy Tx Hash: `0x49c0713e21680998242d0cfc82634919ddfa7f052e9f547c822cd8f86b273f9b`
- Explorer URL: [https://explorer-studio.genlayer.com/address/0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31](https://explorer-studio.genlayer.com/address/0xa4a7a596246b0bcBfbeB05ae31922cD43fc68C31)
- Verified SHA256: `c233f4eca4c77d345c80ff4dc02852787dcb1ef18f890831681d964ecc4491c5`

### ProbeExtract Contract:
- Address: `0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D` (and `0xFF6dF478E40b66AAC3Af5271C66b94B750E6E58f`)
- Explorer URL: [https://explorer-studio.genlayer.com/address/0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D](https://explorer-studio.genlayer.com/address/0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D)

---

## 3. Verification Method

Source code verification on GenLayer Studionet is conducted by computing the SHA256 digest of the UTF-8 encoded Python source file and comparing it against the transaction payload submitted during contract deployment.
All source contracts strictly adhere to the GenVM header requirements:
```python
# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
```
No envelope byte drift was observed between local files and submitted deployment code.
