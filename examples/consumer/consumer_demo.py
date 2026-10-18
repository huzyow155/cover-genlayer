import os
import sys

# Set up test environment with genlayer mock
tests_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "tests"))
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, tests_dir)
sys.path.insert(0, root_dir)

import genlayer
from genlayer import gl, WebResponse
from contracts.Cover import Cover
from contracts.CoverGuard import CoverGuard


def main():
    print("==================================================================")
    print("MILESTONE 5: COVERGUARD CONSUMER INTEGRATION DEMONSTRATION")
    print("==================================================================")

    cover = Cover()
    cover_addr = "0xCoverContractAddress111111111111111111111111"
    gl.contract_registry[cover_addr.lower()] = cover

    guard = CoverGuard(cover_addr)

    underwriter = "0xunderwriter11111111111111111111111111111111"
    holder = "0xpolicyholder22222222222222222222222222222222"

    print("\n1. Underwriter funds product pool...")
    gl.message.sender_address.as_hex = underwriter
    cover.claim_demo_credits()
    pid = cover.create_product(
        "Nimbus Cloud Cover",
        "https://raw.githubusercontent.com/huzyow155/cover-fixtures/92c69bc636517656b9e7ee031a503adfb2d26bb4/status-s0-operational.md",
        "major outage lasting at least 60 minutes",
        60,
        30,
        1000
    )
    cover.fund_product(pid, 500)
    print(f"Product {pid} created and funded with 500 credits.")

    print("\n2. Buyer purchases policy...")
    gl.message.sender_address.as_hex = holder
    cover.claim_demo_credits()
    s0_page = open(os.path.join(root_dir, "fixtures", "pages", "status-s0-operational.md"), "rb").read()
    gl.nondet.web.handler = lambda url: WebResponse(200, s0_page)
    gl.nondet.prompt_handler = lambda p: '{"status": "OPERATIONAL", "minutes": 0, "quote": "All systems operational. No incident in progress."}'
    pol_id = cover.buy(pid, 100)
    print(f"Policy {pol_id} bought by holder {holder} for coverage 100.")

    print("\n3. CoverGuard.is_covered synchronous cross-contract view check:")
    check_before = guard.is_covered(holder, pol_id)
    print("Result:", check_before)

    print("\n4. CoverGuard.attest execution:")
    gl.message.sender_address.as_hex = holder
    aid = guard.attest(pol_id)
    att_raw = guard.get_attestation(aid)
    print(f"Attestation {aid} created successfully:")
    print(att_raw)

    print("\n5. Settle triggering payout (Pa enters PAID status)...")
    s1_page = open(os.path.join(root_dir, "fixtures", "pages", "status-s1-outage-75.md"), "rb").read()
    gl.nondet.web.handler = lambda url: WebResponse(200, s1_page)
    gl.nondet.prompt_handler = lambda p: '{"status": "OUTAGE", "minutes": 75, "quote": "Status: Major outage.\\nDuration: 75 minutes."}'
    cover.settle(pol_id)
    print("Settlement complete. Policy status is now PAID.")

    print("\n6. CoverGuard.is_covered reactive check after payout:")
    check_after = guard.is_covered(holder, pol_id)
    print("Result:", check_after)

    print("\n7. Attempting CoverGuard.attest after payout (must fail):")
    try:
        guard.attest(pol_id)
        print("ERROR: attest should have failed!")
    except Exception as e:
        print("Success: attest refused with expected UserError:", str(e))

    print("\nMilestone 5 demonstration completed successfully!")


if __name__ == "__main__":
    main()
