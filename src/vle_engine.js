/* Dependency-free, ideal Raoult-law toolkit. Public temperatures: °C;
 * public pressures: kPa. Species: {name,fits:[{A,B,C,tUnit,pUnit,logBase,
 * minC,maxC,...sourceMetadata}]}. Legacy single-fit species also work.
 * In overlapping ranges, the FIRST valid fit wins. No extrapolation unless
 * explicitly requested with {extrapolate:true,temperatureRange:[minC,maxC]}.
 * This is an ideal VLE model, not a critical-point or nonideal-liquid model.
 */
const VLE = (() => {
  'use strict';
  const PRESSURE_FACTORS = { kPa: 1, Pa: 0.001, MPa: 1000, bar: 100, atm: 101.325, mmHg: 101.325 / 760 };
  // A computed temperature must classify as its boundary when fed into flash.
  // Use a wider phase tolerance than the root residual tolerance; both are
  // relative/dimensionless so this also works at low absolute pressures.
  const ROOT_RELATIVE_TOLERANCE = 1e-10;
  const PHASE_TOLERANCE = 1e-9;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const fail = message => { throw new Error(message); };
  const fitsOf = species => Array.isArray(species?.fits) ? species.fits : [species];
  const nameOf = (species, i = 0) => species?.name || `Component ${i + 1}`;
  const sum = values => values.reduce((a, b) => a + b, 0);

  function temperatureToC(value, unit = 'C') {
    if (!finite(value)) fail('Temperature must be a finite number.');
    if (unit === 'C') return value;
    if (unit === 'K') return value - 273.15;
    if (unit === 'F') return (value - 32) * 5 / 9;
    fail('Unsupported temperature unit; choose C, K, or F.');
  }
  function temperatureFromC(value, unit = 'C') {
    if (!finite(value)) fail('Temperature must be a finite number.');
    if (unit === 'C') return value;
    if (unit === 'K') return value + 273.15;
    if (unit === 'F') return value * 9 / 5 + 32;
    fail('Unsupported temperature unit; choose C, K, or F.');
  }
  function pressureToKPa(value, unit = 'kPa') {
    if (!finite(value) || !Object.prototype.hasOwnProperty.call(PRESSURE_FACTORS, unit)) fail('Provide a finite pressure and supported pressure unit.');
    return value * PRESSURE_FACTORS[unit];
  }
  function pressureFromKPa(value, unit = 'kPa') {
    if (!finite(value) || !Object.prototype.hasOwnProperty.call(PRESSURE_FACTORS, unit)) fail('Provide a finite pressure and supported pressure unit.');
    return value / PRESSURE_FACTORS[unit];
  }

  function fitErrors(fit, label) {
    const errors = [];
    if (!fit || typeof fit !== 'object') return [`${label}: missing fit data.`];
    if (fit.model === 'table') {
      if (!Array.isArray(fit.points) || fit.points.length < 2) return [`${label}: tabulated data require at least two points.`];
      fit.points.forEach((point, i) => {
        if (!finite(point.T) || !finite(point.P) || point.T <= -273.15 || point.P <= 0) errors.push(`${label}: table temperatures and positive pressures must be finite.`);
        if (i > 0 && (!(point.T > fit.points[i - 1].T) || !(point.P > fit.points[i - 1].P))) errors.push(`${label}: table temperatures and saturation pressures must increase strictly.`);
      });
      if (fit.minC !== fit.points[0].T || fit.maxC !== fit.points[fit.points.length - 1].T) errors.push(`${label}: table validity limits must match its first and last temperatures.`);
      return errors;
    }
    for (const key of ['A', 'B', 'C', 'minC', 'maxC']) if (!finite(fit[key])) errors.push(`${label}: ${key} must be finite.`);
    if (!['K', 'C', 'F'].includes(fit.tUnit)) errors.push(`${label}: unsupported Antoine temperature unit.`);
    if (!Object.prototype.hasOwnProperty.call(PRESSURE_FACTORS, fit.pUnit)) errors.push(`${label}: unsupported Antoine pressure unit.`);
    if (!['10', 'e', 10].includes(fit.logBase ?? '10')) errors.push(`${label}: logarithm base must be 10 or e.`);
    if (finite(fit.B) && fit.B <= 0) errors.push(`${label}: B must be positive for these monotonic vapor-pressure fits.`);
    if (finite(fit.minC) && finite(fit.maxC)) {
      if (fit.minC <= -273.15) errors.push(`${label}: minimum temperature must exceed absolute zero.`);
      if (fit.minC > fit.maxC) errors.push(`${label}: validity limits are reversed.`);
      if (finite(fit.C) && ['K', 'C', 'F'].includes(fit.tUnit)) {
        const lo = temperatureFromC(fit.minC, fit.tUnit) + fit.C;
        const hi = temperatureFromC(fit.maxC, fit.tUnit) + fit.C;
        if (lo <= 0 && hi >= 0) errors.push(`${label}: Antoine denominator crosses zero in its validity interval.`);
      }
    }
    return errors;
  }
  function componentErrors(species, index = 0) {
    const fits = fitsOf(species);
    if (!fits.length) return [`${nameOf(species, index)}: supply at least one Antoine fit.`];
    return fits.flatMap((fit, i) => fitErrors(fit, `${nameOf(species, index)}, fit ${i + 1}`));
  }
  function validate(components, z) {
    const errors = [];
    if (!Array.isArray(components) || !components.length) return { ok: false, errors: ['Add at least one component.'], sumZ: NaN };
    components.forEach((c, i) => errors.push(...componentErrors(c, i)));
    if (!Array.isArray(z) || z.length !== components.length) return { ok: false, errors: [...errors, 'Provide one mole fraction for each component.'], sumZ: NaN };
    z.forEach((value, i) => { if (!finite(value) || value < 0 || value > 1) errors.push(`${nameOf(components[i], i)}: mole fraction must be between 0 and 1.`); });
    const sumZ = sum(z);
    if (!finite(sumZ) || Math.abs(sumZ - 1) > 1e-8) errors.push(`Mole fractions must sum to 1 (current sum: ${finite(sumZ) ? sumZ.toFixed(8) : 'invalid'}).`);
    return { ok: errors.length === 0, errors, sumZ };
  }
  function checked(components, z) {
    const result = validate(components, z);
    if (!result.ok) fail(result.errors.join(' '));
    return z.map(value => value / result.sumZ); // Only floating-point sum noise.
  }
  function checkPressure(P) { if (!finite(P) || P <= 0) fail('Absolute pressure must be positive and finite (kPa).'); }
  function checkOptions(options = {}) {
    if (options.temperatureRange !== undefined) {
      const range = options.temperatureRange;
      if (!Array.isArray(range) || range.length !== 2 || !range.every(finite) || range[0] <= -273.15 || range[0] >= range[1]) fail('Temperature range must be two increasing °C limits above absolute zero.');
    }
    if (options.extrapolate && !options.temperatureRange) fail('Extrapolation requires an explicit temperatureRange: [minimum °C, maximum °C].');
  }

  function unionIntervals(intervals) {
    const sorted = intervals.map(pair => [...pair]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push(interval);
    }
    return merged;
  }
  function intersectIntervals(left, right) {
    const result = [];
    for (const a of left) for (const b of right) {
      const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
      if (lo <= hi) result.push([lo, hi]);
    }
    return unionIntervals(result);
  }
  function coverageIntervals(components, z, options = {}) {
    const weights = checked(components, z);
    checkOptions(options);
    let intervals = null;
    components.forEach((c, i) => {
      if (weights[i] <= 0) return;
      const hasExtrapolatableFit = fitsOf(c).some(fit => fit.model !== 'table');
      const coverage = options.extrapolate && hasExtrapolatableFit
        ? [[...options.temperatureRange]]
        : unionIntervals(fitsOf(c).map(fit => [fit.minC, fit.maxC]));
      intervals = intervals === null ? coverage : intersectIntervals(intervals, coverage);
    });
    return options.temperatureRange ? intersectIntervals(intervals, [options.temperatureRange]) : intervals;
  }
  function validRange(components, z, options = {}) {
    const intervals = coverageIntervals(components, z, options);
    return { ok: intervals.length > 0, minC: intervals[0]?.[0] ?? null, maxC: intervals[intervals.length - 1]?.[1] ?? null, intervals };
  }
  function selectFit(species, T, options = {}) {
    const fits = fitsOf(species);
    let index = fits.findIndex(fit => T >= fit.minC - 1e-10 && T <= fit.maxC + 1e-10);
    if (index >= 0) return { fitIndex: index, fit: fits[index], extrapolated: false, distanceC: 0 };
    if (!options.extrapolate) fail(`${nameOf(species)}: no Antoine fit is valid at ${T.toFixed(3)} °C.`);
    const range = options.temperatureRange;
    if (T < range[0] || T > range[1]) fail('Temperature is outside the explicitly allowed extrapolation range.');
    const distances = fits.map(fit => fit.model === 'table' ? Infinity : Math.max(fit.minC - T, T - fit.maxC, 0));
    if (distances.every(distance => distance === Infinity)) fail(`${nameOf(species)}: tabulated data cannot be extrapolated outside their temperature limits.`);
    index = distances.indexOf(Math.min(...distances));
    return { fitIndex: index, fit: fits[index], extrapolated: true, distanceC: distances[index] };
  }
  function tableInterpolation(fit, T) {
    const points = fit.points;
    if (T < fit.minC || T > fit.maxC) fail('Tabulated saturation pressures cannot be extrapolated.');
    let lo = 0, hi = points.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (Math.abs(points[mid].T - T) < 1e-10) return { lower: points[mid], upper: points[mid], fraction: 0, exact: true, skippedEntries: [] };
      if (points[mid].T < T) lo = mid + 1; else hi = mid - 1;
    }
    const lower = points[hi], upper = points[lo];
    const skippedEntries = (fit.sourceAnomalies || []).filter(entry => entry.excluded && entry.T > lower.T && entry.T < upper.T);
    return { lower, upper, fraction: (T - lower.T) / (upper.T - lower.T), exact: false, skippedEntries };
  }
  function evaluateFit(fit, T) {
    if (fit.model === 'table') {
      const { lower, upper, fraction } = tableInterpolation(fit, T);
      return lower.P + fraction * (upper.P - lower.P);
    }
    const temperature = temperatureFromC(T, fit.tUnit);
    const denominator = temperature + fit.C;
    const nearestT = Math.min(fit.maxC, Math.max(fit.minC, T));
    const nearestDenominator = temperatureFromC(nearestT, fit.tUnit) + fit.C;
    if (denominator === 0 || Math.sign(denominator) !== Math.sign(nearestDenominator)) fail('Extrapolation crosses an Antoine singularity.');
    const exponent = fit.A - fit.B / denominator;
    const fittedPressure = fit.logBase === 'e' ? Math.exp(exponent) : 10 ** exponent;
    const psat = pressureToKPa(fittedPressure, fit.pUnit);
    if (!finite(psat) || psat <= 0) fail('Antoine equation gives a nonpositive or nonfinite saturation pressure.');
    return psat;
  }
  function evaluateVaporPressure(species, T, options = {}) {
    const errors = componentErrors(species);
    if (errors.length) fail(errors.join(' '));
    if (!finite(T) || T <= -273.15) fail('Temperature must be finite and above absolute zero (°C).');
    checkOptions(options);
    const chosen = selectFit(species, T, options);
    const interpolation = chosen.fit.model === 'table' ? tableInterpolation(chosen.fit, T) : null;
    return { psatKPa: evaluateFit(chosen.fit, T), temperatureC: T, ...chosen, interpolation };
  }
  const vaporPressure = (c, T, options = {}) => evaluateVaporPressure(c, T, options).psatKPa;
  function evaluateSaturation(T, components, z, options = {}) {
    const weights = checked(components, z), psat = [], chosenFits = [], extrapolations = [];
    components.forEach((c, i) => {
      if (weights[i] === 0) { psat.push(null); chosenFits.push(null); return; }
      const result = evaluateVaporPressure(c, T, options);
      psat.push(result.psatKPa);
      const { fitIndex, fit, extrapolated, distanceC, interpolation } = result;
      chosenFits.push({ fitIndex, fit, extrapolated, distanceC, interpolation });
      if (extrapolated) extrapolations.push({ componentIndex: i, name: nameOf(c, i), fitIndex, distanceC });
    });
    const bubble = sum(weights.map((value, i) => value > 0 ? value * psat[i] : 0));
    const dew = 1 / sum(weights.map((value, i) => value > 0 ? value / psat[i] : 0));
    if (!finite(bubble) || !finite(dew) || bubble <= 0 || dew <= 0) fail('The mixture pressure calculation is outside the numerical range.');
    return { temperatureC: T, psat, chosenFits, extrapolations, weights, bubblePressure: bubble, dewPressure: dew };
  }
  const bubblePressure = (T, c, z, options = {}) => evaluateSaturation(T, c, z, options).bubblePressure;
  const dewPressure = (T, c, z, options = {}) => evaluateSaturation(T, c, z, options).dewPressure;

  function fitSignature(selection) { return selection.map(item => item?.fitIndex ?? '-').join(','); }
  function fitSegments(components, z, options = {}) {
    const weights = checked(components, z), coverage = coverageIntervals(components, z, options), segments = [];
    for (const interval of coverage) {
      const breaks = new Set(interval);
      components.forEach((c, i) => {
        if (weights[i] === 0) return;
        fitsOf(c).forEach(fit => [fit.minC, fit.maxC].forEach(T => { if (T > interval[0] && T < interval[1]) breaks.add(T); }));
        if (options.extrapolate) {
          const ranges = unionIntervals(fitsOf(c).filter(fit => fit.model !== 'table').map(fit => [fit.minC, fit.maxC]));
          for (let j = 1; j < ranges.length; j++) {
            const midpoint = (ranges[j - 1][1] + ranges[j][0]) / 2;
            if (midpoint > interval[0] && midpoint < interval[1]) breaks.add(midpoint);
          }
        }
      });
      const sorted = [...breaks].sort((a, b) => a - b);
      if (sorted.length === 1) sorted.push(sorted[0]);
      for (let j = 1; j < sorted.length; j++) {
        const minC = sorted[j - 1], maxC = sorted[j], mid = (minC + maxC) / 2;
        const chosenFits = components.map((c, i) => weights[i] > 0 ? selectFit(c, mid, options) : null);
        const signature = fitSignature(chosenFits), previous = segments[segments.length - 1];
        // Keep extrapolation boundaries separate even when the chosen fit is unchanged.
        const stateSignature = signature + ':' + chosenFits.map(f => f?.extrapolated ? 'e' : 'v').join('');
        if (previous && previous.maxC === minC && previous.stateSignature === stateSignature) previous.maxC = maxC;
        else segments.push({ minC, maxC, chosenFits, signature, stateSignature });
      }
    }
    return segments;
  }

  function temperatureRoot(kind, P, components, z, options = {}) {
    checkPressure(P);
    const weights = checked(components, z), rangeC = validRange(components, z, options);
    if (!rangeC.ok) return { ok: false, reason: 'Active components have no common valid temperature interval.', rangeC, roots: [], trace: [] };
    const segments = fitSegments(components, z, options), roots = [], failures = [];
    const tolerance = kind === 'bubble' ? P * ROOT_RELATIVE_TOLERANCE : ROOT_RELATIVE_TOLERANCE;
    const residualFromPsat = psat => kind === 'bubble'
      ? sum(weights.map((value, i) => value > 0 ? value * psat[i] : 0)) - P
      : sum(weights.map((value, i) => value > 0 ? value * P / psat[i] : 0)) - 1;
    const accept = (T, trace, segment) => {
      const evaluation = evaluateSaturation(T, components, weights, options);
      const residual = residualFromPsat(evaluation.psat);
      // Verify using FIRST-valid fit selection, including exact switch points.
      if (Math.abs(residual) > tolerance * 2) return false;
      if (roots.some(root => Math.abs(root.temperatureC - T) < 1e-6)) return true;
      roots.push({ ok: true, temperatureC: T, residual, residualUnit: kind === 'bubble' ? 'kPa' : 'dimensionless', iterations: trace.length,
        trace: options.trace === false ? [] : trace, evaluation, segment: [segment.minC, segment.maxC] });
      return true;
    };
    for (const segment of segments) {
      const fn = T => residualFromPsat(segment.chosenFits.map(chosen => chosen ? evaluateFit(chosen.fit, T) : null));
      let lo = segment.minC, hi = segment.maxC, flo, fhi;
      const trace = [];
      try {
        flo = fn(lo); fhi = fn(hi);
        if (Math.abs(flo) <= tolerance) accept(lo, trace, segment);
        if (Math.abs(fhi) <= tolerance) accept(hi, trace, segment);
        if (Math.sign(flo) === Math.sign(fhi) || lo === hi) continue;
        for (let iteration = 1; iteration <= 120; iteration++) {
          const mid = (lo + hi) / 2, residual = fn(mid);
          trace.push({ iteration, low: lo, high: hi, mid, residual });
          if (Math.abs(residual) <= tolerance || hi - lo < 1e-10) { accept(mid, trace, segment); break; }
          if (Math.sign(residual) === Math.sign(flo)) { lo = mid; flo = residual; }
          else { hi = mid; fhi = residual; }
        }
      } catch (error) { failures.push(error.message); }
    }
    roots.sort((a, b) => a.temperatureC - b.temperatureC);
    if (!roots.length) return { ok: false, reason: `No ${kind} root is supported within the chosen temperature intervals; fit gaps and discontinuities are not crossed.`, rangeC, roots, trace: [], failures };
    const warning = roots.length > 1 ? 'Multiple roots occur across the supplied fit segments; inspect the fits and listed roots.' : null;
    return { ...roots[0], rangeC, roots, warning, failures };
  }
  const bubbleTemperature = (P, c, z, options = {}) => temperatureRoot('bubble', P, c, z, options);
  const dewTemperature = (P, c, z, options = {}) => temperatureRoot('dew', P, c, z, options);

  function flash(P, T, components, z, options = {}) {
    checkPressure(P);
    const evaluation = evaluateSaturation(T, components, z, options), weights = evaluation.weights;
    const K = evaluation.psat.map(value => value === null ? null : value / P);
    const common = { P, T, K, psat: evaluation.psat, bubblePressure: evaluation.bubblePressure, dewPressure: evaluation.dewPressure, evaluation, trace: [] };
    const rr = beta => sum(weights.map((value, i) => value > 0 ? value * (K[i] - 1) / (1 + beta * (K[i] - 1)) : 0));
    if (K.filter((_, i) => weights[i] > 0).every(value => Math.abs(value - 1) <= PHASE_TOLERANCE)) return { ...common, phase: 'indeterminate', beta: null, x: [...weights], y: [...weights], residual: 0, message: 'At equal-volatility saturation, T and P do not determine the vapor fraction.' };
    const f0 = rr(0), f1 = rr(1), tolerance = PHASE_TOLERANCE;
    const endpointResiduals = [f0, f1];
    if (f0 < -tolerance) return { ...common, phase: 'liquid', beta: 0, x: [...weights], y: null, residual: null, endpointResiduals };
    if (f1 > tolerance) return { ...common, phase: 'vapor', beta: 1, x: null, y: [...weights], residual: null, endpointResiduals };
    let beta, phase;
    if (Math.abs(f0) <= tolerance) { beta = 0; phase = 'bubble'; }
    else if (Math.abs(f1) <= tolerance) { beta = 1; phase = 'dew'; }
    else {
      phase = 'two-phase';
      let lo = 0, hi = 1;
      for (let iteration = 1; iteration <= 100; iteration++) {
        beta = (lo + hi) / 2;
        const residual = rr(beta);
        common.trace.push({ iteration, low: lo, high: hi, mid: beta, residual });
        if (Math.abs(residual) <= 1e-13 || hi - lo < 1e-12) break;
        if (residual > 0) lo = beta; else hi = beta;
      }
    }
    const x = weights.map((value, i) => value > 0 ? value / (1 + beta * (K[i] - 1)) : 0);
    const y = x.map((value, i) => weights[i] > 0 ? value * K[i] : 0);
    const balanceError = Math.max(...weights.map((value, i) => Math.abs(value - (1 - beta) * x[i] - beta * y[i])));
    return { ...common, phase, beta, x, y, iterations: common.trace.length, trace: options.trace === false ? [] : common.trace, residual: rr(beta), sumX: sum(x), sumY: sum(y), balanceError, endpointResiduals };
  }

  function sampleCount(n) { if (!Number.isInteger(n) || n < 2 || n > 2001) fail('Sample count must be an integer from 2 to 2001.'); }
  function binaryInputs(components, n) {
    if (!Array.isArray(components) || components.length !== 2) fail('Binary diagrams require exactly two selected components.');
    checked(components, [0.5, 0.5]); sampleCount(n);
  }
  function switchedFits(previous, next) {
    return previous && next && previous.some((fit, i) => fit && next[i] && fit.fitIndex !== next[i].fitIndex);
  }
  function binaryPxy(T, components, n = 101, options = {}) {
    binaryInputs(components, n);
    const points = [], gaps = [];
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      try {
        const evaluation = evaluateSaturation(T, components, [x, 1 - x], options);
        points.push({ x, y: x === 0 ? 0 : x * evaluation.psat[0] / evaluation.bubblePressure, P: evaluation.bubblePressure, T, evaluation });
      } catch (error) { points.push(null); gaps.push({ index: i, x, reason: error.message }); }
    }
    return { points, gaps };
  }
  function binaryTxy(P, components, n = 101, options = {}) {
    binaryInputs(components, n); checkPressure(P);
    const points = [], gaps = [];
    let previousFits = null;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1), root = bubbleTemperature(P, components, [x, 1 - x], { ...options, trace: false });
      if (!root.ok) { points.push(null); gaps.push({ index: i, x, reason: root.reason }); previousFits = null; continue; }
      const evaluation = root.evaluation, T = root.temperatureC;
      if (switchedFits(previousFits, evaluation.chosenFits)) { points.push(null); gaps.push({ index: i, x, reason: 'Antoine fit selection changes here; curve is broken to avoid hiding a fit discontinuity.' }); }
      points.push({ x, y: x === 0 ? 0 : x * evaluation.psat[0] / P, P, T, evaluation, warning: root.warning });
      previousFits = evaluation.chosenFits;
    }
    return { points, gaps };
  }
  function ptEnvelope(components, z, n = 151, options = {}) {
    sampleCount(n);
    const intervals = coverageIntervals(components, z, options), segments = fitSegments(components, z, options);
    const points = [], gaps = [], totalWidth = sum(segments.map(segment => segment.maxC - segment.minC));
    segments.forEach((segment, index) => {
      if (index > 0) { points.push(null); gaps.push({ afterSegment: index - 1, reason: 'Validity gap or Antoine fit selection change.' }); }
      const width = segment.maxC - segment.minC;
      const count = width === 0 ? 1 : Math.max(2, Math.ceil(n * width / (totalWidth || 1)));
      const inset = Math.min(width / 4, Math.max(1e-8, width * 1e-10));
      for (let j = 0; j < count; j++) {
        let T = count === 1 ? segment.minC : segment.minC + width * j / (count - 1);
        try {
          let evaluation = evaluateSaturation(T, components, z, options);
          if (fitSignature(evaluation.chosenFits) !== segment.signature && width > 0) {
            T += j === 0 ? inset : -inset;
            evaluation = evaluateSaturation(T, components, z, options);
          }
          points.push({ T, bubblePressure: evaluation.bubblePressure, dewPressure: evaluation.dewPressure, evaluation });
        } catch (error) { points.push(null); gaps.push({ T, reason: error.message }); }
      }
    });
    return { points, gaps, intervals, segments };
  }

  return { PRESSURE_FACTORS, fitsOf, validate, validRange, coverageIntervals, fitSegments,
    temperatureToC, temperatureFromC, pressureToKPa, pressureFromKPa,
    evaluateVaporPressure, evaluateSaturation, vaporPressure, bubblePressure, dewPressure,
    bubbleTemperature, dewTemperature, flash, binaryPxy, binaryTxy, ptEnvelope };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = VLE;
if (typeof globalThis !== 'undefined') globalThis.VLE = VLE;
