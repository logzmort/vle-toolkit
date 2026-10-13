/* Run: node tests/vle_engine.test.js */
const assert = require('node:assert/strict');
const V = require('../src/vle_engine.js');
const species = require('../data/library.json');
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
// Historical class coefficients are regression fixtures only, not app presets.
const c = [
  { name: 'Benzene', A: 4.72583, B: 1660.652, C: -1.461, tUnit: 'K', pUnit: 'bar', minC: 60.25, maxC: 100.35 },
  { name: 'Toluene', A: 4.07827, B: 1343.943, C: -53.773, tUnit: 'K', pUnit: 'bar', minC: 35.37, maxC: 111.51 },
  { name: 'Ethylbenzene', A: 4.07488, B: 1419.315, C: -60.539, tUnit: 'K', pUnit: 'bar', minC: 56.59, maxC: 137.12 },
], z = [0.5, 0.3, 0.2];
let count = 0;
function test(name, run) { run(); count++; console.log(`PASS ${name}`); }

test('Class bubble/dew pressure and temperature agree with worked solutions', () => {
  near(V.bubblePressure(80, c, z), 65.45152018199839);
  near(V.dewPressure(80, c, z), 40.62956651712397);
  const bubble = V.bubbleTemperature(55, c, z), dew = V.dewTemperature(55, c, z);
  near(bubble.temperatureC, 74.6363285850415);
  near(dew.temperatureC, 88.76889895350052);
  assert.ok(bubble.trace.length > 0 && dew.trace.length > 0);
  assert.ok(bubble.trace.every(step => step.low <= step.mid && step.mid <= step.high));
  assert.equal(bubble.evaluation.chosenFits[0].fitIndex, 0);
});
test('Flash closes compositions and species balances; boundary and single phases work', () => {
  const result = V.flash(55, 80, c, z);
  assert.equal(result.phase, 'two-phase');
  near(result.beta, 0.44845118970442854);
  near(result.sumX, 1, 1e-10); near(result.sumY, 1, 1e-10);
  near(result.balanceError, 0, 1e-14);
  assert.ok(result.trace.length > 0);
  assert.equal(V.flash(80, 80, c, z).phase, 'liquid');
  assert.equal(V.flash(30, 80, c, z).phase, 'vapor');
  assert.equal(V.flash(V.bubblePressure(80, c, z), 80, c, z).phase, 'bubble');
  assert.equal(V.flash(V.dewPressure(80, c, z), 80, c, z).phase, 'dew');
});
test('Pure saturated state leaves vapor fraction undetermined', () => {
  const p = V.vaporPressure(c[0], 80), result = V.flash(p, 80, c, [1, 0, 0]);
  assert.equal(result.phase, 'indeterminate'); assert.equal(result.beta, null);
  near(V.bubbleTemperature(p, c, [1, 0, 0]).temperatureC, 80);
  assert.deepEqual(V.coverageIntervals(c, [0, 1, 0]), [[35.37, 111.51]]);
});
test('Conversions and base-e Antoine form preserve saturation pressure', () => {
  near(V.temperatureToC(212, 'F'), 100); near(V.temperatureFromC(100, 'K'), 373.15);
  near(V.pressureToKPa(760, 'mmHg'), 101.325); near(V.pressureFromKPa(100, 'Pa'), 100000);
  const equivalent = { ...c[0], A: (c[0].A + 2) * Math.log(10), B: c[0].B * Math.log(10), C: c[0].C + 273.15, tUnit: 'C', pUnit: 'kPa', logBase: 'e' };
  near(V.vaporPressure(equivalent, 80), V.vaporPressure(c[0], 80));
});
const fit = (A, minC, maxC) => ({ A, B: 100, C: 300, tUnit: 'C', pUnit: 'kPa', logBase: '10', minC, maxC });
const discontinuous = { name: 'Synthetic discontinuous species', fits: [fit(2, 0, 50), fit(3, 50, 100)] };
test('Root solver does not invent a root across a discontinuous fit switch', () => {
  const result = V.bubbleTemperature(100, [discontinuous], [1]);
  assert.equal(result.ok, false);
  const envelope = V.ptEnvelope([discontinuous], [1], 21);
  assert.ok(envelope.points.includes(null)); assert.equal(envelope.segments.length, 2);
  assert.ok(envelope.points.filter(Boolean).every(point => point.bubblePressure < 60 || point.bubblePressure > 500));
});
test('Fit overlap respects first fit, and coverage intersections retain gaps', () => {
  const overlap = { name: 'Overlap', fits: [fit(2, 0, 70), fit(3, 50, 100)] };
  assert.equal(V.evaluateVaporPressure(overlap, 60).fitIndex, 0);
  assert.equal(V.evaluateVaporPressure(overlap, 80).fitIndex, 1);
  const gap = { name: 'Gap', fits: [fit(2, 0, 40), fit(2, 60, 100)] };
  const other = { name: 'Other', fits: [fit(2, 20, 80)] };
  assert.deepEqual(V.coverageIntervals([gap, other], [.5, .5]), [[20, 40], [60, 80]]);
  assert.throws(() => V.vaporPressure(gap, 50));
  assert.ok(V.ptEnvelope([gap, other], [.5, .5], 21).points.includes(null));
});
test('Extrapolation requires explicit range and reports its fit and distance', () => {
  assert.throws(() => V.vaporPressure(c[0], 120));
  assert.throws(() => V.vaporPressure(c[0], 120, { extrapolate: true }));
  const options = { extrapolate: true, temperatureRange: [60, 130] };
  const result = V.evaluateVaporPressure(c[0], 120, options);
  assert.equal(result.extrapolated, true); near(result.distanceC, 19.65);
  const evaluation = V.evaluateSaturation(120, c, z, options);
  assert.equal(evaluation.extrapolations.length, 2);
  assert.throws(() => V.vaporPressure(c[0], 140, options));
});
test('Binary diagrams reproduce class points and preserve unavailable segments', () => {
  const t = V.binaryTxy(55, c.slice(0, 2), 6);
  assert.equal(t.gaps.length, 0); near(t.points[0].T, 90.43667369126888); near(t.points[5].T, 61.40956359915299);
  near(V.binaryPxy(80, c.slice(0, 2), 6).points[3].P, 76.07170502125066);
  const narrowed = [{ ...c[0], minC: 90, maxC: 100 }, c[1]];
  const incomplete = V.binaryTxy(55, narrowed, 11);
  assert.ok(incomplete.points.includes(null)); assert.ok(incomplete.gaps.length > 0);
});
test('Validation rejects incorrect fractions and Antoine singularities', () => {
  assert.equal(V.validate(c, [.1, .1, .1]).ok, false);
  assert.equal(V.validate([{ ...c[0], C: -350 }], [1]).ok, false);
  assert.equal(V.bubbleTemperature(500, c, z).ok, false);
});
test('Built-in source library fits parse, first-fit priority holds, and envelopes stay open', () => {
  const library = Array.isArray(species) ? species : species.species;
  assert.ok(Array.isArray(library) && library.length > 0);
  for (const item of library) {
    assert.equal(V.validate([item], [1]).ok, true, item.name);
    for (const f of item.fits) assert.ok(V.vaporPressure({ name: item.name, fits: [f] }, (f.minC + f.maxC) / 2) > 0);
  }
  const trio = ['b4-benzene', 'b4-toluene', 'b4-ethylbenzene'].map(id => library.find(item => item.id === id));
  const first = trio[0].fits[0];
  assert.equal(V.evaluateVaporPressure(trio[0], (first.minC + first.maxC) / 2).fitIndex, 0);
  const envelope = V.ptEnvelope(trio, z, 101);
  assert.ok(envelope.points.filter(Boolean).every(point => point.bubblePressure >= point.dewPressure - 1e-8));
  assert.ok(envelope.points.filter(Boolean).length > 100);
});
test('Computed temperatures classify as boundaries for mixtures and all library species', () => {
  const library = Array.isArray(species) ? species : species.species;
  const trio = ['b4-benzene', 'b4-toluene', 'b4-ethylbenzene'].map(id => library.find(item => item.id === id));
  for (const components of [c, trio]) {
    for (const kind of ['bubble', 'dew']) {
      const root = V[`${kind}Temperature`](55, components, z);
      if (root.ok) assert.equal(V.flash(55, root.temperatureC, components, z).phase, kind);
      else assert.ok(root.reason.includes('No') || root.reason.includes('no common'));
    }
  }
  for (const item of library) {
    const fit = item.fits[0];
    for (const fraction of [0.173, 0.397, 0.827]) {
      const T = fit.minC + fraction * (fit.maxC - fit.minC);
      const P = V.vaporPressure(item, T);
      for (const kind of ['bubble', 'dew']) {
        const root = V[`${kind}Temperature`](P, [item], [1]);
        assert.equal(root.ok, true, `${item.name} ${kind}`);
        assert.equal(V.flash(P, root.temperatureC, [item], [1]).phase, 'indeterminate', `${item.name} ${kind} at ${P} kPa`);
      }
    }
  }
});
test('Boundary classification remains relative at very low pressures', () => {
  const lowPressure = c.map(item => ({ ...item, A: item.A - 8 }));
  const P = 55e-8;
  for (const kind of ['bubble', 'dew']) {
    const root = V[`${kind}Temperature`](P, lowPressure, z);
    assert.equal(root.ok, true);
    assert.equal(V.flash(P, root.temperatureC, lowPressure, z).phase, kind);
  }
});
test('Multiple supported roots are returned with an explicit warning', () => {
  const multi = { name: 'Synthetic multiple-root fits', fits: [fit(2, 0, 50), fit(1.95, 60, 100)] };
  const result = V.bubbleTemperature(49, [multi], [1]);
  assert.equal(result.ok, true); assert.equal(result.roots.length, 2);
  assert.ok(result.warning.includes('Multiple roots'));
  assert.equal(result.temperatureC, result.roots[0].temperatureC);
  assert.ok(result.roots[0].temperatureC < result.roots[1].temperatureC);
});
test('Table B.3 exact lookups, interpolation, and inverse roots use table pressures', () => {
  const water = require('../data/water_b3.json');
  assert.equal(water.originalPoints.length, 660);
  assert.equal(water.fits[0].points.length, 656);
  assert.equal(V.validate([water], [1]).ok, true);
  near(V.pressureFromKPa(V.vaporPressure(water, 4.3), 'mmHg'), 6.230, 1e-12);
  near(V.pressureFromKPa(V.vaporPressure(water, 100), 'mmHg'), 760.00, 1e-10);
  near(V.pressureFromKPa(V.vaporPressure(water, 101.9), 'mmHg'), 813.08, 1e-10);
  const interpolation = V.evaluateVaporPressure(water, 4.35);
  near(interpolation.interpolation.fraction, .5, 1e-12);
  assert.equal(interpolation.interpolation.lower.T, 4.3);
  assert.equal(interpolation.interpolation.upper.T, 4.4);
  near(V.pressureFromKPa(interpolation.psatKPa, 'mmHg'), (6.230 + 6.274) / 2, 1e-12);
  const flagged = V.evaluateVaporPressure(water, 95.2);
  assert.equal(flagged.interpolation.exact, false);
  assert.equal(flagged.interpolation.skippedEntries[0].printedMmHg, 938.59);
  near(V.pressureFromKPa(flagged.psatKPa, 'mmHg'), (636.24 + 640.94) / 2, 1e-9);
  for (const T of [0, 4.3, 49.95, 55.4, 90.05, 100, 101.9]) {
    const P = V.vaporPressure(water, T);
    const root = V.bubbleTemperature(P, [water], [1]);
    assert.equal(root.ok, true); near(root.temperatureC, T, 1e-6);
    assert.equal(V.flash(P, root.temperatureC, [water], [1]).phase, 'indeterminate');
  }
});
test('Table-only data never extrapolate and constrain mixture coverage', () => {
  const water = require('../data/water_b3.json');
  const options = { extrapolate: true, temperatureRange: [-10, 150] };
  assert.throws(() => V.vaporPressure(water, -1));
  assert.throws(() => V.vaporPressure(water, 105, options));
  assert.deepEqual(V.coverageIntervals([water], [1], options), [[0, 101.9]]);
  assert.deepEqual(V.coverageIntervals([water, c[0]], [.5, .5], options), [[0, 101.9]]);
  assert.equal(V.bubbleTemperature(V.pressureToKPa(900, 'mmHg'), [water], [1], options).ok, false);
  const curve = V.ptEnvelope([water], [1], 31, options);
  assert.ok(curve.points.filter(Boolean).every(point => point.T >= 0 && point.T <= 101.9));
});
test('Shipped library contains only supplied Tables B.4 and B.3', () => {
  assert.equal(species.length, 88);
  assert.equal(new Set(species.map(item => item.id)).size, 88);
  assert.equal(species.reduce((count, item) => count + item.fits.length, 0), 95);
  assert.equal(species.filter(item => item.id.startsWith('b4-')).length, 87);
  assert.equal(species.filter(item => item.id === 'water-table-b3').length, 1);
  assert.equal(/NIST|webbook\.nist/i.test(JSON.stringify(species)), false);
  for (const item of species) for (const fit of item.fits) {
    assert.ok(fit.source.includes('Table B.'));
    if (fit.model !== 'table') {
      assert.equal(fit.tUnit, 'C'); assert.equal(fit.pUnit, 'mmHg'); assert.equal(fit.logBase, '10');
    }
  }
});
test('Textbook B/T/E defaults use their own coefficients and validity limits', () => {
  const trio = ['b4-benzene', 'b4-toluene', 'b4-ethylbenzene'].map(id => species.find(item => item.id === id));
  assert.deepEqual(V.coverageIntervals(trio, z), [[56.5, 80.9]]);
  near(V.bubblePressure(80, trio, z), 65.5043619547541);
  near(V.dewPressure(80, trio, z), 40.639280981806536);
  const bubble = V.bubbleTemperature(55, trio, z);
  near(bubble.temperatureC, 74.60925305020065);
  assert.equal(V.flash(55, bubble.temperatureC, trio, z).phase, 'bubble');
  assert.equal(V.dewTemperature(55, trio, z).ok, false);
  near(V.flash(55, 80, trio, z).beta, 0.4496484948685975);
  const binary = V.binaryTxy(55, trio.slice(0, 2), 6);
  assert.equal(binary.points[1], null); // This root would require benzene beyond 80.9°C.
});
test('B.4 overlapping fits preserve printed priority and unsupported mixtures have no invented coverage', () => {
  const get = id => species.find(item => item.id === id);
  const acid = get('b4-acetic-acid');
  assert.equal(V.evaluateVaporPressure(acid, 32).fitIndex, 0);
  assert.equal(V.evaluateVaporPressure(acid, 10).fitIndex, 1);
  const chlorobenzene = get('b4-chlorobenzene');
  assert.equal(V.evaluateVaporPressure(chlorobenzene, 50).fitIndex, 2);
  assert.equal(V.evaluateVaporPressure(chlorobenzene, 80).fitIndex, 0);
  assert.equal(V.evaluateVaporPressure(chlorobenzene, 150).fitIndex, 2);
  const water = get('b4-water');
  assert.equal(V.evaluateVaporPressure(water, 60).fitIndex, 0);
  assert.equal(V.evaluateVaporPressure(water, 60.01).fitIndex, 1);
  assert.ok(V.ptEnvelope([water], [1], 31).points.includes(null));
  const incompatible = [get('b4-dimethyl-ether'), get('b4-glycerol')];
  assert.deepEqual(V.coverageIntervals(incompatible, [.5, .5]), []);
  assert.equal(V.bubbleTemperature(55, incompatible, [.5, .5]).ok, false);
  assert.equal(V.ptEnvelope(incompatible, [.5, .5], 31).points.length, 0);
});
console.log(`${count} meaningful numerical and validity tests passed.`);
