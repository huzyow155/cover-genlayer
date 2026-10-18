import unittest
import os
import sys
import json

tests_dir = os.path.abspath(os.path.dirname(__file__))
root_dir = os.path.abspath(os.path.join(tests_dir, ".."))
sys.path.insert(0, tests_dir)
sys.path.insert(0, root_dir)

import genlayer
from genlayer import gl, Return


class TestLayer3Consensus(unittest.TestCase):

    def test_validators_with_identical_tokens_agree(self):
        leader_payload = json.dumps({
            "token": "PAY_100|0e6cfd744a521e5b",
            "outcome": "PAY_100",
            "status": "OUTAGE",
            "minutes": 75,
            "quote": "Major outage. Duration: 75 minutes.",
        })

        def leader_fn():
            return leader_payload

        def validator_fn(leader_res):
            ldata = json.loads(leader_res.calldata)
            # Validator recomputed same token
            my_token = "PAY_100|0e6cfd744a521e5b"
            return my_token == ldata.get("token")

        res = gl.vm.run_nondet(leader_fn, validator_fn)
        self.assertEqual(res, leader_payload)

    def test_validators_with_different_outcomes_disagree(self):
        leader_payload = json.dumps({
            "token": "PAY_100|0e6cfd744a521e5b",
            "outcome": "PAY_100",
        })

        def leader_fn():
            return leader_payload

        def validator_fn(leader_res):
            ldata = json.loads(leader_res.calldata)
            # Validator recomputed different outcome (e.g. NO_PAY)
            my_token = "NO_PAY|0e6cfd744a521e5b"
            return my_token == ldata.get("token")

        with self.assertRaises(gl.vm.UserError) as cm:
            gl.vm.run_nondet(leader_fn, validator_fn)
        self.assertEqual(str(cm.exception), "validator disagreed with leader")

    def test_validators_with_different_hashes_disagree(self):
        leader_payload = json.dumps({
            "token": "PAY_100|0e6cfd744a521e5b",
            "outcome": "PAY_100",
        })

        def leader_fn():
            return leader_payload

        def validator_fn(leader_res):
            ldata = json.loads(leader_res.calldata)
            # Validator read a different page version (different norm_hash16)
            my_token = "PAY_100|ffffffffffffffff"
            return my_token == ldata.get("token")

        with self.assertRaises(gl.vm.UserError) as cm:
            gl.vm.run_nondet(leader_fn, validator_fn)
        self.assertEqual(str(cm.exception), "validator disagreed with leader")


if __name__ == "__main__":
    unittest.main()
