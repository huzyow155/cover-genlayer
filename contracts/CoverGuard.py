# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from genlayer import *


class CoverGuard(gl.Contract):
    cover_address: Address
    attestations: TreeMap[str, str]
    attester_history: TreeMap[str, str]
    meta: TreeMap[str, str]

    def __init__(self, cover_address_str: str):
        # Do not assign TreeMap() in __init__
        self.cover_address = Address(cover_address_str)

    # -----------------------------------------------------------------------
    # Public Views
    # -----------------------------------------------------------------------

    @gl.public.view
    def is_covered(self, holder: str, policy_id: str) -> str:
        h = holder.strip().lower()
        pid = str(policy_id).strip()

        cover_contract = gl.get_contract_at(self.cover_address)
        try:
            pol_raw = cover_contract.view().get_policy(pid)
            pol = json.loads(pol_raw)
        except Exception:
            res = {
                "covered": "false",
                "reason": "NO_POLICY",
                "policy_status": "",
                "coverage": "0",
                "product_id": "",
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        if pol.get("holder", "").lower() != h:
            res = {
                "covered": "false",
                "reason": "NOT_HOLDER",
                "policy_status": pol.get("status", ""),
                "coverage": pol.get("coverage", "0"),
                "product_id": pol.get("product_id", ""),
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        status = pol.get("status", "")
        if status == "PAID":
            res = {
                "covered": "false",
                "reason": "PAID",
                "policy_status": status,
                "coverage": pol.get("coverage", "0"),
                "product_id": pol.get("product_id", ""),
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        if status == "CANCELLED":
            res = {
                "covered": "false",
                "reason": "CANCELLED",
                "policy_status": status,
                "coverage": pol.get("coverage", "0"),
                "product_id": pol.get("product_id", ""),
            }
            return json.dumps(res, sort_keys=True, separators=(",", ":"))

        # Check pool health
        pr_id = pol.get("product_id", "")
        try:
            health_raw = cover_contract.view().pool_health(pr_id)
            health = json.loads(health_raw)
            pb = int(health.get("pool_balance", "0"))
            cov = int(pol.get("coverage", "0"))
            if pb < cov:
                res = {
                    "covered": "false",
                    "reason": "POOL_SHORT",
                    "policy_status": status,
                    "coverage": str(cov),
                    "product_id": pr_id,
                }
                return json.dumps(res, sort_keys=True, separators=(",", ":"))
        except Exception:
            pass

        res = {
            "covered": "true",
            "reason": "OK",
            "policy_status": status,
            "coverage": pol.get("coverage", "0"),
            "product_id": pr_id,
        }
        return json.dumps(res, sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def is_covered_for(
        self,
        holder: str,
        policy_id: str,
        product_id: str,
        terms_hash: str,
        min_coverage: int,
    ) -> bool:
        h = holder.strip().lower()
        pid = str(policy_id).strip()
        pr_id = str(product_id).strip()

        cover_contract = gl.get_contract_at(self.cover_address)
        try:
            pol_raw = cover_contract.view().get_policy(pid)
            pol = json.loads(pol_raw)
        except Exception:
            return False

        if pol.get("holder", "").lower() != h:
            return False

        if pol.get("product_id", "") != pr_id:
            return False

        if pol.get("status", "") != "ACTIVE":
            return False

        cov = int(pol.get("coverage", "0"))
        if cov < min_coverage:
            return False

        try:
            prod_raw = cover_contract.view().get_product(pr_id)
            prod = json.loads(prod_raw)
            if prod.get("terms_hash", "") != terms_hash:
                return False
        except Exception:
            return False

        return True

    @gl.public.view
    def get_attestation(self, attestation_id: str) -> str:
        aid = str(attestation_id).strip()
        if aid not in self.attestations:
            raise gl.vm.UserError("unknown attestation")
        return self.attestations[aid]

    @gl.public.view
    def list_attestations(self, addr: str, limit: int = 10) -> list[str]:
        if limit <= 0:
            limit = 10
        if limit > 20:
            limit = 20
        k = addr.strip().lower()
        if k not in self.attester_history:
            return []
        aids = json.loads(self.attester_history[k])
        res = []
        for aid in aids[:limit]:
            if aid in self.attestations:
                res.append(self.attestations[aid])
        return res

    # -----------------------------------------------------------------------
    # Public Writes
    # -----------------------------------------------------------------------

    @gl.public.write
    def attest(self, policy_id: str) -> str:
        sender = gl.message.sender_address.as_hex.lower()
        pid = str(policy_id).strip()

        check_raw = self.is_covered(sender, pid)
        check = json.loads(check_raw)
        if check.get("covered") != "true":
            raise gl.vm.UserError(f"not covered: {check.get('reason')}")

        cover_contract = gl.get_contract_at(self.cover_address)
        pol_raw = cover_contract.view().get_policy(pid)
        pol = json.loads(pol_raw)
        pr_id = pol["product_id"]

        prod_raw = cover_contract.view().get_product(pr_id)
        prod = json.loads(prod_raw)

        aid = self.meta.get("next_attestation", "1")
        self.meta["next_attestation"] = str(int(aid) + 1)

        record = {
            "schema_version": "1",
            "id": aid,
            "attester": sender,
            "policy_id": pid,
            "product_id": pr_id,
            "coverage": pol["coverage"],
            "terms_hash": prod["terms_hash"],
        }
        self.attestations[aid] = json.dumps(record, sort_keys=True, separators=(",", ":"))

        hist = json.loads(self.attester_history.get(sender, "[]"))
        hist.insert(0, aid)
        self.attester_history[sender] = json.dumps(hist[:50])

        return aid
