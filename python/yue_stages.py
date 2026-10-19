"""Offline, integrity-checked YuE2 MLX stage generation and replay.

This adapter deliberately uses Lyra's public Python API instead of rebuilding
token prefixes or editing saved artifacts.  It is invoked by the Road Music
worker in a separate process, so cancellation and process termination remain
the worker's responsibility.
"""
from __future__ import annotations

import argparse
from contextlib import nullcontext
from dataclasses import asdict, replace
import hashlib
import json
import math
from pathlib import Path
import sys
import time


_STAGES = {"generate", "plan-score", "plan", "synthesize", "decode", "verify"}
_PRECISIONS = {"8bit", "bf16", "4bit"}


def _json_file(path: Path):
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Stage request must be a JSON object")
    return value


def _absolute_existing_directory(value: str, label: str) -> Path:
    path = Path(value)
    if not path.is_absolute() or path.is_symlink() or not path.is_dir():
        raise ValueError(f"{label} must be an absolute non-symlink directory")
    return path.resolve(strict=True)


def _output_directory(value: str, source: Path | None) -> Path:
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("output must be an absolute path")
    # macOS commonly exposes temporary files below /var, itself a system
    # symlink.  Reject the requested output link, then compare canonical paths.
    if path.is_symlink():
        raise ValueError("output must not be a symlink")
    resolved = path.resolve(strict=False)
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise FileExistsError("output must be absent or an empty directory")
    if source is not None and (
        resolved == source or source in resolved.parents or resolved in source.parents
    ):
        raise ValueError("source and output must be separate, non-overlapping directories")
    return resolved


def _local_path(value: str, label: str, *, directory: bool) -> Path:
    path = Path(value)
    if not path.is_absolute() or (not path.is_dir() if directory else not path.is_file()):
        kind = "directory" if directory else "file"
        raise ValueError(f"{label} must be an existing absolute {kind}")
    return path


def _option_helpers():
    try:
        import yue_options
    except ImportError:
        module_dir = str(Path(__file__).resolve().parent)
        if module_dir not in sys.path:
            sys.path.insert(0, module_dir)
        import yue_options
    return yue_options


def _normalized_runtime(value, args):
    raw = {} if value is None else value
    if not isinstance(raw, dict):
        raise ValueError("runtime must be an object")
    helpers = _option_helpers()
    normalized = helpers.normalize_runtime(raw)
    for key, actual, flag in (
        ("precision", args.precision, "--precision"),
        ("memoryBudgetGiB", args.memory_budget_gib, "--memory-budget-gib"),
        ("vaeCoreFrames", args.vae_core_frames, "--vae-core-frames"),
        ("requireAc", args.require_ac, "--require-ac"),
    ):
        if key in raw and normalized[key] != actual:
            raise ValueError(f"runtime.{key} conflicts with {flag}")
    if "vaePath" in raw:
        vae = _local_path(normalized["vaePath"], "runtime.vaePath", directory=True)
        if vae.resolve() != args.vae.resolve():
            raise ValueError("runtime.vaePath conflicts with --vae")
    return raw, normalized


def _runtime_from_normalized(raw, normalized):
    result = {}
    if "queryChunkSize" in raw:
        result["query_chunk_size"] = normalized["queryChunkSize"]
    if "loraPath" in raw:
        result["lora_path"] = _local_path(normalized["loraPath"], "runtime.loraPath", directory=False)
    if "loraScale" in raw:
        result["lora_scale"] = float(normalized["loraScale"])
    if "lora_scale" in result and "lora_path" not in result:
        raise ValueError("runtime.loraScale requires runtime.loraPath")
    return result


def _controls(values):
    """Map Road Music's flat advanced controls using the shared validator."""
    helpers = _option_helpers()
    if values is None:
        values = {}
    normalized = helpers.normalize_advanced(values)
    controls = helpers.request_controls(normalized)
    if not isinstance(controls, dict):
        raise RuntimeError("YuE option controls returned an invalid mapping")
    return normalized, controls


