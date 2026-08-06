#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path


def read_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Run HSE reference-sync Edge Function.")
    parser.add_argument("--env-file", type=Path, default=Path("/opt/supabase-selfhosted/.env.functions"))
    parser.add_argument("--url", default="https://supabase.hse-company.kz/functions/v1/reference-sync")
    args = parser.parse_args()

    env = read_env_file(args.env_file)
    token = env.get("BITRIX_REFERENCE_SYNC_TOKEN") or env.get("BITRIX_OUTGOING_TOKEN")
    if not token:
        raise SystemExit("BITRIX_REFERENCE_SYNC_TOKEN is required")

    url = f"{args.url}?{urllib.parse.urlencode({'token': token})}"
    body = json.dumps({"event": "reference-sync", "source": "manual-ui"}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        print(response.read().decode("utf-8"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
