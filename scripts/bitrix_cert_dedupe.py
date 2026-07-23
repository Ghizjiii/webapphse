#!/usr/bin/env python3
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ENTITY_TYPE_ID = int(os.environ.get("BITRIX_SMART_PROCESS_ENTITY_TYPE_ID", "1056"))
DEAL_ID = os.environ.get("BITRIX_DEDUPE_DEAL_ID", "98").strip()
MODE = os.environ.get("BITRIX_DEDUPE_MODE", "dry-run").strip().lower()
ENV_FILE = os.environ.get("BITRIX_DEDUPE_ENV_FILE", "/opt/supabase-selfhosted/.env.functions")

FIELD_PHOTO = "ufCrm12_1772578817"
FIELD_PRINTED = "ufCrm12_1772561447"
FIELD_PROTOCOL = "ufCrm12_1772561202"
FIELD_DOCUMENT_NUMBER = "ufCrm12_1772561299"


def plain(value):
    return str(value or "").strip()


def normalize_title(value):
    return re.sub(r"\s+", " ", plain(value)).casefold()


def dedupe_key(item):
    title = item_title(item)
    left, sep, right = title.partition(" - ")
    if sep:
        name_tokens = normalize_title(left).split()
        course_key = normalize_title(right)
        if len(name_tokens) >= 2 and course_key:
            return f"{name_tokens[0]} {name_tokens[1]}::{course_key}"

    return normalize_title(title) or f"__untitled__:{item_id(item)}"


def truthy(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = plain(value).upper()
    return text in {"Y", "YES", "TRUE", "1"}


def has_value(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float, bool)):
        return True
    if isinstance(value, list):
        return any(has_value(item) for item in value)
    if isinstance(value, dict):
        return any(has_value(item) for item in value.values())
    return bool(value)


def item_id(item):
    return int(plain(item.get("id") or item.get("ID") or "0") or "0")


def item_title(item):
    return plain(item.get("title") or item.get("TITLE"))


def get_field(item, code):
    variants = {code, code.upper(), code.lower()}
    for key in variants:
        if key in item:
            return item[key]
    return None


def item_rank(item):
    return (
        int(truthy(get_field(item, FIELD_PRINTED))),
        int(has_value(get_field(item, FIELD_DOCUMENT_NUMBER))),
        int(has_value(get_field(item, FIELD_PROTOCOL))),
        int(has_value(get_field(item, FIELD_PHOTO))),
        item_id(item),
    )