def _merge_mapping(raw, extra, label):
    raw = {} if raw is None else raw
    if not isinstance(raw, dict):
        raise ValueError(f"{label} must be an object")
    result = dict(raw)
    for key, value in extra.items():
        if key in result and result[key] != value:
            raise ValueError(f"{label}.{key} conflicts with advanced.{key}")
        result[key] = value
    return result


def _prepared_request(data, controls):
    request = data.get("request")
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    request = dict(request)
    generation_extra = controls.get("generation_config", {})
    generation = _merge_mapping(request.pop("generation_config", None), generation_extra, "generation_config")
    abc = _merge_mapping(request.pop("abc_sampling", None), controls.get("abc_sampling", {}), "abc_sampling")
    semantic = _merge_mapping(
        request.pop("semantic_sampling", None), controls.get("semantic_sampling", {}), "semantic_sampling"
    )
    cfg = controls.get("cfg_scale")
    if cfg is not None:
        if "cfg_scale" in request and request["cfg_scale"] != cfg:
            raise ValueError("request.cfg_scale conflicts with advanced.cfgScale")
        request["cfg_scale"] = cfg
    return request, generation, abc or None, semantic or None


def _instrumental_request(request):
    """Match Lyra CLI's instrumental request transformation before public API use."""
    instrumental = request.pop("instrumental", False)
    if type(instrumental) is not bool:
        raise ValueError("instrumental must be true or false")
    if not instrumental:
        return request
    if request.get("lyrics") is None:
        request["lyrics"] = ""
    style = request.get("style", "Instrumental music")
    if not isinstance(style, str):
        raise ValueError("style must be a string")
    if "instrumental" not in style.lower():
        style = "Instrumental, " + style.lstrip("., ")
    for cue in ("no vocals", "no singing"):
        if cue not in style.lower():
            style = style.rstrip("., ") + f", {cue}"
    request["style"] = style.rstrip("., ") + "."
    return request


def _config(data):
    from yue2.protocol import GenerationConfig

    return GenerationConfig.from_dict(data or {})


def _effective_generation(generation_data, abc_sampling, semantic_sampling):
    from yue2.protocol import resolve_sampling

    config = _config(generation_data)
    effective = config.to_dict()
    if abc_sampling is not None:
        effective["abc"] = asdict(resolve_sampling(abc_sampling, config.abc))
    if semantic_sampling is not None:
        effective["semantic"] = asdict(resolve_sampling(semantic_sampling, config.semantic))
    return config, effective


def _source_provenance(source: Path, *, kind: str, result=None):
    manifest = source / "plan_manifest.json"
    manifest_data = _json_file(manifest) if manifest.is_file() else None
    value = {
        "kind": kind,
        "path": str(source),
        "plan_manifest": manifest_data,
        "stage_record": _stage_record(source, manifest),
    }
    if result is not None:
        value.update(
            identity=result.get("identity"), artifacts=result.get("artifacts"),
            timing=result.get("timing"), truncated=result.get("truncated"),
        )
    value["provenance_sha256"] = hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return value


def _stage_record(source: Path, manifest: Path):
    """Read optional plan settings without changing the native plan manifest schema."""
    path = source / "stage.json"
    if not path.is_file():
        return {"status": "not_recorded"}
    data = _json_file(path)
    if (
        data.get("schema") != "road-music-yue-plan-stage-v1"
        or data.get("stage") != "plan-score"
        or not isinstance(data.get("advanced"), dict)
        or not isinstance(data.get("effective_config"), dict)
        or not isinstance(data["effective_config"].get("generation"), dict)
        or data.get("plan_manifest_sha256") != _sha256(manifest)
    ):
        raise ValueError("Saved plan stage record does not match its native plan manifest")
    # Lyra's native loader rejects unknown manifest fields.  This record is
    # therefore bound to the manifest but is not independently signed.
    return {
        "status": "manifest_bound_unsealed",
        "sha256": _sha256(path),
        "plan_manifest_sha256": data["plan_manifest_sha256"],
        "stage": data["stage"],
        "advanced": data["advanced"],
        "effective_config": data["effective_config"],
    }


