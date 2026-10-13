#!/usr/bin/env python3
"""Build the offline student app using only Python's standard library."""

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def replace_once(text, marker, replacement):
    if text.count(marker) != 1:
        raise ValueError(f"Expected exactly one build marker: {marker}")
    return text.replace(marker, replacement)


def build():
    html = (SRC / "template.html").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")
    for marker, filename in [
        ("/* LEARNING_FUNCTIONS */", "learning.js"),
        ("/* INTERACTIONS */", "interactions.js"),
    ]:
        app = replace_once(app, marker, (SRC / filename).read_text(encoding="utf-8"))
    html = replace_once(
        html,
        '<link rel="stylesheet" href="toolkit.css">',
        "<style>\n" + (SRC / "toolkit.css").read_text(encoding="utf-8") + "\n</style>",
    )
    library = json.loads((ROOT / "data/library.json").read_text(encoding="utf-8"))
    html = replace_once(
        html,
        "__SPECIES_LIBRARY__",
        json.dumps(library, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"),
    )
    for filename, content in [
        ("../vendor/d3-7.9.0.min.js", (ROOT / "vendor/d3-7.9.0.min.js").read_text(encoding="utf-8")),
        ("vle_engine.js", (SRC / "vle_engine.js").read_text(encoding="utf-8")),
        ("app.js", app),
    ]:
        html = replace_once(
            html,
            f'<script src="{filename}"></script>',
            "<script>\n" + content.replace("</script", "<\\/script") + "\n</script>",
        )
    html = replace_once(
        html,
        "</body>",
        "<!-- D3 license\n" + (ROOT / "vendor/d3-LICENSE").read_text(encoding="utf-8") + "\n-->\n</body>",
    )
    if re.search(r'<(?:script|link)[^>]+(?:src|href)=', html):
        raise ValueError("The standalone build still references an external script or stylesheet.")
    if "__SPECIES_LIBRARY__" in html:
        raise ValueError("The species library was not embedded.")
    return html.encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check that committed index.html matches its sources without writing it.")
    args = parser.parse_args()
    expected = build()
    target = ROOT / "index.html"
    if args.check:
        if not target.exists() or target.read_bytes() != expected:
            print("index.html is missing or stale. Run: python3 scripts/build.py", file=sys.stderr)
            return 1
        print("Standalone build is current; all code and property data are embedded.")
    else:
        target.write_bytes(expected)
        print(f"Built index.html ({len(expected):,} bytes); no installation needed to open it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
