# Data dictionary

## `european_captives_mapping_ready.csv`

All source text fields are trimmed in this generated file. The unchanged values remain available in the original CSV.

| Field | Meaning |
|---|---|
| `record_id` | Stable prototype identifier derived from the original CSV row number (`EC000001`, etc.). Gaps indicate exact duplicate rows suppressed from this output. |
| `source_row` | One-based spreadsheet row including the header row; use this to return to the original source. |
| `display_name` | Interface label. Missing, `n/a`, and `#NAME?` source values become `[Unnamed record]`. |
| `captive_name_original` | Trimmed value from the source name column. |
| `date_original` | Date string as supplied by the source. |
| `year` | Normalized year used by the chronological filter. |
| `date_precision` | `day`, `year`, `year_inferred`, `unknown`, or `unparsed`. |
| `date_normalization_note` | Explanation of how the date was interpreted. |
| `source` | Documentary/bibliographic source text. |
| `place_of_captivity_original` | Source place-of-captivity value. It is not relabeled as destination. |
| `notes` | Source notes. |
| `total` | Source total value; semantics remain undefined and it is not used to weight the map. |
| `gender` | Source gender code. |
| `place_of_origin_original` | Source place-of-origin value. |
| `convert` | Source conversion-status value. |
| `ship_name` | Source ship-name value. |
| `origin_mapping_id` | Foreign key to the origin row in `location_mapping.csv`; blank when unknown or unresolved. |
| `origin_standardized` | Standardized origin display name. |
| `origin_mapping_status` | `resolved`, `unresolved`, or `unknown`. |
| `origin_certainty` | `high`, `medium`, `low`, or `unresolved`. |
| `origin_review_note` | Geographic interpretation and review note. |
| `captivity_mapping_id` | Foreign key to the captivity row in `location_mapping.csv`; blank when unknown or unresolved. |
| `captivity_standardized` | Standardized captivity-place display name. |
| `captivity_mapping_status` | `resolved`, `unresolved`, or `unknown`. |
| `captivity_certainty` | Certainty category for the mapped captivity place. |
| `captivity_review_note` | Geographic interpretation and review note. |
| `geography_status` | `both`, `origin_only`, `captivity_only`, or `neither`, based on mappable points. |
| `data_quality_flags` | Semicolon-separated flags generated without altering the source claim. |
| `origin_latitude`, `origin_longitude` | Coordinates from the separate mapping crosswalk. |
| `captivity_latitude`, `captivity_longitude` | Coordinates from the separate mapping crosswalk. |

## `location_mapping.csv`

| Field | Meaning |
|---|---|
| `mapping_id` | Stable geographic crosswalk identifier. |
| `role` | `origin` or `captivity`; the same named place can have separate role rows. |
| `original_label` | Exact trimmed place label used in the source data. |
| `standardized_name` | Reviewed modern display name; blank when unresolved. |
| `latitude`, `longitude` | Prototype point coordinate; blank when unknown or unresolved. |
| `status` | `resolved`, `unresolved`, or `unknown`. |
| `certainty` | `high`, `medium`, `low`, or `unresolved`. |
| `review_note` | Reason for the identification or warning that source review is required. |
| `source_method` | Provenance/method note for the prototype crosswalk. |

## GeoJSON semantics

- `record-points.geojson` creates one point per record-location role. One record can therefore create zero, one, or two point features.
- `connections.geojson` aggregates all records sharing the same standardized origin/captivity pair. `record_count` is the number of mapping-ready records in that pair, and `record_ids` identifies them.
- A connection is an association within a source record, **not** a reconstructed itinerary, route, or proof that captivity place was a final destination.