def _resource_monitor(output: Path, args, stage: str):
    try:
        from lyra.measure import ResourceMonitor
    except ImportError:
        return nullcontext()
    return ResourceMonitor(
        require_ac=args.require_ac,
        log_path=output.with_name(output.name + ".resources.jsonl"),
        report_path=output.with_name(output.name + ".resources.json"),
        metadata={
            "command": "road-music-yue-stage", "stage": stage,
            "memory_budget_gib": args.memory_budget_gib,
            "vae_core_frames": args.vae_core_frames, "precision": args.precision,
            "require_ac": args.require_ac,
        },
    )


def _attach_lora(pipe, runtime, stage):
    """Reject adapters that Lyra accepted syntactically but cannot apply here."""
    if "lora_path" not in runtime:
        return
    path = runtime["lora_path"]
    before = _sha256(path)
    pipe.load_lora(path, scale=runtime.get("lora_scale", 1.0))
    if _sha256(path) != before:
        raise RuntimeError("LoRA file changed while loading")
    targets = set()
    if getattr(pipe, "_nar_lora_adapter", None) is not None:
        targets.add("nar")
    if getattr(pipe, "precision", None) == "bf16" and getattr(pipe, "_ar_lora_adapter", None) is not None:
        targets.add("ar")
    required = {
        "plan-score": {"ar"},
        "generate": {"ar", "nar"},
        "plan": {"ar", "nar"},
        "synthesize": {"nar"},
    }.get(stage, set())
    if not targets & required:
        raise ValueError(f"LoRA has no applicable adapter for {stage}")
    runtime["lora_identity"] = {
        "sha256": before, "scale": runtime.get("lora_scale", 1.0),
        "targets": sorted(targets),
    }


def _assert_lora_unchanged(runtime):
    if "lora_identity" in runtime and _sha256(runtime["lora_path"]) != runtime["lora_identity"]["sha256"]:
        raise RuntimeError("LoRA file changed before generation")


def _validate_inherited_lora(runtime, explicit_runtime, source_config, source_kind):
    """Require evidence before replaying an inherited LoRA adapter."""
    recorded = source_config.get("runtime_overrides", {}) if isinstance(source_config, dict) else {}
    recorded = recorded.get("lora") if isinstance(recorded, dict) else None
    override = bool({"loraPath", "loraScale"} & set(explicit_runtime))
    if "lora_path" not in runtime:
        if recorded is not None and not override:
            raise ValueError(f"{source_kind} requires its recorded LoRA runtime")
        return set()
    current = {"sha256": _sha256(runtime["lora_path"]), "scale": runtime.get("lora_scale", 1.0)}
    if isinstance(recorded, dict):
        matches = recorded.get("sha256") == current["sha256"] and recorded.get("scale") == current["scale"]
        if not matches and not override:
            raise ValueError(f"Inherited LoRA does not match {source_kind}")
        return set(recorded.get("targets", ()))
    elif not override:
        raise ValueError(f"{source_kind} has no recorded LoRA evidence for inheritance")
    return set()


def _pipeline(args, generation, runtime, stage):
    from lyra.pipeline import YuE2Pipeline

    pipe = YuE2Pipeline.from_pretrained(
        args.model, vae=args.vae, precision=args.precision, local_files_only=True,
        memory_budget_gib=args.memory_budget_gib, vae_core_frames=args.vae_core_frames,
        query_chunk_size=runtime.get("query_chunk_size", 256), progress=False,
        generation_config=generation, require_ac=args.require_ac,
    )
    try:
        _attach_lora(pipe, runtime, stage)
    except BaseException:
        close = getattr(pipe, "close", None)
        if close is not None:
            close()
        raise
    return pipe


def _runtime_metadata(runtime, args):
    value = {"execution": {
        "precision": args.precision,
        "memory_budget_gib": args.memory_budget_gib,
        "vae_core_frames": args.vae_core_frames,
        "query_chunk_size": runtime.get("query_chunk_size", 256),
        "require_ac": args.require_ac,
    }}
    if "lora_identity" in runtime:
        value["lora"] = runtime["lora_identity"]
    return value


def _effective_with_runtime(config, runtime, args):
    """Make external LoRA identity part of the signed SongResult config."""
    value = dict(config)
    value["runtime_overrides"] = _runtime_metadata(runtime, args)
    return value


