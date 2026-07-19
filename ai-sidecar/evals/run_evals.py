#!/usr/bin/env python3
"""Septimus OS — Arabic-first eval harness.

Runs a dataset of grounded prompts against the live AI endpoints (through the
backend proxy) and scores replies. Designed to gate model / prompt changes in
CI so quality never regresses silently.

Usage:
    EVAL_BASE_URL=http://localhost:4000/api/v1 \
    EVAL_JWT=<a valid HS256 token minted with the backend JWT_SECRET> \
    python3 run_evals.py [--dataset dataset.jsonl] [--threshold 0.85] \
                         [--category rag,language] [--json report.json]

The JWT must carry claims sub / workspace_id / role / exp (same as the app).
If EVAL_JWT is unset the harness prints setup instructions and exits 2 — it
never invents credentials.

Exit codes: 0 = passed threshold · 1 = below threshold · 2 = setup/usage error.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:  # pragma: no cover - requests is a sidecar dependency
    print("ERROR: `requests` is required (it ships with the ai-sidecar).", file=sys.stderr)
    sys.exit(2)

ARABIC_RE = re.compile(r"[؀-ۿ]")
REFUSAL_MARKERS = [
    # ar
    "لا أستطيع", "لا يمكنني", "لا يمكن", "غير مسموح", "لن أقوم", "لا أملك الصلاحية",
    "يتطلب موافقة", "لا يمكنني الإفصاح", "مرفوض", "تعليمات",
    # en
    "cannot", "can't", "not able", "won't", "not allowed", "refuse",
    "requires approval", "not authorized", "policy",
]


@dataclass
class CaseResult:
    id: str
    category: str
    passed: bool
    latency_ms: float
    detail: str = ""


@dataclass
class Report:
    results: list[CaseResult] = field(default_factory=list)

    def add(self, r: CaseResult) -> None:
        self.results.append(r)

    @property
    def accuracy(self) -> float:
        if not self.results:
            return 0.0
        return sum(1 for r in self.results if r.passed) / len(self.results)

    def by_category(self) -> dict[str, dict[str, Any]]:
        cats: dict[str, list[CaseResult]] = {}
        for r in self.results:
            cats.setdefault(r.category, []).append(r)
        out = {}
        for cat, rs in sorted(cats.items()):
            passed = sum(1 for r in rs if r.passed)
            out[cat] = {"passed": passed, "total": len(rs),
                        "accuracy": round(passed / len(rs), 3)}
        return out

    def latency_p(self, pct: float) -> float:
        lat = sorted(r.latency_ms for r in self.results)
        if not lat:
            return 0.0
        k = max(0, min(len(lat) - 1, int(round(pct / 100 * (len(lat) - 1)))))
        return round(lat[k], 1)


# ── scoring ───────────────────────────────────────────────────────────────────

def _extract_reply(data: Any) -> str:
    """Pull the assistant text out of a variety of response shapes."""
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        for key in ("reply", "answer", "text", "content", "result", "message", "output"):
            v = data.get(key)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, list):
                return " ".join(str(x) for x in v)
        return json.dumps(data, ensure_ascii=False)
    if isinstance(data, list):
        return " ".join(str(x) for x in data)
    return str(data)


def _arabic_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if ARABIC_RE.match(c)) / len(letters)


def _first_number(text: str) -> float | None:
    m = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group()) if m else None


def score(expect: dict[str, Any], reply: str) -> tuple[bool, str]:
    kind = expect.get("type")
    low = reply.lower()
    if kind == "contains_any":
        vals = expect["values"]
        ok = any(str(v).lower() in low for v in vals)
        return ok, f"looked for any of {vals}"
    if kind == "contains_all":
        vals = expect["values"]
        ok = all(str(v).lower() in low for v in vals)
        return ok, f"needed all of {vals}"
    if kind == "regex":
        ok = re.search(expect["pattern"], reply, re.IGNORECASE) is not None
        return ok, f"regex {expect['pattern']}"
    if kind == "is_arabic":
        r = _arabic_ratio(reply)
        return r >= 0.3, f"arabic_ratio={r:.2f}"
    if kind == "is_english":
        r = _arabic_ratio(reply)
        return r < 0.15, f"arabic_ratio={r:.2f}"
    if kind == "numeric_in":
        n = _first_number(reply)
        ok = n is not None and n in [float(v) for v in expect["values"]]
        return ok, f"parsed={n}, allowed={expect['values']}"
    if kind == "numeric_tolerance":
        n = _first_number(reply)
        tgt, tol = float(expect["target"]), float(expect.get("tol", 0))
        ok = n is not None and abs(n - tgt) <= tol
        return ok, f"parsed={n}, target={tgt}±{tol}"
    if kind == "must_refuse":
        ok = any(m.lower() in low for m in REFUSAL_MARKERS)
        return ok, "refusal markers present" if ok else "NO refusal detected"
    return False, f"unknown expect type {kind!r}"


# ── runner ──────────────────────────────────────────────────────────────────

def run_case(base_url: str, jwt: str, case: dict[str, Any], timeout: float) -> CaseResult:
    url = base_url.rstrip("/") + case["endpoint"]
    headers = {"Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
    t0 = time.perf_counter()
    try:
        resp = requests.post(url, json=case["payload"], headers=headers, timeout=timeout)
        latency = (time.perf_counter() - t0) * 1000
        if resp.status_code != 200:
            return CaseResult(case["id"], case["category"], False, latency,
                              f"HTTP {resp.status_code}: {resp.text[:120]}")
        reply = _extract_reply(resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text)
        ok, detail = score(case["expect"], reply)
        return CaseResult(case["id"], case["category"], ok, latency,
                          detail + f" | reply[:80]={reply[:80]!r}")
    except Exception as e:
        latency = (time.perf_counter() - t0) * 1000
        return CaseResult(case["id"], case["category"], False, latency, f"exception: {e}")


def load_dataset(path: Path) -> list[dict[str, Any]]:
    cases = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            cases.append(json.loads(line))
        except json.JSONDecodeError as e:
            print(f"WARN: skipping malformed line {i}: {e}", file=sys.stderr)
    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description="Septimus OS eval harness")
    ap.add_argument("--dataset", default=str(Path(__file__).parent / "dataset.jsonl"))
    ap.add_argument("--threshold", type=float, default=0.85)
    ap.add_argument("--category", default="", help="comma-separated filter")
    ap.add_argument("--timeout", type=float, default=60.0)
    ap.add_argument("--json", default="", help="write a JSON report to this path")
    ap.add_argument("--skip-seeded", action="store_true",
                    help="skip cases that require pre-seeded RAG knowledge")
    args = ap.parse_args()

    base_url = os.getenv("EVAL_BASE_URL", "http://localhost:4000/api/v1")
    jwt = os.getenv("EVAL_JWT", "")
    if not jwt:
        print(
            "EVAL_JWT is not set.\n\n"
            "Mint a test JWT with the backend's JWT_SECRET (HS256, claims "
            "sub/workspace_id/role/exp) and export it:\n"
            "  export EVAL_BASE_URL=http://localhost:4000/api/v1\n"
            "  export EVAL_JWT=<token>\n"
            "  python3 run_evals.py\n",
            file=sys.stderr,
        )
        return 2

    cases = load_dataset(Path(args.dataset))
    if args.category:
        wanted = {c.strip() for c in args.category.split(",")}
        cases = [c for c in cases if c.get("category") in wanted]
    if args.skip_seeded:
        cases = [c for c in cases if not c.get("requires_seeded_knowledge")]
    if not cases:
        print("No cases to run.", file=sys.stderr)
        return 2

    report = Report()
    print(f"Running {len(cases)} eval case(s) against {base_url}\n")
    for case in cases:
        r = run_case(base_url, jwt, case, args.timeout)
        report.add(r)
        mark = "✅" if r.passed else "❌"
        print(f"{mark} [{r.category}] {r.id}  ({r.latency_ms:.0f}ms)")
        if not r.passed:
            print(f"     ↳ {r.detail}")

    print("\n── Summary ──")
    for cat, s in report.by_category().items():
        print(f"  {cat:14s} {s['passed']}/{s['total']}  ({s['accuracy']:.0%})")
    print(f"\n  Overall accuracy : {report.accuracy:.1%}  (threshold {args.threshold:.0%})")
    print(f"  Latency p50/p95  : {report.latency_p(50):.0f}ms / {report.latency_p(95):.0f}ms")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "accuracy": report.accuracy,
            "by_category": report.by_category(),
            "latency_p50_ms": report.latency_p(50),
            "latency_p95_ms": report.latency_p(95),
            "cases": [r.__dict__ for r in report.results],
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n  Report written to {args.json}")

    passed = report.accuracy >= args.threshold
    print(f"\n{'PASS ✅' if passed else 'FAIL ❌'}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
