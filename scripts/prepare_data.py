#!/usr/bin/env python3
"""Prepare the European Captives Leaflet prototype data.

The source CSV is never modified. Geographic values are joined from the separate,
editable data/location_mapping.csv crosswalk. Exact duplicate source rows are
suppressed in the mapping-ready output and recorded in duplicate_rows_removed.csv.
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source" / "BC Project Captivity Complete Location Date.csv"
MAPPING = ROOT / "data" / "location_mapping.csv"
OUT_DIR = ROOT / "data"

MISSING = {"", "n/a", "na", "nan", "none", "null"}
FIELD_MAP = {
    "Captive's Name": "captive_name_original",
    "Date": "date_original",
    "Source": "source",
    "Place of Captivity": "place_of_captivity_original",
    "Notes": "notes",
    "Total": "total",
    "Gender": "gender",
    "Place of Origin": "place_of_origin_original",
    "Convert": "convert",
    "Ship Name": "ship_name",
}


def clean(value: object) -> str:
    return "" if value is None else str(value).strip()


def is_missing(value: str) -> bool:
    return clean(value).lower() in MISSING


def parse_date(raw: str) -> tuple[int | None, str, str]:
    """Return normalized year, precision, and a transparent normalization note."""
    value = clean(raw)
    if is_missing(value):
        return None, "unknown", "No usable date in source."

    if re.fullmatch(r"\d{4}", value):
        return int(value), "year", "Source supplies a year only."

    try:
        parsed = datetime.strptime(value, "%m/%d/%Y")
    except ValueError:
        return None, "unparsed", "Date could not be parsed automatically; original value retained."

    year = parsed.year
    if year in (617, 624):
        corrected = year + 1000
        return corrected, "year_inferred", (
            f"Prototype inference: {year} interpreted as {corrected}; verify against the cited source."
        )

    if parsed.month == 1 and parsed.day == 1:
        return year, "year", (
            "January 1 is treated as a year-level placeholder because that pattern dominates the dataset; "
            "confirm against project data-entry conventions."
        )

    return year, "day", "Day-level date retained from source."


def safe_number(value: str) -> float | None:
    value = clean(value)
    if is_missing(value):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except ValueError:
        return None


def load_mapping() -> tuple[dict[tuple[str, str], dict], dict[str, dict]]:
    crosswalk: dict[tuple[str, str], dict] = {}
    locations: dict[str, dict] = {}
    with MAPPING.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            row = {k: clean(v) for k, v in row.items()}
            key = (row["role"], row["original_label"])
            if key in crosswalk:
                raise ValueError(f"Duplicate mapping row: {key}")
            if row["mapping_id"] in locations:
                raise ValueError(f"Duplicate mapping_id: {row['mapping_id']}")
            lat = safe_number(row["latitude"])
            lon = safe_number(row["longitude"])
            mapped = {
                **row,
                "latitude": lat,
                "longitude": lon,
                "is_mappable": row["status"] == "resolved" and lat is not None and lon is not None,
            }
            crosswalk[key] = mapped
            locations[row["mapping_id"]] = mapped
    return crosswalk, locations


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    crosswalk, locations = load_mapping()

    with SOURCE.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError("Source CSV has no header row.")
        header_lookup = {h.strip(): h for h in reader.fieldnames}
        required = set(FIELD_MAP) | {"Lat_C", "Long_C"}
        missing_headers = required - set(header_lookup)
        if missing_headers:
            raise ValueError(f"Missing source columns: {sorted(missing_headers)}")
        source_rows = list(reader)

    seen: dict[tuple[str, ...], int] = {}
    duplicates: list[dict] = []
    records: list[dict] = []
    points: list[dict] = []
    connections: defaultdict[tuple[str, str], list[str]] = defaultdict(list)
    unmapped: Counter[tuple[str, str]] = Counter()

    normalized_headers = [h.strip() for h in reader.fieldnames]

    for source_row, raw in enumerate(source_rows, start=2):
        trimmed = {h.strip(): clean(raw.get(h, "")) for h in reader.fieldnames}
        fingerprint = tuple(trimmed.get(h, "") for h in normalized_headers)
        if fingerprint in seen:
            duplicates.append({
                "removed_source_row": source_row,
                "retained_source_row": seen[fingerprint],
                "captive_name": trimmed.get("Captive's Name", ""),
                "date": trimmed.get("Date", ""),
                "source": trimmed.get("Source", ""),
                "place_of_captivity": trimmed.get("Place of Captivity", ""),
                "place_of_origin": trimmed.get("Place of Origin", ""),
            })
            continue
        seen[fingerprint] = source_row

        rec = {out: trimmed.get(src, "") for src, out in FIELD_MAP.items()}
        rec_id = f"EC{source_row - 1:06d}"
        name = rec["captive_name_original"]
        display_name = name if not is_missing(name) and name != "#NAME?" else "[Unnamed record]"
        year, date_precision, date_note = parse_date(rec["date_original"])

        origin_label = rec["place_of_origin_original"] or "n/a"
        captivity_label = rec["place_of_captivity_original"] or "n/a"
        origin = crosswalk.get(("origin", origin_label))
        captivity = crosswalk.get(("captivity", captivity_label))
        if origin is None:
            unmapped[("origin", origin_label)] += 1
            origin = crosswalk[("origin", "n/a")]
        if captivity is None:
            unmapped[("captivity", captivity_label)] += 1
            captivity = crosswalk[("captivity", "n/a")]

        origin_ok = bool(origin["is_mappable"])
        captivity_ok = bool(captivity["is_mappable"])
        geography_status = (
            "both" if origin_ok and captivity_ok else
            "origin_only" if origin_ok else
            "captivity_only" if captivity_ok else
            "neither"
        )

        quality_flags: list[str] = []
        if display_name == "[Unnamed record]":
            quality_flags.append("name_missing_or_excel_error")
        if date_precision in {"unknown", "unparsed"}:
            quality_flags.append("date_unusable")
        if date_precision == "year_inferred":
            quality_flags.append("date_century_inferred")
        if origin["certainty"] in {"low", "medium"} and origin_ok:
            quality_flags.append(f"origin_{origin['certainty']}_certainty")
        if not origin_ok and not is_missing(origin_label):
            quality_flags.append("origin_unresolved")
        if not captivity_ok and not is_missing(captivity_label):
            quality_flags.append("captivity_unresolved")

        record = {
            "record_id": rec_id,
            "source_row": source_row,
            "display_name": display_name,
            **rec,
            "year": year,
            "date_precision": date_precision,
            "date_normalization_note": date_note,
            "origin_mapping_id": origin["mapping_id"] if origin_ok else "",
            "origin_standardized": origin["standardized_name"] if origin_ok else "",
            "origin_mapping_status": origin["status"],
            "origin_certainty": origin["certainty"],
            "origin_review_note": origin["review_note"],
            "captivity_mapping_id": captivity["mapping_id"] if captivity_ok else "",
            "captivity_standardized": captivity["standardized_name"] if captivity_ok else "",
            "captivity_mapping_status": captivity["status"],
            "captivity_certainty": captivity["certainty"],
            "captivity_review_note": captivity["review_note"],
            "geography_status": geography_status,
            "data_quality_flags": quality_flags,
        }
        records.append(record)

        common_properties = {
            "record_id": rec_id,
            "display_name": display_name,
            "year": year,
            "date_precision": date_precision,
        }
        if origin_ok:
            points.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [origin["longitude"], origin["latitude"]]},
                "properties": {**common_properties, "role": "origin", "place": origin["standardized_name"], "mapping_id": origin["mapping_id"]},
            })
        if captivity_ok:
            points.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [captivity["longitude"], captivity["latitude"]]},
                "properties": {**common_properties, "role": "captivity", "place": captivity["standardized_name"], "mapping_id": captivity["mapping_id"]},
            })
        if origin_ok and captivity_ok:
            connections[(origin["mapping_id"], captivity["mapping_id"])].append(rec_id)

    if unmapped:
        raise ValueError(f"Unmapped labels found: {dict(unmapped)}")

    location_payload = {}
    for mapping_id, loc in locations.items():
        if loc["is_mappable"]:
            location_payload[mapping_id] = {
                "mapping_id": mapping_id,
                "role": loc["role"],
                "original_label": loc["original_label"],
                "standardized_name": loc["standardized_name"],
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "certainty": loc["certainty"],
                "review_note": loc["review_note"],
            }

    years = [r["year"] for r in records if r["year"] is not None]
    geo_counts = Counter(r["geography_status"] for r in records)
    metadata = {
        "title": "European Captives Leaflet Prototype",
        "generated_from": SOURCE.name,
        "source_rows": len(source_rows),
        "mapping_records": len(records),
        "exact_duplicate_rows_removed": len(duplicates),
        "minimum_year": min(years),
        "maximum_year": max(years),
        "mappable_locations": len(location_payload),
        "distinct_connection_pairs": len(connections),
        "geography_counts": dict(geo_counts),
        "method_note": (
            "Lines join documented origin and captivity associations. They do not reconstruct a route. "
            "Unknown source coordinates are intentionally excluded."
        ),
    }

    app_payload = {"metadata": metadata, "locations": location_payload, "records": records}
    (OUT_DIR / "app-data.json").write_text(json.dumps(app_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / "record-points.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": points}, ensure_ascii=False), encoding="utf-8")

    connection_features = []
    for (origin_id, captivity_id), rec_ids in sorted(connections.items()):
        origin = location_payload[origin_id]
        captivity = location_payload[captivity_id]
        connection_features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [origin["longitude"], origin["latitude"]],
                    [captivity["longitude"], captivity["latitude"]],
                ],
            },
            "properties": {
                "origin": origin["standardized_name"],
                "captivity": captivity["standardized_name"],
                "record_count": len(rec_ids),
                "record_ids": rec_ids,
                "interpretation": "Documented association, not reconstructed travel route.",
            },
        })
    (OUT_DIR / "connections.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": connection_features}, ensure_ascii=False), encoding="utf-8")

    corrected_rows = []
    for r in records:
        origin = location_payload.get(r["origin_mapping_id"])
        captivity = location_payload.get(r["captivity_mapping_id"])
        corrected_rows.append({
            **{k: ("; ".join(v) if isinstance(v, list) else v) for k, v in r.items()},
            "origin_latitude": "" if not origin else origin["latitude"],
            "origin_longitude": "" if not origin else origin["longitude"],
            "captivity_latitude": "" if not captivity else captivity["latitude"],
            "captivity_longitude": "" if not captivity else captivity["longitude"],
        })
    corrected_fields = list(corrected_rows[0])
    write_csv(OUT_DIR / "european_captives_mapping_ready.csv", corrected_rows, corrected_fields)
    write_csv(
        OUT_DIR / "duplicate_rows_removed.csv",
        duplicates,
        ["removed_source_row", "retained_source_row", "captive_name", "date", "source", "place_of_captivity", "place_of_origin"],
    )
    (OUT_DIR / "data_summary.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
