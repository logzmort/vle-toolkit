  // Insert inside app.js's IIFE. Uses the existing state, model, curves, VLE,
  // formatting, DOM, and download helpers. No event handlers are installed here.
  function learningNumber(value, digits=7) {
    if(!finite(value)) return '—';
    if(value!==0&&(Math.abs(value)<1e-5||Math.abs(value)>=1e9))return value.toExponential(6);
    return value.toFixed(digits);
  }
  function learningEquation(html){return '<div class="equation">'+html+'</div>';}
  function learningStep(n,title,body){return `<section class="step"><span class="step-number">${n}</span><h3>${esc(title)}</h3>${body}</section>`;}
  function learningTable(headers,rows,caption=''){
    return `<div class="table-wrap"><table class="data-table">${caption?'<caption>'+esc(caption)+'</caption>':''}<thead><tr>${headers.map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`;
  }
  function learningAnswer(label,value,unit,detail=''){
    return `<div class="answer-box"><div>${esc(label)}</div><div class="answer-number">${fmt(value,6)} <small>${esc(unit)}</small></div>${detail?'<p>'+detail+'</p>':''}</div>`;
  }
  function learningIntervals(intervals){return (intervals||[]).map(r=>`${learningNumber(r[0],4)} to ${learningNumber(r[1],4)} °C`).join('; ')||'None';}
  function learningCheck(label,value,target=1,tolerance=1e-8){
    const pass=finite(value)&&Math.abs(value-target)<=tolerance;
    return `<p class="${pass?'check-pass':'check-fail'}">${esc(label)} = ${learningNumber(value,9)}; target = ${learningNumber(target,9)}. ${pass?'Check passes.':'Check does not pass; inspect the inputs and property fits.'}</p>`;
  }
  function learningComposition(c,z,label='zᵢ'){
    return learningTable(['i','Species',esc(label)],c.map((co,i)=>[i+1,esc(co.name),learningNumber(z[i])]))+
      learningEquation(`${label.split(' = ').map(term=>'Σ '+esc(term)).join(' = ')} = ${z.map(v=>learningNumber(v)).join(' + ')} = ${learningNumber(sum(z))}`);
  }
  function learningUnitNote(){
    let conversions='';
    if(state.tUnit!=='C')conversions+=`Selected temperature: ${learningNumber(T(state.T),5)} ${esc(tLabel())} = ${learningNumber(state.T,5)} °C. `;
    if(state.pUnit!=='kPa')conversions+=`Selected pressure: ${learningNumber(P(state.P),6)} ${esc(state.pUnit)} = ${learningNumber(state.P,6)} kPa. `;
    return `<p class="small muted">${conversions}The working below uses °C and kPa consistently. Each vapor-pressure correlation uses its own stated units. Final answers also use your selected display units. Extra digits are retained internally; displayed arithmetic may differ slightly through rounding.</p>`;
  }
  function learningPropertyWork(co,i,t,result,openDefault=i===0){
    const f=result.fit,inter=result.interpolation,p=result.psatKPa;
    let body=`<p>Use ${f.model==='table'?'the tabulated-water data':'fit '+(result.fitIndex+1)} for ${esc(co.name)}. Its stated range is ${fmt(f.minC,4)}–${fmt(f.maxC,4)} °C. ${result.extrapolated?'<strong>This calculation extrapolates beyond that range.</strong>':'The calculation is inside that range.'}</p>`;
    if(f.model==='table'){
      const a=inter.lower,b=inter.upper;
      const native=q=>finite(q.PmmHg)?q.PmmHg:VLE.pressureFromKPa(q.P,'mmHg');
      if(inter.exact){
        body+=`<p>This temperature is a retained table entry. Read its pressure directly; no interpolation is needed.</p>`;
        body+=learningEquation(`T = ${learningNumber(t,5)} °C<br>P<sup>sat</sup><sub>${i+1}</sub> = ${learningNumber(native(a),5)} mmHg × (101.325 kPa / 760 mmHg) = ${learningNumber(p)} kPa`);
      }else{
        body+=learningTable(['Retained table entry','Temperature (°C)','Pressure (mmHg)'],[['Lower',learningNumber(a.T,5),learningNumber(native(a),5)],['Upper',learningNumber(b.T,5),learningNumber(native(b),5)]]);
        body+=learningEquation(`Fraction of interval = (T − T₁)/(T₂ − T₁)<br>= (${learningNumber(t,7)} − ${learningNumber(a.T,5)})/(${learningNumber(b.T,5)} − ${learningNumber(a.T,5)}) = ${learningNumber(inter.fraction,9)}`);
        body+=learningEquation(`P<sup>sat</sup><sub>${i+1}</sub> = P₁ + fraction × (P₂ − P₁)<br>= ${learningNumber(native(a),5)} + ${learningNumber(inter.fraction,9)} × (${learningNumber(native(b),5)} − ${learningNumber(native(a),5)})<br>= ${learningNumber(VLE.pressureFromKPa(p,'mmHg'))} mmHg<br>= ${learningNumber(VLE.pressureFromKPa(p,'mmHg'))} × (101.325/760) = ${learningNumber(p)} kPa`);
        if(inter.skippedEntries?.length){
          body+=`<div class="notice small">Printed source entries omitted from interpolation: ${inter.skippedEntries.map(a=>`${fmt(a.T,3)} °C: ${esc(a.printedMmHg??a.transcribedMmHg??'flagged value')} mmHg`).join('; ')}. These source readings are inconsistent with the neighboring table progression. This result is explicitly interpolated from the retained bracketing entries; an inferred replacement table value has not been inserted.</div>`;
        }
      }
    }else{
      const tf=VLE.temperatureFromC(t,f.tUnit),den=tf+f.C,q=f.A-f.B/den;
      const native=f.logBase==='e'?Math.exp(q):10**q;
      const tu=f.tUnit==='K'?'K':'°'+f.tUnit;
      const convertT=f.tUnit==='K'?`${learningNumber(t,7)} + 273.15`:f.tUnit==='F'?`${learningNumber(t,7)} × 9/5 + 32`:learningNumber(t,7);
      body+=`<p>${esc(f.source||co.sourceLabel||'User-entered coefficients')}. At overlapping temperatures, the first valid fit in the species editor is used.</p>`;
      body+=learningEquation(`A = ${esc(f.A)}, B = ${esc(f.B)}, C = ${esc(f.C)}<br>T<sub>fit</sub> = ${convertT} = ${learningNumber(tf,7)} ${tu}<br>T<sub>fit</sub> + C = ${learningNumber(tf,7)} + (${esc(f.C)}) = ${learningNumber(den,7)}`);
      body+=learningEquation(`${f.logBase==='e'?'ln':'log₁₀'}(P<sup>sat</sup> in ${esc(f.pUnit)}) = A − B/(T<sub>fit</sub> + C)<br>= ${esc(f.A)} − ${esc(f.B)}/(${learningNumber(tf,7)} + (${esc(f.C)}))<br>= ${learningNumber(q,10)}<br>P<sup>sat</sup> = ${f.logBase==='e'?'exp('+learningNumber(q,10)+')':'10<sup>'+learningNumber(q,10)+'</sup>'} = ${learningNumber(native,9)} ${esc(f.pUnit)}`);
      const factor=f.pUnit==='mmHg'?'(101.325 kPa / 760 mmHg)':`${esc(VLE.PRESSURE_FACTORS[f.pUnit])} kPa/${esc(f.pUnit)}`;
      body+=learningEquation(f.pUnit==='kPa'?`The fit already gives kPa: P<sup>sat</sup><sub>${i+1}</sub> = ${learningNumber(p)} kPa`:`P<sup>sat</sup><sub>${i+1}</sub> = ${learningNumber(native,9)} ${esc(f.pUnit)} × ${factor} = ${learningNumber(p)} kPa`);
    }
    return `<details${openDefault?' open':''}><summary>${esc(co.name)} · ${learningNumber(p)} kPa · show every property-data step</summary><div class="antoine-work">${body}</div></details>`;
  }
  function learningProperties(c,z,t,opts){
    let body=learningEquation(`Evaluate all active species at T = ${learningNumber(t,8)} °C.`),rows=[];
    c.forEach((co,i)=>{
      if(z[i]===0){rows.push([i+1,esc(co.name),'0','Not required']);body+=`<p class="small muted">${esc(co.name)} has zero mole fraction; it contributes zero and does not constrain the temperature range.</p>`;return;}
      const r=VLE.evaluateVaporPressure(co,t,opts);
      rows.push([i+1,esc(co.name),learningNumber(z[i]),learningNumber(r.psatKPa)]);
      body+=learningPropertyWork(co,i,t,r);
    });
    return learningTable(['i','Species','Known phase fraction','Pᵢˢᵃᵗ (kPa)'],rows)+body;
  }
  function learningFixedFitPressure(f,t){
    if(f.model!=='table'){
      const tf=VLE.temperatureFromC(t,f.tUnit),q=f.A-f.B/(tf+f.C);
      return VLE.pressureToKPa(f.logBase==='e'?Math.exp(q):10**q,f.pUnit);
    }
    const ps=f.points;let hi=ps.findIndex(p=>p.T>=t);
    if(hi<0)hi=ps.length-1;
    if(hi===0||Math.abs(ps[hi].T-t)<1e-10)return ps[hi].P;
    const a=ps[hi-1],b=ps[hi];return a.P+(t-a.T)/(b.T-a.T)*(b.P-a.P);
  }
  function learningRootResidual(t,evaluation,z,p,bubble){
    return sum(z.map((v,i)=>v===0?0:bubble?v*learningFixedFitPressure(evaluation.chosenFits[i].fit,t):v*p/learningFixedFitPressure(evaluation.chosenFits[i].fit,t)))-(bubble?p:1);
  }
  function learningTrace(trace,variable,residualUnit){
    if(!trace?.length)return '<p>The solution is a supported interval endpoint, so no midpoint iterations were required.</p>';
    const t=trace[0];
    let body=learningEquation(`${variable}<sub>mid</sub> = (${variable}<sub>low</sub> + ${variable}<sub>high</sub>)/2<br>First midpoint = (${learningNumber(t.low,9)} + ${learningNumber(t.high,9)})/2 = ${learningNumber(t.mid,9)}`);
    const tolerance=variable==='β'?'For the interior flash root, stop when |F(β)| ≤ 10⁻¹³ or the bracket width is less than 10⁻¹² in β.':residualUnit==='kPa'?`For this bubble-temperature root, stop when |f(T)| ≤ P × 10⁻¹⁰ = ${learningNumber(state.P*1e-10,12)} kPa, or the temperature bracket width is less than 10⁻¹⁰ °C.`:'For this dew-temperature root, stop when |f(T)| ≤ 10⁻¹⁰ (dimensionless), or the temperature bracket width is less than 10⁻¹⁰ °C.';
    body+=`<p>The rows below are the actual iterations used for this answer. Retain the half whose endpoint residuals have opposite signs. “Retained interval” becomes the next row’s starting interval.</p><p class="small muted">${tolerance}${variable==='β'?'':' The accepted temperature is then re-evaluated with the active property fits; its residual must also be no larger than twice that residual tolerance.'}</p>`;
    const rows=trace.map((row,i)=>[row.iteration,learningNumber(row.low,9),learningNumber(row.high,9),learningNumber(row.mid,9),learningNumber(row.residual,10),trace[i+1]?`${learningNumber(trace[i+1].low,9)} to ${learningNumber(trace[i+1].high,9)}`:'Accept this midpoint']);
    body+=`<details open><summary>All ${trace.length} recorded iterations</summary><div class="iteration-scroll">${learningTable(['Trial',variable+' low',variable+' high',variable+' midpoint','Residual'+(residualUnit?' ('+residualUnit+')':''),'Retained interval'],rows)}</div></details>`;
    return body;
  }
  function learningBoundaryCompositions(c,z,ev,p,bubble){
    const values=z.map((v,i)=>v===0?0:bubble?v*ev.psat[i]/p:v*p/ev.psat[i]);
    const rows=c.map((co,i)=>{
      const expression=z[i]===0?'0 (absent species)':bubble?`(${learningNumber(z[i])} × ${learningNumber(ev.psat[i])}) / ${learningNumber(p)}`:`(${learningNumber(z[i])} × ${learningNumber(p)}) / ${learningNumber(ev.psat[i])}`;
      return [esc(co.name),expression,learningNumber(values[i],8)];
    });
    let body=`<p>${bubble?'The liquid composition is known. Divide each liquid-weighted saturation pressure by the calculated total pressure to obtain the first bubble.':'The vapor composition is known. Multiply its fraction by the total pressure, then divide by that species’ saturation pressure to obtain the first drop.'} Pressure units cancel, leaving a dimensionless mole fraction.</p>`;
    body+=learningEquation(bubble?'yᵢP = xᵢPᵢˢᵃᵗ → divide by P → yᵢ = xᵢPᵢˢᵃᵗ/P':'yᵢP = xᵢPᵢˢᵃᵗ → divide by Pᵢˢᵃᵗ → xᵢ = yᵢP/Pᵢˢᵃᵗ');
    body+=learningTable(['Species','Substitute separately for this species',bubble?'First vapor yᵢ':'First liquid xᵢ'],rows);
    body+=learningEquation(`Σ ${bubble?'yᵢ':'xᵢ'} = ${values.map(v=>learningNumber(v,8)).join(' + ')} = ${learningNumber(sum(values),9)}`);
    body+=learningCheck(bubble?'Vapor mole-fraction sum':'Liquid mole-fraction sum',sum(values));
    return {html:body,values};
  }
  function learningBoundarySolution(kind){
    const {c,z,opts}=model,bubble=kind==='bp'||kind==='bt',solveT=kind==='bt'||kind==='dt';
    const root=bubble?model.bt:model.dt,label=bubble?'bubble':'dew';
    let n=1,html='';
    html+=learningStep(n++,'State the known conditions and the phase composition',
      `<div class="given"><span>${solveT?'Known P = '+fmt(P(state.P),6)+' '+esc(state.pUnit):'Known T = '+fmt(T(state.T),6)+' '+esc(tLabel())}</span><span>Unknown: ${label} ${solveT?'temperature':'pressure'} and first ${bubble?'vapor':'liquid'} composition</span></div>`+
      `<p>${bubble?'At the first infinitesimal vapor bubble, essentially the entire sample is liquid. Therefore xᵢ = zᵢ.':'At the first infinitesimal liquid drop, essentially the entire sample is vapor. Therefore yᵢ = zᵢ.'} Use the original overall composition for this boundary calculation; do not carry an incipient composition from a different boundary into it.</p>`+
      learningComposition(c,z,bubble?'xᵢ = zᵢ':'yᵢ = zᵢ')+learningUnitNote());
    const derived=bubble?learningEquation('yᵢP = xᵢPᵢˢᵃᵗ<br>yᵢ = xᵢPᵢˢᵃᵗ/P<br>Σyᵢ = Σ(xᵢPᵢˢᵃᵗ/P) = 1<br>Multiply by P: P = ΣxᵢPᵢˢᵃᵗ'):
      learningEquation('yᵢP = xᵢPᵢˢᵃᵗ<br>xᵢ = yᵢP/Pᵢˢᵃᵗ<br>Σxᵢ = P Σ(yᵢ/Pᵢˢᵃᵗ) = 1<br>Divide by the reciprocal sum: P = 1 / Σ(yᵢ/Pᵢˢᵃᵗ)');
    if(solveT){
      const residual=bubble?'f(T) = ΣxᵢPᵢˢᵃᵗ(T) − P':'f(T) = Σ[yᵢP/Pᵢˢᵃᵗ(T)] − 1';
      const expanded=z.map((v,i)=>v===0?'0':bubble?`${learningNumber(v)} P<sup>sat</sup><sub>${i+1}</sub>(T)`:`(${learningNumber(v)} × ${learningNumber(state.P)}) / P<sup>sat</sup><sub>${i+1}</sub>(T)`).join(' + ');
      html+=learningStep(n++,'Construct the temperature equation',derived+`<p>Pressure is fixed at ${learningNumber(state.P)} kPa. Every saturation pressure depends on the unknown temperature. Define a residual that is zero at the required boundary.</p>`+learningEquation(`${residual}<br>= ${expanded} − ${bubble?learningNumber(state.P):'1'} = 0`)+`<p>The residual has ${bubble?'units of kPa':'no units'}. ${bubble?'Increasing temperature increases the calculated weighted pressure.':'Increasing temperature increases the denominator of each reciprocal term, so the residual decreases.'}</p>`);
      if(!root.ok){
        html+=learningStep(n++,'Check whether the supplied data support a solution',`<div class="notice">${esc(root.reason||'The requested root is not supported by the supplied property data.')}</div><p>Search intervals: ${esc(learningIntervals(root.rangeC?.intervals||model.intervals))}.</p><p>The solver searches continuous fit segments separately. It does not cross unsupported gaps or treat a jump between different fits as a temperature root. No numerical answer or incipient composition is reported for this unsupported boundary.</p>`);
        return '<div class="steps">'+html+'</div>';
      }
      const trial=root.trace?.[0]?.mid??root.temperatureC;
      const trialEv=VLE.evaluateSaturation(trial,c,z,opts);
      const contributions=z.map((v,i)=>v===0?0:bubble?v*trialEv.psat[i]:v*state.P/trialEv.psat[i]);
      const trialResidual=sum(contributions)-(bubble?state.P:1);
      html+=learningStep(n++,'Evaluate one trial temperature in full',`<p>Start by seeing how one trial residual is formed. The first recorded midpoint is ${learningNumber(trial,8)} °C. Recalculate every active saturation pressure at this temperature; the selected-state vapor pressures cannot be reused at a different temperature.</p>`+learningProperties(c,z,trial,opts)+learningEquation(`f(${learningNumber(trial,8)} °C) = ${contributions.map(v=>learningNumber(v,9)).join(' + ')} − ${bubble?learningNumber(state.P):'1'} = ${learningNumber(trialResidual,10)}${bubble?' kPa':''}`));
      let bracket=`<p>For this accepted root, the continuous fit segment is ${esc(learningIntervals([root.segment]))}. The solver tests segment endpoints before applying bisection.</p>`;
      if(root.trace?.length){
        const first=root.trace[0],lo=learningRootResidual(first.low,root.evaluation,z,state.P,bubble),hi=learningRootResidual(first.high,root.evaluation,z,state.P,bubble);
        bracket+=learningEquation(`f(${learningNumber(first.low,9)} °C) = ${learningNumber(lo,10)}<br>f(${learningNumber(first.high,9)} °C) = ${learningNumber(hi,10)}<br>Opposite signs bracket a zero within this continuous fit segment.`);
      }
      bracket+=learningTrace(root.trace,'T (°C)',bubble?'kPa':'dimensionless');
      if(root.warning)bracket+=`<div class="notice">${esc(root.warning)} The toolkit displays the lowest supported root: ${learningNumber(root.temperatureC,8)} °C. Supported roots: ${(root.roots||[]).map(r=>learningNumber(r.temperatureC,8)+' °C').join('; ')}.</div>`;
      html+=learningStep(n++,'Bracket the root and follow the actual bisection iterations',bracket);
    }else{
      if(model.ev.ok===false){
        html+=learningStep(n++,'Check the temperature against the supplied property data',`<div class="notice">${esc(model.ev.reason)}</div><p>The pressure formula requires a supported saturation pressure for every active species. The equation is still:</p>`+derived+'<p>No pressure or incipient composition is calculated from unavailable property data.</p>');
        return '<div class="steps">'+html+'</div>';
      }
      html+=learningStep(n++,'Calculate every pure-species saturation pressure',learningProperties(c,z,state.T,opts));
      html+=learningStep(n++,'Derive the pressure equation from the phase sum',derived);
    }
    const t=solveT?root.temperatureC:state.T,ev=solveT?root.evaluation:model.ev,p=solveT?state.P:bubble?ev.bubblePressure:ev.dewPressure;
    const terms=z.map((v,i)=>v===0?0:bubble?v*ev.psat[i]:solveT?v*p/ev.psat[i]:v/ev.psat[i]);
    const termName=bubble?'xᵢPᵢˢᵃᵗ (kPa)':solveT?'yᵢP/Pᵢˢᵃᵗ (dimensionless)':'yᵢ/Pᵢˢᵃᵗ (kPa⁻¹)';
    let finalMath=solveT?learningAnswer(`${bubble?'Bubble':'Dew'} temperature`,T(t),tLabel(),`T = ${learningNumber(t,9)} °C. Re-evaluate the original equation at this temperature.`)+learningProperties(c,z,t,opts):'';
    finalMath+=learningTable(['Species',bubble?'Known xᵢ':'Known yᵢ','Pᵢˢᵃᵗ (kPa)','Substitution',termName],c.map((co,i)=>[esc(co.name),learningNumber(z[i]),learningNumber(ev.psat[i]),z[i]===0?'0':bubble?`${learningNumber(z[i])} × ${learningNumber(ev.psat[i])}`:solveT?`${learningNumber(z[i])} × ${learningNumber(p)} / ${learningNumber(ev.psat[i])}`:`${learningNumber(z[i])} / ${learningNumber(ev.psat[i])}`,learningNumber(terms[i],10)]));
    const total=sum(terms);
    finalMath+=learningEquation(`Sum = ${terms.map(v=>learningNumber(v,10)).join(' + ')} = ${learningNumber(total,10)}${bubble?' kPa':solveT?'':' kPa⁻¹'}`);
    if(!solveT){
      finalMath+=learningEquation(bubble?`P<sub>bubble</sub> = sum = ${learningNumber(p,9)} kPa`:`P<sub>dew</sub> = 1 / (${learningNumber(total,10)} kPa⁻¹) = ${learningNumber(p,9)} kPa`);
      finalMath+=learningAnswer(`${bubble?'Bubble':'Dew'} pressure`,P(p),state.pUnit);
    }else finalMath+=learningEquation(`Residual = sum − ${bubble?learningNumber(p):'1'} = ${learningNumber(root.residual,11)}${bubble?' kPa':''}`)+learningCheck(bubble?'Weighted saturation-pressure sum':'Dew composition sum',total,bubble?p:1,Math.max(1,bubble?p:1)*1e-8);
    if(ev.extrapolations?.length)finalMath+=`<div class="notice">This result uses explicitly enabled extrapolation for ${ev.extrapolations.map(a=>esc(a.name)).join(', ')}. It lies outside those fitted data and is an illustrative model result.</div>`;
    html+=learningStep(n++,solveT?'Verify the solved temperature with the original equation':'Substitute each species, add, and solve for pressure',finalMath);
    html+=learningStep(n++,bubble?'Calculate the first vapor bubble, species by species':'Calculate the first liquid drop, species by species',learningBoundaryCompositions(c,z,ev,p,bubble).html);
    html+=learningStep(n++,'Interpret the boundary without mixing it with the selected state',`<p>This result describes ${bubble?'the first infinitesimal vapor bubble':'the first infinitesimal liquid drop'} at T = ${learningNumber(t,6)} °C and P = ${learningNumber(p,6)} kPa. It is a boundary calculation using ${bubble?'x = z':'y = z'}.</p><p>The selected-state composition table above answers a separate question at its own T and P. Inside the two-phase region, neither phase composition can generally be copied from z. Use the flash calculation to find finite liquid and vapor amounts.</p>`);
    return '<div class="steps">'+html+'</div>';
  }
  function learningFlashSolution(){
    const {c,z,flash:f,opts}=model;let n=1,html='';
    html+=learningStep(n++,'List the feed and the two specified conditions',`<div class="given"><span>T = ${fmt(T(state.T),6)} ${esc(tLabel())}</span><span>P = ${fmt(P(state.P),6)} ${esc(state.pUnit)}</span><span>N = ${fmt(state.totalMoles,6)} mol</span></div><p>A flash calculation finds how much liquid and vapor coexist, and each phase’s composition, at the specified temperature, pressure, and overall composition. Define β = V/N.</p>`+learningComposition(c,z)+learningUnitNote());
    if(f.ok===false)return '<div class="steps">'+html+learningStep(n++,'Check that the specified state is supported',`<div class="notice">${esc(f.reason)}</div><p>No flash result is inferred outside the available property data.</p>`)+'</div>';
    html+=learningStep(n++,'Calculate vapor pressures and the equilibrium ratios',learningProperties(c,z,state.T,opts)+learningEquation('yᵢP = xᵢPᵢˢᵃᵗ → yᵢ = Kᵢxᵢ, where Kᵢ = Pᵢˢᵃᵗ/P')+learningTable(['Species','Pᵢˢᵃᵗ / P, both in kPa','Kᵢ'],c.map((co,i)=>[esc(co.name),z[i]===0?'Not needed (zᵢ = 0)':`${learningNumber(f.psat[i])} / ${learningNumber(state.P)}`,learningNumber(f.K[i],9)])));
    html+=learningStep(n++,'Combine the component balance with Raoult’s law',`<p>Let N be total moles, L liquid moles, and V vapor moles. Divide each component balance by N, substitute L/N = 1 − β, and use yᵢ = Kᵢxᵢ:</p>`+learningEquation('N = L + V<br>Nzᵢ = Lxᵢ + Vyᵢ<br>zᵢ = (1 − β)xᵢ + βyᵢ<br>zᵢ = (1 − β)xᵢ + βKᵢxᵢ = xᵢ[1 + β(Kᵢ − 1)]<br>xᵢ = zᵢ/[1 + β(Kᵢ − 1)]<br>yᵢ = Kᵢzᵢ/[1 + β(Kᵢ − 1)]')+`<p>Both phase compositions must sum to one. Set Σyᵢ − Σxᵢ = 0 to obtain the Rachford–Rice residual:</p>`+learningEquation('F(β) = Σ{zᵢ(Kᵢ − 1)/[1 + β(Kᵢ − 1)]} = 0')+`<p>The overall balance then gives 1 = (1 − β)Σxᵢ + βΣyᵢ. Together these equations ensure that each phase sum equals one.</p>`);
    if(f.phase==='indeterminate'){
      html+=learningStep(n++,'Recognize a saturation state with undetermined amounts',`<p>For every active species, Kᵢ ≈ 1. The residual F(β) is zero for every β, so this calculation cannot identify a unique vapor fraction.</p>`+learningEquation('xᵢ = yᵢ = zᵢ<br>0 ≤ V ≤ N; L = N − V')+`<div class="answer-box"><h3>Saturated state: phase amounts are undetermined</h3><p>T, P, and z do not determine V/N here. A further condition, such as total enthalpy, is needed. No arbitrary 50/50 split is assumed.</p></div>`);
      return '<div class="steps">'+html+'</div>';
    }
    const f0=f.endpointResiduals[0],f1=f.endpointResiduals[1];
    const boundaryText={liquid:'F(0) is negative. Even the all-liquid end has insufficient tendency to form vapor at this pressure. The stable result of this model is liquid only: β = 0 and x = z.',vapor:'F(1) is positive. The stable result of this model is vapor only: β = 1 and y = z.',bubble:'F(0) is zero within numerical tolerance. This is the bubble boundary: β = 0, x = z, and y describes an infinitesimal bubble.',dew:'F(1) is zero within numerical tolerance. This is the dew boundary: β = 1, y = z, and x describes an infinitesimal drop.','two-phase':'F(0) > 0 and F(1) < 0. A root lies between 0 and 1, so a finite amount of each phase is present.'}[f.phase];
    html+=learningStep(n++,'Test both ends before solving for vapor fraction',learningEquation(`F(0) = Σzᵢ(Kᵢ − 1) = ${learningNumber(f0,11)}<br>F(1) = Σ[zᵢ(Kᵢ − 1)/Kᵢ] = ${learningNumber(f1,11)}`)+`<p>${boundaryText}</p>`+(f.phase==='two-phase'?learningTrace(f.trace,'β','dimensionless'):'<p>No interior bisection search is needed for this state.</p>')+learningAnswer('Vapor mole fraction β',f.beta,'',`β is a fraction of total moles, not a vapor mole fraction for one particular species.`));
    let phaseMath='';
    if(f.phase==='liquid'||f.phase==='vapor'){
      const known=f.phase==='liquid'?'xᵢ':'yᵢ';
      phaseMath+=`<p>Only the ${f.phase} phase is present, so ${known} = zᵢ. The absent phase has no physical composition and is shown with a dash.</p>`+learningTable(['Species','Liquid xᵢ','Vapor yᵢ'],c.map((co,i)=>[esc(co.name),f.x?learningNumber(f.x[i],8):'— (no liquid)',f.y?learningNumber(f.y[i],8):'— (no vapor)']));
    }else{
      phaseMath+=`<p>Substitute the solved β separately for every species. ${f.phase==='bubble'||f.phase==='dew'?'The incipient phase has zero limiting amount, but its limiting composition is defined.':''}</p>`;
      phaseMath+=learningTable(['Species','xᵢ substitution','Liquid xᵢ','yᵢ = Kᵢxᵢ','Vapor yᵢ'],c.map((co,i)=>[esc(co.name),z[i]===0?'0':`${learningNumber(z[i])}/[1 + ${learningNumber(f.beta,9)} × (${learningNumber(f.K[i],9)} − 1)]`,learningNumber(f.x[i],9),z[i]===0?'0':`${learningNumber(f.K[i],9)} × ${learningNumber(f.x[i],9)}`,learningNumber(f.y[i],9)]));
    }
    if(f.x)phaseMath+=learningCheck('Σxᵢ',sum(f.x));if(f.y)phaseMath+=learningCheck('Σyᵢ',sum(f.y));
    html+=learningStep(n++,'Calculate and check the phase compositions',phaseMath);
    const N=state.totalMoles,V=N*f.beta,L=N-V;
    html+=learningStep(n++,'Convert fractions to amounts and close every balance',learningEquation(`V = Nβ = ${learningNumber(N)} × ${learningNumber(f.beta,9)} = ${learningNumber(V,9)} mol<br>L = N − V = ${learningNumber(N)} − ${learningNumber(V,9)} = ${learningNumber(L,9)} mol<br>L + V = ${learningNumber(L+V,9)} mol`)+learningTable(['Species','Feed Nzᵢ (mol)','Liquid Lxᵢ (mol)','Vapor Vyᵢ (mol)','Lxᵢ + Vyᵢ (mol)','Output − input (mol)'],c.map((co,i)=>{const ni=N*z[i],li=L*(f.x?.[i]??0),vi=V*(f.y?.[i]??0);return [esc(co.name),learningNumber(ni,9),learningNumber(li,9),learningNumber(vi,9),learningNumber(li+vi,9),learningNumber(li+vi-ni,11)];}))+learningCheck('Total-mole balance L + V',L+V,N,Math.max(1,N)*1e-8)+`<p>Each component’s input equals its liquid amount plus its vapor amount within rounding. Keep the unrounded β, x, and y for the checks.</p>`);
    if(f.evaluation.extrapolations?.length)html+='<div class="notice">This flash uses explicitly enabled Antoine extrapolation. Inspect the marked species property steps before interpreting it.</div>';
    return '<div class="steps">'+html+'</div>';
  }
  function learningSaturationSolution(){
    const c=state.components||model.c,opts=model.opts,focus=c.findIndex(co=>co.name===state.inspectedSpecies);
    const rows=[],work=[];let supported=0;
    c.forEach((co,i)=>{
      try{
        const result=VLE.evaluateVaporPressure(co,state.T,opts);supported++;
        rows.push([esc(co.name),learningNumber(result.psatKPa,8),learningNumber(P(result.psatKPa),8),result.extrapolated?'Explicitly enabled extrapolation':result.fit.model==='table'?'Table B.3 entry or interpolation':'Fit '+(result.fitIndex+1)+' within its range']);
        work.push(learningPropertyWork(co,i,state.T,result,focus>=0?i===focus:i===0));
      }catch(e){
        rows.push([esc(co.name),'—','—','Unsupported at this temperature']);
        work.push(`<details${i===focus?' open':''}><summary>${esc(co.name)} · no supported value</summary><div class="notice">${esc(e.message)}</div><p>This species is evaluated independently. Its unavailable pressure does not suppress supported pressures for the other pure species.</p></details>`);
      }
    });
    return '<div class="steps">'+learningStep(1,'Specify a temperature for each pure-species property',`<div class="given"><span>T = ${fmt(T(state.T),6)} ${esc(tLabel())}</span><span>Unknown: each pure-species saturation pressure</span></div><p>Evaluate each species independently at this temperature, including species whose mixture fraction is zero. No mixture mole fractions enter a pure saturation-pressure correlation.${focus>=0?' The inspected graph row belongs to <strong>'+esc(c[focus].name)+'</strong>; its detailed calculation is expanded below.':''}</p>`+learningUnitNote())+
      learningStep(2,'Evaluate the property data separately for each species',`<p>For an Antoine fit, substitute the temperature in that fit’s stated units, evaluate its logarithm, take the inverse logarithm, and convert the resulting pressure to kPa. For Table B.3 water, use an exact retained table entry or interpolate linearly between retained bracketing entries. The full substitutions follow for every supported species.</p>`+work.join(''))+
      learningStep(3,'Record the saturation pressures and locate the graph points',learningTable(['Pure species','Internal Pᵢˢᵃᵗ (kPa)','Display Pᵢˢᵃᵗ ('+esc(state.pUnit)+')','Property-data status'],rows)+`<p>${supported} of ${c.length} species have a supported or explicitly permitted extrapolated result at this temperature. Each available pressure gives one pure-species graph point: (T, Pᵢˢᵃᵗ). The selected operating pressure P is not used to calculate these property values. A pure species at P = Pᵢˢᵃᵗ is at saturation; its phase amounts require another condition.</p><p>To construct a mixture boundary, return to a bubble or dew calculation and apply the appropriate composition weighting. An unavailable pure-species value remains blank; the graph does not infer it from other species.</p>`)+'</div>';
  }
  function renderWorked(){
    const host=$('worked-solution');if(!model){host.innerHTML='';return;}
    try{host.innerHTML=state.calculation==='sat'?learningSaturationSolution():state.calculation==='flash'?learningFlashSolution():learningBoundarySolution(state.calculation);}
    catch(e){host.innerHTML=`<div class="notice">This working cannot be completed with the current inputs: ${esc(e.message)}</div>`;}
  }
  function learningGraphStatus(p){
    if(!p)return 'Break: unsupported point or property-fit switch';
    const ev=p.evaluation||{};
    const fits=(ev.chosenFits||[]).map((f,i)=>f?(i+1)+': '+(f.fit.model==='table'?'table':'fit '+(f.fitIndex+1))+(f.extrapolated?' (extrapolated)':''):'').filter(Boolean).join('; ');
    return (ev.extrapolations?.length?'Extrapolated':'Within selected data')+(fits?' · '+fits:'')+(p.warning?' · '+p.warning:'');
  }
  function learningGraphExplanation(){
    const {c,z}=model;
    const common=`<p class="small muted">The table lists evaluated points, not pixels read from the graph. Curves connect only supported points within a continuous property-fit segment. Gaps and fit changes remain broken. Extrapolated segments are dotted and identified explicitly. Increasing curve samples makes the drawing smoother; it does not improve the underlying property data.</p>`;
    if(state.mode==='pt')return `<h3>Build both boundaries at fixed overall composition</h3><ol><li>Keep the original z fixed: ${z.map((v,i)=>esc(c[i].name)+' = '+learningNumber(v,5)).join('; ')}.</li><li>Choose successive temperatures from the supported intervals. At each temperature, evaluate every active species’ saturation pressure.</li><li>For the bubble boundary set x = z, and calculate P<sub>b</sub> = ΣzᵢPᵢˢᵃᵗ.</li><li>For the dew boundary set y = z, and calculate P<sub>d</sub> = 1/Σ(zᵢ/Pᵢˢᵃᵗ).</li><li>Plot (T, P<sub>b</sub>) and (T, P<sub>d</sub>) from each row. These are two different boundary states, not a tie line between two coexisting phases.</li></ol><p>At a fixed temperature: above the bubble boundary is liquid; below the dew boundary is vapor; between them both phases coexist. The complete supported temperature range can be fitted into the view, but this ideal model does not predict critical closure.</p>${common}`;
    if(state.mode==='pxy')return `<h3>One liquid-composition row gives two plotted points</h3><p>This is the binary pair ${esc(c[0].name)} (A) and ${esc(c[1].name)} (B), at fixed T = ${fmt(T(state.T),5)} ${esc(tLabel())}. Other species are excluded.</p><ol><li>Sweep liquid x<sub>A</sub> from 0 to 1; set x<sub>B</sub> = 1 − x<sub>A</sub>. The graph’s trial liquid composition is an input for this row, not necessarily the selected sample’s overall z<sub>A</sub>.</li><li>Calculate P = x<sub>A</sub>P<sub>A</sub><sup>sat</sup> + (1 − x<sub>A</sub>)P<sub>B</sub><sup>sat</sup>.</li><li>Calculate y<sub>A</sub> = x<sub>A</sub>P<sub>A</sub><sup>sat</sup>/P and y<sub>B</sub> = 1 − y<sub>A</sub>.</li><li>Plot a bubble point at (x<sub>A</sub>, P) and a dew point at (y<sub>A</sub>, P). The two endpoints share one pressure and form a horizontal tie line.</li></ol><p>The bubble curve is the upper boundary, the dew curve the lower boundary. The interval between their compositions at a chosen pressure can contain a two-phase sample; z determines its phase amounts.</p>${common}`;
    if(state.mode==='txy')return `<h3>Solve a temperature for every liquid composition</h3><p>This is the binary pair ${esc(c[0].name)} (A) and ${esc(c[1].name)} (B), at fixed P = ${fmt(P(state.P),5)} ${esc(state.pUnit)}.</p><ol><li>Sweep x<sub>A</sub> from 0 to 1 and set x<sub>B</sub> = 1 − x<sub>A</sub>.</li><li>For each row, solve x<sub>A</sub>P<sub>A</sub><sup>sat</sup>(T) + (1 − x<sub>A</sub>)P<sub>B</sub><sup>sat</sup>(T) − P = 0 in a supported continuous interval.</li><li>At that row’s solved T, calculate y<sub>A</sub> = x<sub>A</sub>P<sub>A</sub><sup>sat</sup>(T)/P.</li><li>Plot (x<sub>A</sub>, T) on the bubble curve and (y<sub>A</sub>, T) on the dew curve. Do not plot both curves against x<sub>A</sub>.</li></ol><p>The bubble curve is the lower boundary and the dew curve the upper boundary. Pure endpoints use only the present species’ data, so they can extend beyond the mixed-composition temperature range. “Inspect row” can set up that row’s bubble calculation for a full temperature trace.</p>${common}`;
    return `<h3>Evaluate each pure species independently</h3><ol><li>For each species, select temperatures from its own property-data ranges.</li><li>Use its first valid Antoine fit, or the tabulated-water interpolation, at each temperature.</li><li>Plot (T, Pᵢˢᵃᵗ). A species’ pure vapor-pressure curve does not depend on the mixture composition.</li></ol><p>These are pure-species property curves, not multicomponent phase boundaries. The mixture’s bubble and dew pressures require composition weighting.</p>${common}`;
  }
  function renderGraphData(){
    if(!model||!curves){$('graph-explanation').innerHTML='';$('graph-data-table').innerHTML='';$('graph-data-note').textContent='';$('more-rows').hidden=true;return;}
    $('graph-explanation').innerHTML=learningGraphExplanation();
    const entries=curves.rows.map((p,index)=>({p,index})).filter(r=>r.p),limit=Math.max(1,Number(state.rows)||12),shown=entries.slice(0,limit),mode=state.mode;
    const headers=mode==='pt'?['Row','T ('+esc(tLabel())+')','P bubble ('+esc(state.pUnit)+')','P dew ('+esc(state.pUnit)+')','Property data','Working']:mode==='psat'?['Row','Species','T ('+esc(tLabel())+')','Pᵢˢᵃᵗ ('+esc(state.pUnit)+')','Property data','Working']:['Row','xA (liquid)','yA (vapor)','T ('+esc(tLabel())+')','P ('+esc(state.pUnit)+')','Property data','Working'];
    const data=shown.map(({p,index})=>{
      const button=`<button class="text-button" data-sample="${index}" aria-label="Inspect calculation for graph row ${index+1}">Inspect row</button>`;
      if(mode==='pt')return [index+1,learningNumber(T(p.T),6),learningNumber(P(p.bubblePressure),6),learningNumber(P(p.dewPressure),6),esc(learningGraphStatus(p)),button];
      if(mode==='psat')return [index+1,esc(p.species),learningNumber(T(p.T),6),learningNumber(P(p.bubblePressure),6),esc(learningGraphStatus(p)),button];
      return [index+1,learningNumber(p.x,7),learningNumber(p.y,7),learningNumber(T(p.T),6),learningNumber(P(p.P),6),esc(learningGraphStatus(p)),button];
    });
    $('graph-data-table').innerHTML='<thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+data.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody>';
    $('graph-data-note').textContent=`Showing ${shown.length} of ${entries.length} evaluated rows in plotting order. ${curves.rows.length-entries.length} line-break markers are omitted from this table; the CSV includes them. Row numbers refer to the original graph samples.`+(mode==='pt'&&state.showPure?' Optional pure-species overlays are separate; this table and CSV contain the mixture boundary rows.':'');
    $('more-rows').hidden=shown.length>=entries.length;
    if(!entries.length)$('graph-data-note').textContent='There are no supported graph rows for these settings. The solver does not fill unsupported regions with inferred values.';
  }
  function exportGraphCSV(){
    if(!curves||!model){notify('There are no graph rows to export.');return;}
    const header=['sample_index','diagram','species','T_C','T_display_'+tLabel(),'P_kPa','P_display_'+state.pUnit,'bubble_P_kPa','dew_P_kPa','x_A','y_A','property_status'];
    const rows=curves.rows.map((p,index)=>{
      if(!p)return [index+1,state.mode,'','','','','','','','','','LINE BREAK: unsupported point or property-fit switch; curves are not connected'];
      return [index+1,state.mode,p.species||'',p.T,T(p.T),finite(p.P)?p.P:'',finite(p.P)?P(p.P):'',p.bubblePressure??'',p.dewPressure??'',p.x??'',p.y??'',learningGraphStatus(p)];
    });
    const csvEscape=v=>{let s=String(v??'');if(/^[=+@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    download('\uFEFF'+[header,...rows].map(row=>row.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8',filename()+'-'+state.mode+'-graph-data.csv');
  }
