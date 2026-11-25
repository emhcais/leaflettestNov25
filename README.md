# European Captives Leaflet Prototype

A static Leaflet application built from **BC Project Captivity Complete Location Date.csv**. It is the technical foundation for the later North African map and comparative interface.

## What the prototype includes

- Location-level origin and captivity markers, sized by the number of filtered records.
- Search across names, places, sources, notes, ships, dates, and record IDs.
- A year-range filter covering the normalized range in the source data.
- Aggregated lines for records with both a mappable origin and captivity location.
- A record panel and detailed view showing source fields and mapping-review notes, but not latitude/longitude.
- Downloadable original CSV, corrected mapping-ready CSV, point GeoJSON, and connection GeoJSON.
- Unknown and unresolved records remain searchable rather than being assigned a false map point.

## Important interpretation

A line shows that one source record contains both an origin and a captivity-place association. It **does not reconstruct a route, sequence of travel, or final destination**. “Place of Captivity” is preserved as the source field name and is not silently relabeled as “destination.”

Marker and line concentrations describe this surviving documentary sample. They are not estimates of the historical captive population.

## Data pipeline

The source file is preserved unchanged at:

`data/source/BC Project Captivity Complete Location Date.csv`

The mapping application is built from two inputs:

1. The unchanged source CSV.
2. `data/location_mapping.csv`, a separate, editable crosswalk for geographic normalization.

Run:

```bash
python3 scripts/prepare_data.py
```

The script:

- trims leading/trailing whitespace in generated outputs;
- assigns stable record IDs based on original source row numbers;
- suppresses 32 exact duplicate rows in the mapping-ready output and logs them in `data/duplicate_rows_removed.csv`;
- removes the false fallback point from unknown captivity locations;
- replaces Tripoli `#FIELD!` values through the mapping crosswalk;
- retains original place labels alongside standardized names;
- records mapping status, certainty, and review notes;
- normalizes dates for year filtering while retaining the original date string;
- interprets years 617 and 624 as 1617 and 1624 only as explicitly flagged prototype inferences;
- generates application JSON, mapping-ready CSV, point GeoJSON, and aggregated connection GeoJSON.

## Generated data files

| File | Purpose |
|---|---|
| `data/app-data.json` | Browser-ready records and location registry |
| `data/european_captives_mapping_ready.csv` | Corrected, mapping-ready research table |
| `data/record-points.geojson` | One point feature per mappable record-location role |
| `data/connections.geojson` | Aggregated origin–captivity associations with record IDs |
| `data/duplicate_rows_removed.csv` | Audit trail of exact duplicates suppressed from mapped output |
| `data/data_summary.json` | Reproducible counts and year bounds |
| `data/location_mapping.csv` | Editable geographic crosswalk and scholarly review notes |

## Mapping review status

The crosswalk uses three certainty levels:

- **high** — clear modern place identification;
- **medium** — probable identification or a broad regional centroid;
- **low** — tentative historical spelling/context match that requires review.

Unresolved labels are intentionally left without coordinates. Before publication, a subject specialist should review every medium- and low-certainty row in `data/location_mapping.csv`, especially Apson, Feloe, Foulston, Gallipoli, Hampton, Low, Lyn, St. Fillo, St. Martin Parish, St. Martin's, St.Urbes, Warom, and Yahall.

## Run locally

Because the app fetches JSON, do not open `index.html` directly with a `file://` URL. From this folder run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The map tiles and Leaflet library are loaded from public web CDNs, so the interactive basemap requires an internet connection.

## Publish on GitHub Pages

1. Create a new GitHub repository.
2. Copy the contents of this folder to the repository root.
3. Commit and push to the default branch.
4. In **Settings → Pages**, deploy from the default branch and root folder.
5. Test the public URL on desktop and mobile.

No build step is required.

## WordPress.com integration

After GitHub Pages publishes the site, test whether the WordPress.com plan permits an iframe for the GitHub Pages URL. A typical embed, where supported, is:

```html
<iframe
  src="https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/"
  title="European Captives interactive map"
  width="100%"
  height="820"
  loading="lazy">
</iframe>
```

If the plan or editor strips the iframe, use a prominent link or button that opens the GitHub Pages map in a new tab.

## Recommended next scholarly review

1. Review medium- and low-certainty mappings.
2. Confirm whether January 1 values are year placeholders across the project.
3. Verify the six inferred three-digit years against sources.
4. Review the duplicate audit before accepting suppression for publication.
5. Define the `Total` field and classify individual/group/crew records.
6. Resolve `#NAME?` and unnamed source rows.
7. Select a public data and code license before repository publication.
8. Add a citation statement, version number, and release date.

## Technical structure

```text
index.html
styles.css
app.js
data/
  source/BC Project Captivity Complete Location Date.csv
  location_mapping.csv
  app-data.json
  european_captives_mapping_ready.csv
  record-points.geojson
  connections.geojson
  duplicate_rows_removed.csv
  data_summary.json
scripts/
  prepare_data.py
```