def _song_result(pipe, semantic, latents, audio, config, timing, noise):
    from lyra.pipeline import SongResult
    from yue2.storage import identity

    stamp = identity({"request": semantic.plan.request.to_dict(), "config": config, "weights": pipe.weights})
    return SongResult(audio, 48000, semantic, latents, config, pipe.weights, timing, stamp, noise)


def _ensure_only(controls, *, allow):
    allowed = set(allow)
    supplied = set(controls)
    rejected = supplied - allowed
    if rejected:
        raise ValueError("This stage cannot change " + ", ".join(sorted(rejected)))


def _sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_runtime(saved, source: Path, runtime, raw_runtime, args):
    config = saved.config
    expected = {
        "ar_precision": args.precision,
        "query_chunk_size": runtime.get("query_chunk_size", 256),
    }
    for key, value in expected.items():
        if config.get(key) != value:
            raise ValueError(f"Saved runtime {key} does not match this resume request")
    recorded = config.get("runtime_overrides", {})
    execution = recorded.get("execution") if isinstance(recorded, dict) else None
    if not isinstance(execution, dict):
        report_path = source.with_name(source.name + ".resources.json")
        try:
            report = _json_file(report_path)
            metadata = report.get("metadata")
        except (OSError, ValueError, json.JSONDecodeError):
            metadata = None
        if not isinstance(metadata, dict):
            raise ValueError("Saved result has no execution record for runtime verification")
        execution = {
            "precision": metadata.get("precision"),
            "memory_budget_gib": metadata.get("memory_budget_gib"),
            "vae_core_frames": metadata.get("vae_core_frames"),
            "query_chunk_size": config.get("query_chunk_size"),
            "require_ac": metadata.get("require_ac"),
        }
    expected_execution = {
        "precision": args.precision,
        "memory_budget_gib": args.memory_budget_gib,
        "vae_core_frames": args.vae_core_frames,
        "query_chunk_size": runtime.get("query_chunk_size", 256),
    }
    for key, value in expected_execution.items():
        if execution.get(key) != value:
            raise ValueError(f"Saved execution {key} does not match this resume request")
    if "requireAc" in raw_runtime and execution.get("require_ac") is not raw_runtime["requireAc"]:
        raise ValueError("Saved resource record cannot verify requireAc")
    recorded_lora = recorded.get("lora") if isinstance(recorded, dict) else None
    if "lora_path" in runtime:
        if not isinstance(recorded_lora, dict) or (
            recorded_lora.get("sha256") != _sha256(runtime["lora_path"])
            or recorded_lora.get("scale") != runtime.get("lora_scale", 1.0)
            or not recorded_lora.get("targets")
        ):
            raise ValueError("Saved LoRA identity does not match this resume request")
    elif recorded_lora is not None:
        raise ValueError("Saved song requires its recorded LoRA runtime")
    if "vaePath" in raw_runtime:
        expected_hash = saved.result.get("weights", {}).get("vae", {}).get("config_sha256")
        config_path = args.vae / "config.json"
        if not isinstance(expected_hash, str) or not config_path.is_file() or _sha256(config_path) != expected_hash:
            raise ValueError("Saved VAE identity does not match this resume request")


def _verify(args, data, source, output, raw_runtime, runtime, normalized, controls):
    if output != source:
        raise ValueError("verify output must be the existing source directory")
    _ensure_only(controls, allow={"abc_sampling", "semantic_sampling", "generation_config", "cfg_scale"})
    request, generation_data, abc_sampling, semantic_sampling = _prepared_request(data, controls)
    request = _instrumental_request(request)
    from lyra.artifacts import load_artifacts
    from yue2.protocol import SongRequest

    saved = load_artifacts(source)
    expected_request = SongRequest(**request)
    if expected_request.to_dict() != saved.semantic.plan.request.to_dict():
        raise ValueError("Saved song request does not match this resume request")
    _config, expected_generation = _effective_generation(generation_data, abc_sampling, semantic_sampling)
    if saved.config.get("generation") != expected_generation:
        raise ValueError("Saved sampling or ODE configuration does not match this resume request")
    if saved.config.get("cfg_scale") != expected_request.guidance:
        raise ValueError("Saved CFG setting does not match this resume request")
    _verify_runtime(saved, source, runtime, raw_runtime, args)
    return {
        "stage": "verify", "output": str(source), "identity": saved.result.get("identity"),
        "audioSeconds": saved.result.get("audio_seconds"), "truncated": saved.result.get("truncated"),
        "timing": saved.result.get("timing"), "advanced": normalized,
    }


