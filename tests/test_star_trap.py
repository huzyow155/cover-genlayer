import unittest
import os
import sys

tests_dir = os.path.abspath(os.path.dirname(__file__))
root_dir = os.path.abspath(os.path.join(tests_dir, ".."))
sys.path.insert(0, tests_dir)
sys.path.insert(0, root_dir)

import genlayer
from contracts.Cover import (
    clean_text,
    norm_text,
    norm_hash,
    quote_in_page,
    number_in_quote,
    decide,
)


def naive_b1_keyword_insurer(page_bytes: bytes) -> str:
    """B1 keyword insurer: pays if page contains 'outage' anywhere."""
    text = clean_text(page_bytes).lower()
    if "outage" in text:
        return "PAY_100"
    return "NO_PAY"


def naive_b2_trusting_insurer(llm_status: str, llm_minutes: int, min_full: int) -> str:
    """B2 trusting insurer: pays whatever the model says without verifying the quote."""
    if llm_status == "OUTAGE" and llm_minutes >= min_full:
        return "PAY_100"
    return "NO_PAY"


def naive_b3_hash_insurer(curr_raw_bytes: bytes, buy_raw_bytes: bytes) -> str:
    """B3 hash insurer: pays if raw bytes changed since purchase."""
    if curr_raw_bytes != buy_raw_bytes:
        return "PAY_100"
    return "NO_PAY"


class TestStarTrap(unittest.TestCase):

    def setUp(self):
        self.fixtures_dir = os.path.join(root_dir, "fixtures", "pages")

    def load_fixture(self, name: str) -> bytes:
        p = os.path.join(self.fixtures_dir, name)
        with open(p, "rb") as f:
            return f.read()

    def test_b1_keyword_insurer_fails_where_cover_succeeds(self):
        s0_bytes = self.load_fixture("status-s0-operational.md")
        s3_bytes = self.load_fixture("status-s3-outage-20.md")
        s6_bytes = self.load_fixture("status-s6-injection.md")

        # Case 1: Incident too short (s3 is 20 minutes; min_full is 60, min_half is 30)
        # B1 sees "outage" and pays 100% inappropriately
        self.assertEqual(naive_b1_keyword_insurer(s3_bytes), "PAY_100")
        # Cover properly checks threshold and resolves NO_PAY
        cover_res_s3 = decide("OUTAGE", 20, 60, 30, True, False)
        self.assertEqual(cover_res_s3, "NO_PAY")

        # Case 2: Prompt injection page (s6)
        # B1 blindly pays PAY_100
        self.assertEqual(naive_b1_keyword_insurer(s6_bytes), "PAY_100")
        # Cover trips the injection tripwire and refuses payout (REVIEW)
        cleaned_s6 = clean_text(s6_bytes)
        from contracts.Cover import injection_tripwire
        self.assertTrue(injection_tripwire(cleaned_s6))
        cover_res_s6 = decide("OUTAGE", 75, 60, 30, True, True)
        self.assertEqual(cover_res_s6, "REVIEW")

    def test_b2_trusting_insurer_fails_where_cover_succeeds(self):
        # Model hallucinates status=OUTAGE, minutes=120, but quote is fabricated
        page_bytes = self.load_fixture("status-s0-operational.md")
        cleaned = clean_text(page_bytes)
        fake_quote = "Major outage lasting 120 minutes across all regions."

        # B2 trusts the model output and pays 100%
        self.assertEqual(naive_b2_trusting_insurer("OUTAGE", 120, 60), "PAY_100")

        # Cover verifies quote verbatim in page: quote_ok is False -> REVIEW (NO PAYOUT)
        q_ok = quote_in_page(fake_quote, cleaned)
        self.assertFalse(q_ok)
        cover_res = decide("OUTAGE", 120, 60, 30, q_ok, False)
        self.assertEqual(cover_res, "REVIEW")

    def test_b3_hash_insurer_fails_where_cover_succeeds(self):
        s0_bytes = self.load_fixture("status-s0-operational.md")
        # Cosmetic reformatting (s5) represents the same operational reality with different markup
        s5_bytes = self.load_fixture("status-s5-operational-reformatted.html")

        # B3 detects byte change and triggers false payout
        self.assertEqual(naive_b3_hash_insurer(s5_bytes, s0_bytes), "PAY_100")

        # Cover normalizes and evaluates status: OPERATIONAL -> NO_PAY
        cleaned_s5 = clean_text(s5_bytes)
        q_ok = quote_in_page("All systems operational. No incident in progress.", cleaned_s5)
        self.assertTrue(q_ok)
        cover_res = decide("OPERATIONAL", 0, 60, 30, q_ok, False)
        self.assertEqual(cover_res, "NO_PAY")

    def test_property_cosmetic_edits_preserve_outcome(self):
        base_md = self.load_fixture("status-s1-outage-75.md")
        cleaned_base = clean_text(base_md)
        nh_base = norm_hash(cleaned_base)

        # Cosmetic variation: alter case, extra spaces, different newlines, quote punctuation
        varied_text = (
            "   # NIMBUS CLOUD SYSTEM STATUS   \r\n\r\n"
            "**CURRENT INCIDENT**\r\n"
            "Incident: API errors across multiple availability zones.  \r\n"
            "Status: Major outage.  \r\n"
            "Duration: 75 minutes.  \r\n\r\n"
            "### Incident Details  \r\n"
            "Engineers are actively investigating elevated 500 error rates on public API endpoints.  \r\n"
            "Upstream network routing tables are being rebuilt and traffic is rerouted.  \r\n"
            "Core services including compute workers and event streams are currently impacted.  \r\n"
            "Next update will be published within 15 minutes.  \r\n"
        )
        cleaned_var = clean_text(varied_text.encode("utf-8"))
        nh_var = norm_hash(cleaned_var)

        self.assertEqual(nh_base[:16], nh_var[:16])


if __name__ == "__main__":
    unittest.main()
