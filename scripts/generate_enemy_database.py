#!/usr/bin/env python3

import csv
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
ENEMY_TYPES_CSV = ROOT / "prod_enemy_types.csv"
ENEMY_SKILLS_CSV = ROOT / "prod_enemy_skills.csv"
ENEMY_IMAGE_DIR = ROOT / "Image" / "Enemies"
ENEMY_DATA_DIR = ROOT / "Data" / "Enemies"
ENEMIES_JSON = ENEMY_DATA_DIR / "enemies.json"
ENEMIES_CSV = ENEMY_DATA_DIR / "enemies.csv"
ENEMY_SKILLS_JSON = ENEMY_DATA_DIR / "enemy_skills.json"
ENEMY_IMAGES_JSON = ENEMY_DATA_DIR / "enemy_images.json"
METADATA_JSON = ENEMY_DATA_DIR / "metadata.json"
SOURCE_BASE_URL = "https://www.mycryptoheroes.net/images/enemies"


PNG_SIGNATURE = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def as_int(value):
    return int(value) if value not in ("", None) else None


def unique_in_order(values):
    seen = set()
    result = []
    for value in values:
        key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def png_info(path):
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")
    return {
        "width": int.from_bytes(data[16:20], "big"),
        "height": int.from_bytes(data[20:24], "big"),
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def download_image(filename):
    url = f"{SOURCE_BASE_URL}/{filename}"
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; mycryptoheroes-db-fetcher/1.0)"})
    try:
        with urlopen(request, timeout=30) as response:
            data = response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        return {"filename": filename, "source_url": url, "error": str(error)}
    if not data.startswith(PNG_SIGNATURE):
        return {"filename": filename, "source_url": url, "error": "response was not a PNG"}
    ENEMY_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    (ENEMY_IMAGE_DIR / filename).write_bytes(data)
    return None


def build_skill_map(rows):
    grouped = {}
    for row in rows:
        skill_id = as_int(row["skillId"])
        skill = grouped.setdefault(
            skill_id,
            {
                "id": skill_id,
                "name": {
                    "en": row["name_en"],
                    "ja": row["name_ja"],
                },
                "description": {
                    "ja": {
                        "effects": [],
                        "text": "",
                    }
                },
            },
        )
        description = row["description_ja"]
        if description and description not in skill["description"]["ja"]["effects"]:
            skill["description"]["ja"]["effects"].append(description)
    for skill in grouped.values():
        skill["description"]["ja"]["text"] = " / ".join(skill["description"]["ja"]["effects"])
    return grouped


def missing_skill(skill_id):
    return {
        "id": skill_id,
        "name": {
            "en": None,
            "ja": None,
        },
        "description": {
            "ja": {
                "effects": [],
                "text": None,
            }
        },
        "missing_from_source_csv": True,
    }


def normalize_enemy(row, skill_map):
    enemy_type = as_int(row["enemyType"])
    active_skill_ids = [as_int(value) for value in row["actives"].split("/") if value]
    passive_skill_id = as_int(row["passive"])
    image = row["image"]
    image_path = ENEMY_IMAGE_DIR / image
    return {
        "id": enemy_type,
        "name": {
            "en": row["name_en"],
            "ja": row["name_ja"],
            "zh": row["name_zh"],
        },
        "image_file_path": f"Image/Enemies/{image}",
        "source_image_url": f"{SOURCE_BASE_URL}/{image}",
        "image_exists": image_path.exists(),
        "base_param": {
            "hp": as_int(row["param_hp"]),
            "phy": as_int(row["param_phy"]),
            "int": as_int(row["param_int"]),
            "agi": as_int(row["param_agi"]),
        },
        "trend": {
            "hp": as_int(row["trend_hp"]),
            "phy": as_int(row["trend_phy"]),
            "int": as_int(row["trend_int"]),
            "agi": as_int(row["trend_agi"]),
        },
        "active_skills": [skill_map.get(skill_id, missing_skill(skill_id)) for skill_id in active_skill_ids],
        "passive_skill": None
        if not passive_skill_id
        else skill_map.get(passive_skill_id, missing_skill(passive_skill_id)),
        "raw": {
            "exec": row["exec"].upper() == "TRUE",
            "active_skill_ids": active_skill_ids,
            "passive_skill_id": passive_skill_id,
            "image": image,
        },
    }


