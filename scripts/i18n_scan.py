#!/usr/bin/env python3
"""
i18n_scan.py — find UNWIRED hardcoded UI text in the dashboard components.

Flags double-quoted string literals that look like human-facing UI text and are
NOT already localized. It also validates recursive key parity between the
Arabic and English dictionaries.

Usage:
    python3 scripts/i18n_scan.py            # grouped by file
    python3 scripts/i18n_scan.py --json     # machine-readable
    python3 scripts/i18n_scan.py --check    # exit non-zero on violations
"""
import glob
import json
import os
import re
import sys

BASE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "src", "components", "dashboard",
)
FILES = (
    [os.path.join(BASE, "LiquidDashboard.tsx"),
     os.path.join(BASE, "WidgetMarketplaceModal.tsx")]
    + sorted(glob.glob(os.path.join(BASE, "widgets", "*.tsx")))
)

STR = re.compile(r'"([^"\\]{2,})"')
T_FALLBACK = re.compile(r't\(\s*"[^"]*"\s*,\s*"([^"]*)"')
T_KEY = re.compile(r't\(\s*"([^"]*)"')
TECHNICAL_PROPERTY = re.compile(
    r'\b(?:id|key|promptKey|nameKey|typeKey|daysKey|title|category|updated|'
    r'lastRunKey|timeZone)\s*:\s*$'
)


def is_class_like(s: str) -> bool:
    toks = s.split()
    if not toks:
        return False
    return all(re.fullmatch(r'[\w:/.\[\]#%()-]+', tk) for tk in toks) and (
        len(toks) > 1 or '-' in s or ':' in s
    )


def is_ui(s: str) -> bool:
    s = s.strip()
    if len(s) < 2:
        return False
    if s.startswith(('http', '/', '#', '@/', 'use ')):
        return False
    if '{' in s or '}' in s or '$' in s:    # template expressions
        return False
    if not re.search(r'[A-Za-z؀-ۿ]', s):
        return False
    if '.' in s and ' ' not in s:          # key path / filename
        return False
    # single lowercase/snake token ⇒ id / css / icon-name / storage key, not UI text
    if re.fullmatch(r'[a-z0-9_]+', s):
        return False
    if re.fullmatch(r'[A-Z][A-Z0-9_]{1,}', s):  # enum, currency, agent ID
        return False
    if re.fullmatch(r'[A-Za-z_]+/[A-Za-z_]+', s):  # IANA time zone
        return False
    if is_class_like(s):                    # tailwind classes
        return False
    return True


def scan(path):
    hits = []
    with open(path, encoding='utf-8') as fh:
        for n, line in enumerate(fh, 1):
            ls = line.strip()
            if ls.startswith(('import', 'export ', 'from ', '//', '*')):
                continue
            skip = set(T_FALLBACK.findall(line)) | set(T_KEY.findall(line))
            for m in STR.finditer(line):
                s = m.group(1)
                if s in skip:
                    continue
                # skip if this string is the value of a className attribute
                if re.search(r'className\s*=\s*(\{`|")?[^"]*' + re.escape(s), line) and is_class_like(s):
                    continue
                prefix = line[:m.start()]
                if TECHNICAL_PROPERTY.search(prefix):
                    continue
                if re.search(r'event\.key\s*===\s*$', prefix):
                    continue
                if is_ui(s):
                    hits.append((n, s))
    # de-dup within a file, keep first line
    seen, uniq = set(), []
    for n, s in hits:
        if s not in seen:
            seen.add(s)
            uniq.append((n, s))
    return uniq


def flatten_keys(value, prefix=""):
    keys = set()
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else key
            if isinstance(child, dict):
                keys.update(flatten_keys(child, path))
            else:
                keys.add(path)
    return keys


def locale_parity():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    locale_root = os.path.join(project_root, "frontend", "src", "locales")
    with open(os.path.join(locale_root, "ar.json"), encoding="utf-8") as fh:
        ar_keys = flatten_keys(json.load(fh))
    with open(os.path.join(locale_root, "en.json"), encoding="utf-8") as fh:
        en_keys = flatten_keys(json.load(fh))
    return sorted(en_keys - ar_keys), sorted(ar_keys - en_keys)


def main():
    as_json = "--json" in sys.argv
    check = "--check" in sys.argv
    out, total = {}, 0
    for f in FILES:
        if not os.path.exists(f):
            continue
        hits = scan(f)
        if hits:
            out[os.path.relpath(f, BASE)] = hits
            total += len(hits)

    missing_ar, missing_en = locale_parity()
    if as_json:
        print(json.dumps({
            "unwired_literals": {
                k: [{"line": n, "text": s} for n, s in v]
                for k, v in out.items()
            },
            "missing_in_ar": missing_ar,
            "missing_in_en": missing_en,
        }, ensure_ascii=False, indent=2))
        return

    for rel, hits in out.items():
        print(f"\n## {rel}  ({len(hits)})")
        for n, s in hits:
            print(f"  L{n}: {s}")
    print(f"\nTOTAL UNIQUE UNWIRED LITERALS: {total}")
    print(f"MISSING IN AR: {len(missing_ar)}")
    print(f"MISSING IN EN: {len(missing_en)}")
    for key in missing_ar:
        print(f"  ar <- {key}")
    for key in missing_en:
        print(f"  en <- {key}")

    if check and (total or missing_ar or missing_en):
        sys.exit(1)


if __name__ == "__main__":
    main()
