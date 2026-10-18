import sys
import os

# Ensure tests directory is in sys.path so 'import genlayer' succeeds
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class GlVM:
    class UserError(Exception):
        pass

    class VMError(Exception):
        pass


class GlPublic:
    @staticmethod
    def view(fn):
        return fn

    @staticmethod
    def write(fn):
        return fn


class GlEqPrinciple:
    @staticmethod
    def strict_eq(fn):
        return fn()

    @staticmethod
    def prompt_comparative(fn, principle=""):
        return fn()

    @staticmethod
    def prompt_non_comparative(fn, *, task="", criteria=""):
        return fn()


class WebResponse:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self.body = body


class GlNondetWeb:
    def __init__(self):
        self.handler = None

    def get(self, url: str):
        if self.handler:
            return self.handler(url)
        raise GlVM.UserError(f"unmocked web get: {url}")


class GlNondet:
    def __init__(self):
        self.prompt_handler = None
        self.web = GlNondetWeb()

    def exec_prompt(self, p, response_format=""):
        if self.prompt_handler:
            return self.prompt_handler(p)
        return '{"changes": ["NONE"], "redlines": ["CLEAR"]}'


class GlMessage:
    class SenderAddress:
        as_hex = "0x1111111111111111111111111111111111111111"

        def __str__(self):
            return self.as_hex

    sender_address = SenderAddress()


class GlContractViewWrapper:
    def __init__(self, target_contract):
        self.target = target_contract

    def __getattr__(self, name):
        return getattr(self.target, name)


class GlContractRef:
    def __init__(self, target_contract):
        self.target = target_contract

    def view(self):
        return GlContractViewWrapper(self.target)


class GlContractBase:
    def __new__(cls, *args, **kwargs):
        inst = super().__new__(cls)
        for name, typ in getattr(cls, "__annotations__", {}).items():
            s_typ = str(typ)
            if "TreeMap" in s_typ or "dict" in s_typ:
                setattr(inst, name, {})
        return inst


class GlMock:
    Contract = GlContractBase
    vm = GlVM()
    public = GlPublic()
    eq_principle = GlEqPrinciple()
    nondet = GlNondet()
    message = GlMessage()
    message_raw = {"datetime": "2026-10-17T09:00:00.000000Z"}
    contract_registry = {}

    def get_contract_at(self, address):
        addr_str = str(address).lower()
        if addr_str in self.contract_registry:
            return GlContractRef(self.contract_registry[addr_str])
        raise GlVM.UserError(f"contract not found at address {address}")


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


def mock_run_nondet(leader_fn, validator_fn):
    leader_res = leader_fn()
    res_obj = Return(leader_res)
    ok = validator_fn(res_obj)
    if not ok:
        raise GlVM.UserError("validator disagreed with leader")
    return leader_res


gl = GlMock()
gl.vm.run_nondet = mock_run_nondet
gl.vm.Return = Return
TreeMap = dict
Address = str