def _run(args, data):
    stage = data.get("stage")
    if stage not in _STAGES:
        raise ValueError("Unsupported stage")
    raw_runtime, normalized_runtime = _normalized_runtime(data.get("runtime"), args)
    if "runtimeExplicit" in data:
        explicit_runtime, normalized_explicit = _normalized_runtime(data["runtimeExplicit"], args)
    else:
        # Older callers supplied only one object, which was necessarily explicit.
        explicit_runtime, normalized_explicit = raw_runtime, normalized_runtime
    for key in explicit_runtime:
        if normalized_explicit.get(key) != normalized_runtime.get(key):
            raise ValueError(f"runtimeExplicit.{key} does not match runtime.{key}")
    runtime = _runtime_from_normalized(raw_runtime, normalized_runtime)
    source = None
    if stage in {"plan", "synthesize", "decode", "verify"}:
        source_value = data.get("source")
        if not isinstance(source_value, str):
            raise ValueError(f"{stage} requires an absolute source directory")
        source = _absolute_existing_directory(source_value, "source")
    elif data.get("source") is not None:
        raise ValueError(f"{stage} does not accept source")
    if stage == "verify":
        supplied_output = Path(args.output)
        if (not supplied_output.is_absolute() or supplied_output.is_symlink()
                or supplied_output.resolve(strict=True) != source):
            raise ValueError("verify output must be the existing source directory")
        output = source
    else:
        output = _output_directory(args.output, source)
    normalized, controls = _controls(data.get("advanced"))
    if stage == "verify":
        return _verify(args, data, source, output, explicit_runtime, runtime, normalized, controls)
    if stage == "decode":
        ignored = {"precision", "queryChunkSize", "loraPath", "loraScale"} & set(explicit_runtime)
        if ignored:
            raise ValueError("decode cannot apply " + ", ".join(sorted(ignored)))
        # These controls cannot affect decoder-only replay.  Inherited values
        # are deliberately removed so they are neither loaded nor recorded.
        runtime.pop("query_chunk_size", None)
        runtime.pop("lora_path", None)
        runtime.pop("lora_scale", None)
    if stage == "synthesize":
        # NAR uses query chunks and loaded LoRA; VAE and guard settings affect
        # the following decode or its safety.  AR precision cannot affect replay.
        ignored = {"precision"} & set(explicit_runtime)
        if ignored:
            raise ValueError("synthesize cannot apply " + ", ".join(sorted(ignored)))

    if stage in {"generate", "plan-score"}:
        request, generation_data, abc_sampling, semantic_sampling = _prepared_request(data, controls)
        request = _instrumental_request(request)
        generation = _config(generation_data)
        with _resource_monitor(output, args, stage), _pipeline(args, generation, runtime, stage) as pipe:
            if stage == "plan-score":
                from lyra.artifacts import save_plan_artifacts

                _assert_lora_unchanged(runtime)
                plan = pipe.plan(**request, abc_sampling=abc_sampling)
                effective = _effective_with_runtime(
                    pipe.effective_config(plan.request, abc_sampling, semantic_sampling), runtime, args,
                )
                save_plan_artifacts(plan, output, _config(effective["generation"]))
                (output / "stage.json").write_text(json.dumps({
                    "schema": "road-music-yue-plan-stage-v1",
                    "stage": stage,
                    "plan_manifest_sha256": _sha256(output / "plan_manifest.json"),
                    "effective_config": effective,
                    "advanced": normalized,
                }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                return {
                    "stage": stage, "output": str(output), "truncated": plan.truncated,
                    "timing": plan.timing, "advanced": normalized,
                    "effectiveGeneration": effective["generation"],
                }
            _assert_lora_unchanged(runtime)
            generated = pipe(**request, abc_sampling=abc_sampling, semantic_sampling=semantic_sampling)
            effective = _effective_with_runtime(generated.config, runtime, args)
            result = _song_result(
                pipe, generated.semantic, generated.latents, generated.audio, effective,
                generated.timing, generated.noise,
            )
            result.save_artifacts(output)
            return {
                "stage": stage, "output": str(output), "truncated": result.truncated,
                "timing": result.timing, "advanced": normalized,
                "effectiveGeneration": result.config.get("generation"),
            }

    if stage == "plan":
        _ensure_only(controls, allow={"semantic_sampling", "generation_config", "cfg_scale"})
        if data.get("request") is not None:
            raise ValueError("plan reuses its saved request; do not pass request")
        from lyra.artifacts import load_artifacts, load_plan_artifacts
        from lyra.pipeline import initial_noise

        plan, saved_generation = load_plan_artifacts(source)
        if "cfg_scale" in controls:
            # CFG is absent from the tokenized text; preserve the manifest-verified
            # prefix and apply guidance only to the in-memory replay request.
            plan.request = replace(plan.request, cfg_scale=controls["cfg_scale"])
        saved_song = None
        if (source / "result.json").is_file():
            # A completed song's config is useful only after the full artifact
            # verifier confirms it still matches the manifest and result identity.
            saved_song = load_artifacts(source)
            source_generation = _config(saved_song.config["generation"])
            source_generation_status = "song_artifact_config_verified"
        else:
            source_generation = saved_generation or _config({})
            source_generation_status = "plan_artifact_config" if saved_generation is not None else "not_recorded_used_upstream_defaults"
        generation_data = source_generation.to_dict()
        generation_data.update(controls.get("generation_config", {}))
        generation = _config(generation_data)
        semantic_sampling = controls.get("semantic_sampling") or None
        plan_record = _stage_record(source, source / "plan_manifest.json")
        if saved_song is not None:
            _validate_inherited_lora(runtime, explicit_runtime, saved_song.config, "saved full song")
        elif plan_record["status"] == "not_recorded":
            _validate_inherited_lora(runtime, explicit_runtime, {}, "saved plan")
        else:
            _validate_inherited_lora(
                runtime, explicit_runtime, plan_record["effective_config"], "saved plan",
            )
        provenance = _source_provenance(source, kind="plan")
        with _resource_monitor(output, args, stage), _pipeline(args, generation, runtime, stage) as pipe:
            started = time.perf_counter()
            _assert_lora_unchanged(runtime)
            semantic = pipe.generate_semantic(plan, sampling=semantic_sampling)
            noise = initial_noise(len(semantic.tokens), plan.request.seed)
            nar_started = time.perf_counter()
            latents = pipe.synthesize(semantic, noise=noise)
            nar_seconds = time.perf_counter() - nar_started
            vae_started = time.perf_counter()
            audio = pipe.decode(latents)
            effective = _effective_with_runtime(
                pipe.effective_config(plan.request, None, semantic_sampling), runtime, args,
            )
            effective["replay"] = {
                "stage": stage, "source": provenance,
                "source_effective_generation": source_generation.to_dict(),
                "source_effective_generation_status": source_generation_status,
                "semantic_override": semantic_sampling,
            }
            timing = {
                "abc": plan.timing, "semantic": semantic.timing,
                "nar_seconds": nar_seconds,
                "vae_seconds": time.perf_counter() - vae_started,
                "load": dict(pipe.load_timing), "e2e_seconds": time.perf_counter() - started,
                "replay": {"stage": stage, "reused_plan": True},
            }
            result = _song_result(pipe, semantic, latents, audio, effective, timing, noise)
            result.save_artifacts(output)
        return {"stage": stage, "output": str(output), "truncated": result.truncated, "timing": result.timing,
                "advanced": normalized, "effectiveGeneration": result.config.get("generation")}

    from lyra.artifacts import load_artifacts
    from lyra.pipeline import initial_noise

    saved = load_artifacts(source)
    if stage == "synthesize":
        source_lora_targets = _validate_inherited_lora(runtime, explicit_runtime, saved.config, "saved song")
        if not ({"loraPath", "loraScale"} & set(explicit_runtime)) and source_lora_targets and "nar" not in source_lora_targets:
            # An AR-only adapter cannot affect NAR replay.  Keep the source
            # provenance, but do not misrepresent it as a new NAR setting.
            runtime.pop("lora_path", None)
            runtime.pop("lora_scale", None)
    source_generation = _config(saved.config["generation"])
    if stage == "synthesize":
        _ensure_only(controls, allow={"generation_config"})
        generation_data = source_generation.to_dict()
        generation_data.update(controls.get("generation_config", {}))
        generation = _config(generation_data)
        noise = saved.noise
        noise_source = "source_artifact"
        if noise is None:
            if saved.config.get("rng", {}).get("acoustic") != "numpy_pcg64_fp32_full_song_v1":
                raise ValueError("Exact synthesis replay requires retained noise.npy")
            noise = initial_noise(len(saved.semantic.tokens), saved.semantic.plan.request.seed)
            noise_source = "regenerated_from_request_seed"
    else:
        _ensure_only(controls, allow=set())
        generation = source_generation
        noise = saved.noise
        noise_source = "not_used"
    provenance = _source_provenance(source, kind="song", result=saved.result)
    with _resource_monitor(output, args, stage), _pipeline(args, generation, runtime, stage) as pipe:
        started = time.perf_counter()
        latents = saved.latents
        nar_seconds = 0.0
        if stage == "synthesize":
            _assert_lora_unchanged(runtime)
            nar_started = time.perf_counter()
            latents = pipe.synthesize(saved.semantic, noise=noise)
            nar_seconds = time.perf_counter() - nar_started
        vae_started = time.perf_counter()
        audio = pipe.decode(latents)
        effective = _effective_with_runtime(pipe.effective_config(saved.semantic.plan.request), runtime, args)
        effective["replay"] = {
            "stage": stage, "source": provenance,
            "source_effective_generation": source_generation.to_dict(),
            "source_runtime_overrides": saved.config.get("runtime_overrides"),
            "noise_source": noise_source, "reused_latents": stage == "decode",
        }
        timing = {
            "abc": saved.semantic.plan.timing, "semantic": saved.semantic.timing,
            "nar_seconds": nar_seconds, "vae_seconds": time.perf_counter() - vae_started,
            "load": dict(pipe.load_timing), "e2e_seconds": time.perf_counter() - started,
            "replay": {"stage": stage, "reused_latents": stage == "decode"},
        }
        result = _song_result(pipe, saved.semantic, latents, audio, effective, timing, noise)
        result.save_artifacts(output)
    return {"stage": stage, "output": str(output), "truncated": result.truncated, "timing": result.timing,
            "advanced": normalized, "effectiveGeneration": result.config.get("generation")}


def _parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--vae", required=True)
    parser.add_argument("--precision", required=True, choices=sorted(_PRECISIONS))
    parser.add_argument("--memory-budget-gib", required=True, type=float)
    parser.add_argument("--vae-core-frames", required=True, type=int)
    parser.add_argument("--query-chunk-size", type=int)
    parser.add_argument("--require-ac", action="store_true")
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    if not args.request.is_file():
        raise FileNotFoundError("request must be a JSON file")
    if args.precision not in _PRECISIONS:
        raise ValueError("Unsupported precision")
    if not math.isfinite(args.memory_budget_gib) or args.memory_budget_gib <= 0:
        raise ValueError("memory budget must be positive")
    if args.vae_core_frames < 1:
        raise ValueError("vae core frames must be positive")
    if args.query_chunk_size is not None and not 16 <= args.query_chunk_size <= 8192:
        raise ValueError("query chunk size must be in [16,8192]")
    args.model = _local_path(args.model, "model", directory=True)
    args.vae = _local_path(args.vae, "vae", directory=True)
    data = _json_file(args.request)
    if args.query_chunk_size is not None:
        runtime = data.setdefault("runtime", {})
        if not isinstance(runtime, dict):
            raise ValueError("runtime must be an object")
        if "queryChunkSize" in runtime and runtime["queryChunkSize"] != args.query_chunk_size:
            raise ValueError("runtime.queryChunkSize conflicts with --query-chunk-size")
        runtime["queryChunkSize"] = args.query_chunk_size
    print(json.dumps(_run(args, data), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
