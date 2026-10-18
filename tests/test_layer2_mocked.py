import unittest
import os
import sys
import json
import random

tests_dir = os.path.abspath(os.path.dirname(__file__))
root_dir = os.path.abspath(os.path.join(tests_dir, ".."))
sys.path.insert(0, tests_dir)
sys.path.insert(0, root_dir)

import genlayer
from genlayer import gl, WebResponse
from contracts.Cover import Cover
from contracts.CoverGuard import CoverGuard


class TestLayer2Mocked(unittest.TestCase):

    def setUp(self):
        self.fixtures_dir = os.path.join(root_dir, "fixtures", "pages")
        self.cover = Cover()
        self.guard = CoverGuard("0x1111111111111111111111111111111111111111")
        gl.contract_registry["0x1111111111111111111111111111111111111111"] = self.cover

    def load_fixture(self, name: str) -> bytes:
        p = os.path.join(self.fixtures_dir, name)
        with open(p, "rb") as f:
            return f.read()

    def test_claim_demo_credits(self):
        gl.message.sender_address.as_hex = "0x2222222222222222222222222222222222222222"
        self.assertEqual(self.cover.balance_of("0x2222222222222222222222222222222222222222"), "0")
        self.cover.claim_demo_credits()
        self.assertEqual(self.cover.balance_of("0x2222222222222222222222222222222222222222"), "1000")

        # Second claim fails
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.claim_demo_credits()
        self.assertEqual(str(cm.exception), "already claimed demo credits")

    def test_product_validation_errors(self):
        gl.message.sender_address.as_hex = "0x1111111111111111111111111111111111111111"

        # Bad name
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.create_product("ab", "https://status.nimbus.example/status.md", "major outage lasting 60 min", 60, 30, 1000)
        self.assertEqual(str(cm.exception), "bad name")

        # Bad rule text
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.create_product("Nimbus", "https://status.nimbus.example/status.md", "short", 60, 30, 1000)
        self.assertEqual(str(cm.exception), "bad rule text")

        # Bad thresholds
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.create_product("Nimbus", "https://status.nimbus.example/status.md", "major outage lasting 60 min", 30, 60, 1000)
        self.assertEqual(str(cm.exception), "bad thresholds")

        # Bad premium rate
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.create_product("Nimbus", "https://status.nimbus.example/status.md", "major outage lasting 60 min", 60, 30, 50)
        self.assertEqual(str(cm.exception), "bad premium rate")

    def test_fund_and_solvency_invariants(self):
        gl.message.sender_address.as_hex = "0x3333333333333333333333333333333333333333"
        self.cover.claim_demo_credits()

        pid = self.cover.create_product("Nimbus Cover", "https://status.nimbus.example/status.md", "major outage lasting 60 min", 60, 30, 1000)

        # Fund product
        self.cover.fund_product(pid, 500)
        self.assertEqual(self.cover.balance_of("0x3333333333333333333333333333333333333333"), "500")

        health = json.loads(self.cover.pool_health(pid))
        self.assertEqual(health["pool_balance"], "500")
        self.assertEqual(health["reserved"], "0")
        self.assertEqual(health["free"], "500")

        # Withdraw unreserved
        self.cover.withdraw_unreserved(pid, 200)
        self.assertEqual(self.cover.balance_of("0x3333333333333333333333333333333333333333"), "700")

        # Over-withdraw fails
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.withdraw_unreserved(pid, 400)
        self.assertEqual(str(cm.exception), "withdraw exceeds unreserved")

    def test_buy_and_settle_lifecycle(self):
        underwriter = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        buyer = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

        gl.message.sender_address.as_hex = underwriter
        self.cover.claim_demo_credits()
        pid = self.cover.create_product("Nimbus Cover", "https://status.nimbus.example/status.md", "major outage lasting 60 min", 60, 30, 1000)
        self.cover.fund_product(pid, 500)

        gl.message.sender_address.as_hex = buyer
        self.cover.claim_demo_credits()

        # Mock web to return s0 (operational)
        s0_bytes = self.load_fixture("status-s0-operational.md")
        gl.nondet.web.handler = lambda url: WebResponse(200, s0_bytes)
        gl.nondet.prompt_handler = lambda p: '{"status": "OPERATIONAL", "minutes": 0, "quote": "All systems operational. No incident in progress."}'

        # Buy policy for 100 coverage (premium 10)
        pol_id = self.cover.buy(pid, 100)
        self.assertEqual(pol_id, "1")
        self.assertEqual(self.cover.balance_of(buyer), "990")

        # Pool balance increased by premium (500 + 10 = 510), reserved is 100
        health = json.loads(self.cover.pool_health(pid))
        self.assertEqual(health["pool_balance"], "510")
        self.assertEqual(health["reserved"], "100")
        self.assertEqual(health["free"], "410")

        # Test PAGE_UNCHANGED gate on immediate settle
        outcome = self.cover.settle(pol_id)
        self.assertEqual(outcome, "NO_PAY")

        # Duplicate observation error on repeat
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.settle(pol_id)
        self.assertTrue(str(cm.exception).startswith("duplicate observation:"))

        # Settle on s1 (75 minutes outage -> PAY_100)
        s1_bytes = self.load_fixture("status-s1-outage-75.md")
        gl.nondet.web.handler = lambda url: WebResponse(200, s1_bytes)
        gl.nondet.prompt_handler = lambda p: '{"status": "OUTAGE", "minutes": 75, "quote": "Status: Major outage. Duration: 75 minutes."}'

        outcome_s1 = self.cover.settle(pol_id)
        self.assertEqual(outcome_s1, "PAY_100")

        # Verify buyer received 100 payout (990 + 100 = 1090)
        self.assertEqual(self.cover.balance_of(buyer), "1090")
        # Policy is PAID
        pol = json.loads(self.cover.get_policy(pol_id))
        self.assertEqual(pol["status"], "PAID")
        self.assertEqual(pol["paid_amount"], "100")

        # Settling again fails with "policy not active"
        with self.assertRaises(gl.vm.UserError) as cm:
            self.cover.settle(pol_id)
        self.assertEqual(str(cm.exception), "policy not active")

    def test_cover_guard_checks_and_attestation(self):
        underwriter = "0xcccccccccccccccccccccccccccccccccccccccc"
        holder = "0xdddddddddddddddddddddddddddddddddddddddd"

        gl.message.sender_address.as_hex = underwriter
        self.cover.claim_demo_credits()
        pid = self.cover.create_product("Nimbus", "https://status.nimbus.example/status.md", "rule text 60 min outage", 60, 30, 1000)
        self.cover.fund_product(pid, 500)

        gl.message.sender_address.as_hex = holder
        self.cover.claim_demo_credits()

        # Buy policy
        s0_bytes = self.load_fixture("status-s0-operational.md")
        gl.nondet.web.handler = lambda url: WebResponse(200, s0_bytes)
        gl.nondet.prompt_handler = lambda p: '{"status": "OPERATIONAL", "minutes": 0, "quote": "All systems operational. No incident in progress."}'
        pol_id = self.cover.buy(pid, 100)

        # Check CoverGuard is_covered
        covered_raw = self.guard.is_covered(holder, pol_id)
        covered_data = json.loads(covered_raw)
        self.assertEqual(covered_data["covered"], "true")
        self.assertEqual(covered_data["reason"], "OK")

        # Attest succeeds
        gl.message.sender_address.as_hex = holder
        aid = self.guard.attest(pol_id)
        self.assertEqual(aid, "1")

        att_raw = self.guard.get_attestation(aid)
        att = json.loads(att_raw)
        self.assertEqual(att["policy_id"], pol_id)
        self.assertEqual(att["attester"], holder)

        # Settle payout -> policy enters PAID
        s1_bytes = self.load_fixture("status-s1-outage-75.md")
        gl.nondet.web.handler = lambda url: WebResponse(200, s1_bytes)
        gl.nondet.prompt_handler = lambda p: '{"status": "OUTAGE", "minutes": 75, "quote": "Status: Major outage. Duration: 75 minutes."}'
        self.cover.settle(pol_id)

        # Now is_covered returns false with reason PAID
        covered_raw_paid = self.guard.is_covered(holder, pol_id)
        covered_paid_data = json.loads(covered_raw_paid)
        self.assertEqual(covered_paid_data["covered"], "false")
        self.assertEqual(covered_paid_data["reason"], "PAID")

        # Attest now fails with UserError
        with self.assertRaises(gl.vm.UserError) as cm:
            self.guard.attest(pol_id)
        self.assertEqual(str(cm.exception), "not covered: PAID")


if __name__ == "__main__":
    unittest.main()
