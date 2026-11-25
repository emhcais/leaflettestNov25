# Validation report

Generated: 2026-11-25

## Passed checks

- Original CSV byte-for-byte preserved (SHA-256: `b76a037865d5ad300f0f4683421069107048978f58d837c4c92ce592626156dc`).
- Python transformation script compiles and runs reproducibly.
- JavaScript passes `node --check`.
- Local HTTP smoke test returns 200 for `index.html` and `data/app-data.json`.
- All local HTML asset references resolve.
- 3,105 mapping-ready records generated from 3,137 source rows.
- 32 exact duplicate source rows are suppressed and logged.
- 3,298 point features and 73 aggregated connection features are valid JSON/GeoJSON.
- Connection feature counts reconcile to 928 records with both mappable origin and captivity locations.
- 66 Tripoli records receive the corrected crosswalk point.
- 0 unknown captivity records retain the false source fallback point.
- 88 crosswalk rows have unique mapping IDs; 79 are mappable.
- Coordinates in the application location registry are within valid latitude/longitude bounds.
- Browser-facing record JSON contains no latitude/longitude fields; the interface obtains coordinates only from the location registry.

## Environment limitation

This isolated build environment blocks direct requests to the external Leaflet CDN, so a full browser-rendered map test could not be run here. The app fails gracefully when Leaflet is unavailable. GitHub Pages deployment should be tested in a normal browser with internet access; alternatively, copy Leaflet 1.9.4 assets into the repository for offline deployment.
