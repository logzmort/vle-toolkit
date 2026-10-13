# Property-data provenance

The built-in library transcribes Tables B.3 and B.4 from the course reference images supplied for this teaching tool. The scans themselves are not distributed in this repository. Printed values, coefficient conventions, validity intervals, and source notes are retained in the JSON data.

## Table B.4 — Antoine equation constants

- 87 species and 94 fits, all expressed as `log10(Psat in mmHg) = A − B / (T in °C + C)`.
- Printed fit order is retained. At overlapping temperatures, the first applicable fit has priority.
- The table footnote cites T. Boublik, V. Fried, and E. Hala, *The Vapour Pressures of Pure Substances*, Elsevier, Amsterdam, 1973. Starred constants are attributed there to *Lange’s Handbook of Chemistry*, 9th edition, 1956.
- Individual records preserve source and transcription notes. The diethylene glycol formula is identified as `C4H10O3`, with a note documenting the supplied table’s `C4H10O2` formula; this does not change its Antoine coefficients.

## Table B.3 — liquid-water vapor pressure

The supplied table footnote cites R. H. Perry and C. H. Chilton, editors, *Chemical Engineers’ Handbook*, 5th edition, McGraw-Hill, New York, 1973, Tables 3-3 and 3-5.

Only the **liquid-water section, 0–101.9 °C**, is used. The ice section is excluded because this application models vapor–liquid equilibrium.

The data retain **660 printed entries** in `originalPoints`. The calculation table contains **656 accepted entries**. The following nonmonotonic values from the supplied images are flagged and omitted from the lookup, while their original values remain recorded:

| Temperature (°C) | Printed pressure (mmHg) |
| --- | --- |
| 18.6 | 16.771 |
| 33.4 | 33.584 |
| 33.6 | 38.018 |
| 95.2 | 938.59 |

No replacement value is claimed to be a corrected table entry. Where a calculation spans a flagged point, it linearly interpolates between the neighboring accepted nodes:

```text
f = (T − Tlow) / (Thigh − Tlow)
Psat(T) = Plow + f × (Phigh − Plow)
P in kPa = P in mmHg × 101.325 / 760
```

The worked solution identifies the interpolation interval and any skipped printed entry. Tabulated water is never extrapolated outside its range.

For example, at 25.35 °C the accepted table entries are 24.182 mmHg at 25.3 °C and 24.326 mmHg at 25.4 °C. Thus `f = 0.5` and `Psat = 24.254 mmHg = 3.23360072 kPa`.

`data/library.json` is the application’s source of truth. `data/water_b3.json` is a separate copy used for table-focused regression checks. If water data are revised, update both copies consistently and rebuild the standalone HTML.
