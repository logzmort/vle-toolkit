# Contributing

Edit files in `src/` and `data/`, then rebuild the committed standalone application:

```sh
python3 scripts/build.py
node tests/vle_engine.test.js
python3 scripts/build.py --check
```

Do not edit generated `index.html` directly. The UI’s `learning.js` and `interactions.js` are inserted into `app.js` by the builder and are not standalone scripts. The numerical engine can be used independently in Node.js through `require('./src/vle_engine.js')`.

For a numerical change, add a regression check tied to a known result, conservation condition, unit conversion, or range boundary. Preserve source fit order, explicitly reported data gaps, and the original printed water entries. Keep the separate water-table copy consistent with its entry in `library.json`.

For a property-data correction, record the source, exact equation convention, coefficient units, temperature limits, and what changed. Do not silently repair a questionable printed value or extend a fit’s validity range. Adding another published library is a separate scope decision; this application’s built-in library is intentionally limited to the supplied Tables B.3 and B.4.

For an interface change, open the rebuilt file in a browser and check both desktop and narrow-screen layouts, all four diagram views, worked calculations, and JSON save/open. Verify that it still works offline. If a preset changes, also update the workbook and `practice_examples.json` so students receive matching instructions and results.

When reporting a problem, include the browser, diagram view, expected result, and a saved problem JSON if possible. Remove any personal notes from that file before posting it publicly.
