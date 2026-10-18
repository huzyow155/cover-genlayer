# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import hashlib
import re
import urllib.parse
import ipaddress
import html
from genlayer import *


class Probe(gl.Contract):
    results: TreeMap[str, str]

    def __init__(self):
        # Do not assign TreeMap() in __init__
        pass

    @gl.public.view
    def get_result(self, key: str) -> str:
        if key in self.results:
            return self.results[key]
        return ""

    @gl.public.view
    def get_sender(self) -> str:
        return gl.message.sender_address.as_hex

    @gl.public.view
    def probe_bool(self) -> bool:
        return True

    @gl.public.view
    def probe_str(self) -> str:
        return "studionet_probe_ok"

    @gl.public.view
    def probe_list(self) -> list[str]:
        return ["v0", "v1", "v2"]

    @gl.public.view
    def probe_int_args(self, val: int) -> str:
        return f"int_val:{val}"

    @gl.public.write
    def probe_imports_and_storage(self, large_payload: str, test_int: int) -> None:
        sender = gl.message.sender_address.as_hex
        h = hashlib.sha256(b"cover_probe").hexdigest()
        parsed = urllib.parse.urlsplit("https://status.nimbus.example:443/status?v=1#head")
        ip = str(ipaddress.ip_address("192.168.1.1"))
        unescaped = html.unescape("&quot;hello &amp; world&quot;")
        reg = re.sub(r"[^a-zA-Z0-9]+", " ", "Hello, World! 123")

        # Test large string in TreeMap
        self.results["large_payload"] = large_payload

        info = {
            "sender": sender,
            "sha256": h,
            "parsed_netloc": parsed.netloc,
            "parsed_scheme": parsed.scheme,
            "ip": ip,
            "unescaped": unescaped,
            "regex_clean": reg,
            "payload_len": len(large_payload),
            "test_int": str(test_int),
        }
        self.results["env_info"] = json.dumps(info, sort_keys=True)

    @gl.public.write
    def probe_web_fetch(self, url: str, test_key: str) -> None:
        def fetch_run() -> str:
            res = gl.nondet.web.get(url)
            status_code = int(res.status)
            body_bytes = res.body if isinstance(res.body, (bytes, bytearray)) else str(res.body).encode("utf-8")
            body_sha256 = hashlib.sha256(body_bytes).hexdigest()
            body_text = body_bytes.decode("utf-8", errors="replace")
            return json.dumps({
                "status": status_code,
                "length": len(body_bytes),
                "sha256": body_sha256,
                "preview": body_text[:120],
            }, sort_keys=True)

        decision = gl.eq_principle.strict_eq(fetch_run)
        self.results[test_key] = decision

    @gl.public.write
    def probe_byte_stability(self, url: str, count: int) -> None:
        def fetch_loop() -> str:
            hashes = []
            lengths = []
            for _ in range(count):
                res = gl.nondet.web.get(url)
                body_bytes = res.body if isinstance(res.body, (bytes, bytearray)) else str(res.body).encode("utf-8")
                h = hashlib.sha256(body_bytes).hexdigest()
                hashes.append(h)
                lengths.append(len(body_bytes))
            is_stable = (len(set(hashes)) == 1)
            return json.dumps({
                "stable": is_stable,
                "hashes": hashes,
                "lengths": lengths,
                "first_hash": hashes[0] if hashes else "",
            }, sort_keys=True)

        decision = gl.eq_principle.strict_eq(fetch_loop)
        self.results["stability"] = decision

    @gl.public.write
    def probe_llm_prompt(self, test_prompt: str) -> None:
        def prompt_run() -> str:
            raw = gl.nondet.exec_prompt(test_prompt)
            clean = raw.replace("```json", "").replace("```", "").strip()
            return clean

        decision = gl.eq_principle.strict_eq(prompt_run)
        self.results["llm_out"] = decision

    @gl.public.write
    def probe_run_nondet_pattern(self, prompt_text: str) -> None:
        def leader_fn() -> str:
            raw = gl.nondet.exec_prompt(prompt_text)
            clean = raw.replace("```json", "").replace("```", "").strip()
            obs = {"token": "TEST_TOKEN_OK", "raw": clean}
            return json.dumps(obs, sort_keys=True)

        def validator_fn(leader_res) -> bool:
            if not hasattr(leader_res, "calldata"):
                return False
            try:
                ldata = json.loads(leader_res.calldata)
                return ldata.get("token") == "TEST_TOKEN_OK"
            except Exception:
                return False

        res = gl.vm.run_nondet(leader_fn, validator_fn)
        # Store in state to prove mutation after run_nondet succeeds
        self.results["run_nondet_res"] = res
