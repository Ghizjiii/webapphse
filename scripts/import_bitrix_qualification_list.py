#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


IBLOCK_TYPE_ID = "lists"
IBLOCK_ID = 86


def plain(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize(value: str) -> str:
    return plain(value).casefold().replace("\u0451", "\u0435")


def read_env_file(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def read_docx_paragraphs(path: Path) -> list[str]:
    with ZipFile(path) as archive:
        document_xml = archive.read("word/document.xml")

    root = ET.fromstring(document_xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    items: list[str] = []

    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace))
        text = plain(text)
        if text:
            items.append(text)

    return items


def unique_professions(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for item in items:
        value = plain(re.sub(r"^\d+[\).\s-]+", "", item))
        if not value:
            continue
        key = normalize(value)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)

    return result


def call_bitrix_payload(webhook_url: str, method: str, params: dict[str, object]) -> dict[str, object]:
    url = f"{webhook_url.rstrip('/')}/{method}.json"
    body = urllib.parse.urlencode(params, doseq=True).encode("utf-8")
    last_error: Exception | None = None

    for attempt in range(1, 5):
        try:
            request = urllib.request.Request(url, data=body, method="POST")
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = response.read().decode("utf-8")
            data = json.loads(payload or "{}")
            if data.get("error"):
                raise RuntimeError(f"{data.get('error')}: {data.get('error_description')}")
            return data
        except Exception as error:  # noqa: BLE001 - CLI should report Bitrix payloads clearly
            last_error = error
            if attempt < 4:
                time.sleep(0.4 * attempt)
                continue
            raise

    raise RuntimeError(f"Bitrix request failed: {last_error}")


def call_bitrix(webhook_url: str, method: str, params: dict[str, object]) -> object:
    return call_bitrix_payload(webhook_url, method, params).get("result")


def fetch_existing_names(webhook_url: str) -> list[str]:
    names: list[str] = []
    start: int | str = 0

    while True:
        payload = call_bitrix_payload(webhook_url, "lists.element.get", {
            "IBLOCK_TYPE_ID": IBLOCK_TYPE_ID,
            "IBLOCK_ID": IBLOCK_ID,
            "start": start,
        })
        result = payload.get("result")
        if isinstance(result, list):
            names.extend(
                plain(str(item.get("NAME", "")))
                for item in result
                if isinstance(item, dict) and plain(str(item.get("NAME", "")))
            )

        next_start = payload.get("next")
        if next_start is None or next_start == "":
            break
        start = next_start

    return names


def fetch_total_count(webhook_url: str) -> int | None:
    payload = call_bitrix_payload(webhook_url, "lists.element.get", {
        "IBLOCK_TYPE_ID": IBLOCK_TYPE_ID,
        "IBLOCK_ID": IBLOCK_ID,
        "start": 0,
    })
    total = payload.get("total")
    if isinstance(total, int):
        return total
    if isinstance(total, str) and total.isdigit():
        return int(total)
    return None


def add_profession(webhook_url: str, name: str, sort_order: int) -> object:
    slug = re.sub(r"[^a-z0-9]+", "-", normalize(name).encode("ascii", "ignore").decode("ascii")).strip("-")
    code = slug or f"qualification-{sort_order}"
    return call_bitrix(webhook_url, "lists.element.add", {
        "IBLOCK_TYPE_ID": IBLOCK_TYPE_ID,
        "IBLOCK_ID": IBLOCK_ID,
        "ELEMENT_CODE": code,
        "FIELDS[NAME]": name,
        "FIELDS[SORT]": sort_order,
    })


def main() -> int:
    parser = argparse.ArgumentParser(description="Import qualification professions into Bitrix List 86 without duplicates.")
    parser.add_argument("docx", type=Path)
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument("--webhook-url", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    env = read_env_file(args.env_file) if args.env_file else {}
    webhook_url = args.webhook_url or env.get("BITRIX_WEBHOOK_URL") or env.get("BITRIX_WEBHOOK") or ""
    if not webhook_url:
        raise SystemExit("BITRIX_WEBHOOK_URL is required")

    professions = unique_professions(read_docx_paragraphs(args.docx))
    existing = fetch_existing_names(webhook_url)
    bitrix_total = fetch_total_count(webhook_url)
    existing_keys = {normalize(name) for name in existing}
    missing = [name for name in professions if normalize(name) not in existing_keys]

    print(json.dumps({
        "source_count": len(professions),
        "existing_count": len(existing),
        "bitrix_total": bitrix_total,
        "missing_count": len(missing),
        "missing": missing,
        "dry_run": args.dry_run,
    }, ensure_ascii=False, indent=2))

    if args.dry_run:
        return 0

    for offset, name in enumerate(missing, start=1):
        add_profession(webhook_url, name, (len(existing) + offset) * 10)
        print(f"added: {name}")
        time.sleep(0.15)

    print(json.dumps({"added_count": len(missing)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