def bitrix_call(webhook, method, params):
    url = f"{webhook.rstrip('/')}/{method}.json"
    payload = json.dumps(params, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
    parsed = json.loads(body or "{}")
    if parsed.get("error"):
        raise RuntimeError(f"{method}: {parsed.get('error_description') or parsed.get('error')}")
    result = parsed.get("result", parsed)
    if isinstance(result, dict) and "next" in parsed:
        result = dict(result)
        result["next"] = parsed["next"]
    return result


def read_env_file_value(path, name):
    if not path or not os.path.exists(path):
        return ""
    prefix = f"{name}="
    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            current = line.strip()
            if not current or current.startswith("#") or not current.startswith(prefix):
                continue
            value = current[len(prefix):].strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            return value
    return ""


def rows_from_result(result):
    if isinstance(result, dict):
        rows = result.get("items") or result.get("result")
    else:
        rows = result
    if not isinstance(rows, list):
        return []

    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        fields = row.get("fields")
        if isinstance(fields, dict):
            merged = dict(row)
            merged.update(fields)
            out.append(merged)
        else:
            out.append(row)
    return out


def list_items_for_deal(webhook):
    filters = [
        {"parentId2": DEAL_ID},
        {"PARENT_ID_2": DEAL_ID},
        {"parentId1": DEAL_ID},
        {"PARENT_ID_1": DEAL_ID},
    ]
    seen = {}
    successful_filter = None

    for filter_payload in filters:
        start = 0
        local_count = 0
        while True:
            result = bitrix_call(
                webhook,
                "crm.item.list",
                {
                    "entityTypeId": ENTITY_TYPE_ID,
                    "order": {"id": "ASC"},
                    "filter": filter_payload,
                    "select": [
                        "id",
                        "title",
                        "companyId",
                        "parentId1",
                        "parentId2",
                        "PARENT_ID_1",
                        "PARENT_ID_2",
                        "*",
                        "uf*",
                    ],
                    "start": start,
                },
            )
            rows = rows_from_result(result)
            for row in rows:
                row_id = item_id(row)
                if row_id:
                    seen[row_id] = row
            local_count += len(rows)
            next_start = result.get("next") if isinstance(result, dict) else None
            if next_start is None or len(rows) == 0:
                break
            start = int(next_start)
        if local_count:
            successful_filter = filter_payload
            break

    return list(seen.values()), successful_filter


def build_plan(items):
    groups = {}
    for item in items:
        key = dedupe_key(item)
        groups.setdefault(key, []).append(item)

    plan = []
    for key, rows in sorted(groups.items(), key=lambda pair: item_title(pair[1][0])):
        keep = sorted(rows, key=item_rank, reverse=True)[0]
        delete = [row for row in rows if item_id(row) != item_id(keep)]
        plan.append(
            {
                "key": key,
                "title": item_title(keep),
                "keep_id": item_id(keep),
                "delete_ids": [item_id(row) for row in sorted(delete, key=item_id)],
                "count": len(rows),
                "rank": item_rank(keep),
            }
        )
    return plan


def write_backup(items, plan):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = f"/tmp/bitrix-cert-dedupe-deal-{DEAL_ID}-{timestamp}.json"
    csv_path = f"/tmp/bitrix-cert-dedupe-deal-{DEAL_ID}-{timestamp}.csv"

    with open(json_path, "w", encoding="utf-8") as file:
        json.dump({"deal_id": DEAL_ID, "entity_type_id": ENTITY_TYPE_ID, "items": items, "plan": plan}, file, ensure_ascii=False, indent=2)

    with open(csv_path, "w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["title", "count", "keep_id", "delete_ids"])
        for row in plan:
            writer.writerow([row["title"], row["count"], row["keep_id"], " ".join(map(str, row["delete_ids"]))])

    return json_path, csv_path


def main():
    webhook = (
        os.environ.get("BITRIX_WEBHOOK_URL") or
        os.environ.get("BITRIX_WEBHOOK") or
        read_env_file_value(ENV_FILE, "BITRIX_WEBHOOK_URL") or
        read_env_file_value(ENV_FILE, "BITRIX_WEBHOOK") or
        ""
    )
    if not webhook.strip():
        print("BITRIX_WEBHOOK_URL is not set", file=sys.stderr)
        return 2
    if MODE not in {"dry-run", "apply"}:
        print("BITRIX_DEDUPE_MODE must be dry-run or apply", file=sys.stderr)
        return 2

    items, used_filter = list_items_for_deal(webhook)
    plan = build_plan(items)
    duplicates = [row for row in plan if row["delete_ids"]]
    delete_ids = [delete_id for row in duplicates for delete_id in row["delete_ids"]]
    json_path, csv_path = write_backup(items, plan)

    print(f"deal_id={DEAL_ID}")
    print(f"entity_type_id={ENTITY_TYPE_ID}")
    print(f"filter={used_filter}")
    print(f"total_items={len(items)}")
    print(f"unique_titles={len(plan)}")
    print(f"duplicate_groups={len(duplicates)}")
    print(f"delete_count={len(delete_ids)}")
    print(f"backup_json={json_path}")
    print(f"backup_csv={csv_path}")

    for row in duplicates[:30]:
        print(f"KEEP {row['keep_id']} | DELETE {','.join(map(str, row['delete_ids']))} | {row['title']}")

    if MODE == "dry-run":
        print("mode=dry-run; no items deleted")
        return 0

    for delete_id in delete_ids:
        bitrix_call(webhook, "crm.item.delete", {"entityTypeId": ENTITY_TYPE_ID, "id": delete_id})
        print(f"deleted={delete_id}")
        time.sleep(0.15)

    print(f"deleted_total={len(delete_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