def write_enemies_csv(enemies):
    columns = [
        "id",
        "name_ja",
        "name_en",
        "image_file_path",
        "hp",
        "phy",
        "int",
        "agi",
        "trend_hp",
        "trend_phy",
        "trend_int",
        "trend_agi",
        "active_skill_ids",
        "active_skill_names_ja",
        "active_skill_descriptions_ja",
        "passive_skill_id",
        "passive_skill_name_ja",
        "passive_skill_description_ja",
    ]
    with ENEMIES_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for enemy in enemies:
            passive = enemy["passive_skill"] or {}
            writer.writerow(
                {
                    "id": enemy["id"],
                    "name_ja": enemy["name"]["ja"],
                    "name_en": enemy["name"]["en"],
                    "image_file_path": enemy["image_file_path"],
                    "hp": enemy["base_param"]["hp"],
                    "phy": enemy["base_param"]["phy"],
                    "int": enemy["base_param"]["int"],
                    "agi": enemy["base_param"]["agi"],
                    "trend_hp": enemy["trend"]["hp"],
                    "trend_phy": enemy["trend"]["phy"],
                    "trend_int": enemy["trend"]["int"],
                    "trend_agi": enemy["trend"]["agi"],
                    "active_skill_ids": "/".join(str(skill["id"]) for skill in enemy["active_skills"]),
                    "active_skill_names_ja": "; ".join(skill["name"]["ja"] or "" for skill in enemy["active_skills"]),
                    "active_skill_descriptions_ja": " | ".join(
                        skill["description"]["ja"]["text"] or "" for skill in enemy["active_skills"]
                    ),
                    "passive_skill_id": passive.get("id", ""),
                    "passive_skill_name_ja": passive.get("name", {}).get("ja", ""),
                    "passive_skill_description_ja": passive.get("description", {}).get("ja", {}).get("text", ""),
                }
            )


def build_image_manifest(enemy_rows):
    by_image = {}
    for row in enemy_rows:
        by_image.setdefault(row["image"], []).append(row)

    manifest = []
    for image_path in sorted(ENEMY_IMAGE_DIR.glob("*.png"), key=lambda path: path.name):
        rows = by_image.get(image_path.name, [])
        info = png_info(image_path)
        manifest.append(
            {
                "id": int(image_path.stem) if image_path.stem.isdigit() else image_path.stem,
                "filename": image_path.name,
                "image_file_path": f"Image/Enemies/{image_path.name}",
                "source_image_url": f"{SOURCE_BASE_URL}/{image_path.name}",
                "names": unique_in_order(
                    [
                        {
                            "en": row["name_en"],
                            "ja": row["name_ja"],
                            "zh": row["name_zh"],
                        }
                        for row in rows
                    ]
                ),
                "enemy_types": sorted(as_int(row["enemyType"]) for row in rows),
                "referenced_by_official_enemy_csv": bool(rows),
                **info,
            }
        )
    return manifest


def main():
    ENEMY_DATA_DIR.mkdir(parents=True, exist_ok=True)
    enemy_rows = read_csv(ENEMY_TYPES_CSV)
    skill_rows = read_csv(ENEMY_SKILLS_CSV)
    skill_map = build_skill_map(skill_rows)

    image_failures = []
    for filename in sorted({row["image"] for row in enemy_rows}):
        if not (ENEMY_IMAGE_DIR / filename).exists():
            failure = download_image(filename)
            if failure:
                image_failures.append(failure)

    enemies = [normalize_enemy(row, skill_map) for row in enemy_rows]
    enemies.sort(key=lambda enemy: enemy["id"])
    skills = [skill_map[skill_id] for skill_id in sorted(skill_map)]
    enemy_images = build_image_manifest(enemy_rows)

    ENEMIES_JSON.write_text(json.dumps(enemies, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ENEMY_SKILLS_JSON.write_text(json.dumps(skills, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ENEMY_IMAGES_JSON.write_text(json.dumps(enemy_images, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_enemies_csv(enemies)

    missing_skill_ids = sorted(
        {
            skill["id"]
            for enemy in enemies
            for skill in ([enemy["passive_skill"]] if enemy["passive_skill"] else []) + enemy["active_skills"]
            if skill.get("missing_from_source_csv")
        }
    )
    official_image_files = {row["image"] for row in enemy_rows}
    metadata = {
        "source_enemy_types_csv": "prod_enemy_types.csv",
        "source_enemy_skills_csv": "prod_enemy_skills.csv",
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "total_enemy_records": len(enemies),
        "total_enemy_skill_records": len(skills),
        "official_unique_image_count": len(official_image_files),
        "image_count": len(enemy_images),
        "official_linked_image_count": sum(1 for image in enemy_images if image["referenced_by_official_enemy_csv"]),
        "unlinked_valid_image_count": sum(1 for image in enemy_images if not image["referenced_by_official_enemy_csv"]),
        "image_download_failures": image_failures,
        "missing_skill_ids_from_source_csv": missing_skill_ids,
        "note": "Enemy records are generated from official CSV files. Existing valid enemy images are preserved; official CSV image references are linked by filename.",
    }
    METADATA_JSON.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {len(enemies)} enemies, {len(skills)} skills, "
        f"{len(enemy_images)} image records, {len(image_failures)} image failures."
    )


if __name__ == "__main__":
    main()
