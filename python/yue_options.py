"""Shared validation and request mapping for the public YuE2 controls."""
from __future__ import annotations

import math


CONTEXT_TOKENS = 24576
_STAGES = {
    "": {"min": 200, "max": 9000},
    "abc": {"min": 32, "max": 4096},
}
_FIELDS = {
    "temperature": ("", "temperature", "float"),
    "topP": ("", "top_p", "float"),
    "topK": ("", "top_k", "int"),
    "repetitionPenalty": ("", "repetition_penalty", "float"),
    "penaltyWindow": ("", "penalty_window", "int"),
    "minTokens": ("", "min_tokens", "int"),
    "maxTokens": ("", "max_tokens", "int"),
    "abcTemperature": ("abc", "temperature", "float"),
    "abcTopP": ("abc", "top_p", "float"),
    "abcTopK": ("abc", "top_k", "int"),
    "abcRepetitionPenalty": ("abc", "repetition_penalty", "float"),
    "abcPenaltyWindow": ("abc", "penalty_window", "int"),
    "abcMinTokens": ("abc", "min_tokens", "int"),
    "abcMaxTokens": ("abc", "max_tokens", "int"),
    "cfgScale": ("config", "cfg_scale", "float"),
    "odeSteps": ("config", "ode_steps", "int"),
}


def _invalid(name):
    raise ValueError(f"고급 설정 {name} 값이 올바르지 않습니다.")


def _number(name, value):
    if type(value) not in (int, float) or not math.isfinite(value):
        _invalid(name)
    return value


def _integer(name, value):
    if type(value) is not int:
        _invalid(name)
    return value


def normalize_advanced(values):
    """Validate public flat controls without filling omitted upstream defaults."""
    if values is None:
        return {}
    if not isinstance(values, dict):
        raise ValueError("고급 설정 형식이 올바르지 않습니다.")
    clean = {}
    for name, value in values.items():
        if name not in _FIELDS:
            raise ValueError(f"지원하지 않는 고급 설정: {name}")
        if value is None:
            continue
        stage, field, kind = _FIELDS[name]
        value = _integer(name, value) if kind == "int" else _number(name, value)
        if field == "temperature" and not 0 <= value <= 5:
            _invalid(name)
        elif field == "top_p" and not 0 < value <= 1:
            _invalid(name)
        elif field == "top_k" and value < 1:
            _invalid(name)
        elif field == "repetition_penalty" and value <= 0:
            _invalid(name)
        elif field == "penalty_window" and not 1 <= value <= 100:
            _invalid(name)
        elif field == "min_tokens" and value < 0:
            _invalid(name)
        elif field == "max_tokens" and not 1 <= value <= CONTEXT_TOKENS:
            _invalid(name)
        elif field == "cfg_scale" and not 0 <= value <= 20:
            _invalid(name)
        elif field == "ode_steps" and value < 1:
            _invalid(name)
        clean[name] = value

    for prefix, defaults in _STAGES.items():
        min_name = "abcMinTokens" if prefix else "minTokens"
        max_name = "abcMaxTokens" if prefix else "maxTokens"
        minimum = clean.get(min_name, defaults["min"])
        maximum = clean.get(max_name, defaults["max"])
        if minimum > maximum:
            raise ValueError(f"{min_name}는 {max_name}보다 클 수 없습니다.")
    return clean


def request_controls(values):
    """Map validated Road Music names to the two upstream sampling dictionaries."""
    values = normalize_advanced(values)
    abc, semantic = {}, {}
    result = {}
    for name, value in values.items():
        stage, field, _kind = _FIELDS[name]
        if stage == "abc":
            abc[field] = value
        elif stage == "":
            semantic[field] = value
        elif field == "cfg_scale":
            result[field] = value
        else:
            result["generation_config"] = {field: value}
    if abc:
        result["abc_sampling"] = abc
    if semantic:
        result["semantic_sampling"] = semantic
    return result


def normalize_seed(value):
    """Accept the CLI's exact decimal seed encoding and return the upstream integer."""
    if type(value) is int:
        seed = value
    elif isinstance(value, str) and value and value.isascii() and value.isdecimal():
        seed = int(value)
    else:
        raise ValueError("시드는 0 이상 2^63 미만의 정수여야 합니다.")
    if not 0 <= seed < 2**63:
        raise ValueError("시드는 0 이상 2^63 미만의 정수여야 합니다.")
    return seed


def normalize_runtime(value):
    """Validate the public per-song MLX runtime controls without choosing paths."""
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ValueError("YuE2 MLX 런타임 설정 형식이 올바르지 않습니다.")
    allowed = {"precision", "memoryBudgetGiB", "vaeCoreFrames", "queryChunkSize",
               "requireAc", "vaePath", "loraPath", "loraScale"}
    unknown = set(value) - allowed
    if unknown:
        raise ValueError(f"지원하지 않는 YuE2 MLX 런타임 설정: {sorted(unknown)[0]}")
    precision = value.get("precision", "8bit")
    if precision not in {"8bit", "bf16", "4bit"}:
        raise ValueError("precision은 8bit, bf16, 4bit 중 하나여야 합니다.")
    memory = value.get("memoryBudgetGiB", 16)
    if type(memory) not in (int, float) or not math.isfinite(memory) or memory <= 0:
        raise ValueError("memoryBudgetGiB는 유한한 양수여야 합니다.")
    core = value.get("vaeCoreFrames", 256)
    if type(core) is not int or core < 1:
        raise ValueError("vaeCoreFrames는 양의 정수여야 합니다.")
    query = value.get("queryChunkSize")
    if query is not None and (type(query) is not int or not 16 <= query <= 8192):
        raise ValueError("queryChunkSize는 16~8192 범위의 정수여야 합니다.")
    ac = value.get("requireAc", True)
    if type(ac) is not bool:
        raise ValueError("requireAc는 true 또는 false여야 합니다.")
    runtime = {"precision": precision, "memoryBudgetGiB": memory, "vaeCoreFrames": core,
               "requireAc": ac}
    if query is not None:
        runtime["queryChunkSize"] = query
    for key in ("vaePath", "loraPath"):
        path = value.get(key)
        if path is not None:
            if not isinstance(path, str) or not path.strip():
                raise ValueError(f"{key}는 비어 있지 않은 파일 경로여야 합니다.")
            runtime[key] = path
    scale = value.get("loraScale")
    if scale is not None:
        if type(scale) not in (int, float) or not math.isfinite(scale):
            raise ValueError("loraScale은 유한한 숫자여야 합니다.")
        runtime["loraScale"] = scale
    return runtime
