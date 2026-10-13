(() => {
  'use strict';
  const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
  const library=JSON.parse($('species-library').textContent);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sum=a=>a.reduce((s,x)=>s+x,0), finite=Number.isFinite;
  const fmt=(n,d=4)=>!finite(n)?'—':n!==0&&(Math.abs(n)<.0001||Math.abs(n)>=1e7)?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:d});
  const fixed=(n,d=5)=>finite(n)?n.toFixed(d):'—';
  const normalize=a=>{const s=sum(a);return s>0?a.map(x=>x/s):a;};
  const nameKey=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const species=(name)=>clone(library.find(s=>nameKey(s.name)===nameKey(name))||library.find(s=>s.id===name)||library[0]);
  const makeComponents=(names,z)=>names.map((n,i)=>({...species(n),amount:z[i]}));
  const defaults=()=>({version:3,title:'Aromatic mixture · Table B.4',example:'class3',components:makeComponents(['Benzene','Toluene','Ethylbenzene'],[.5,.3,.2]),basis:'fraction',mode:'pt',T:75,P:40,tUnit:'C',pUnit:'kPa',pairA:0,pairB:1,binaryZ:.5,rangeMode:'auto',tMin:40,tMax:140,pressureScale:'auto',samples:241,verticalRange:'auto',yMin:0,yMax:200,includeState:false,showPure:false,extrapolate:false,totalMoles:100,calculation:'bt',panel:'steps',theme:'light',visible:{},rows:12});
  let state=defaults(),model=null,curves=null,chartContext=null,cacheKey='',cacheData=null,editorIndex=null,editorDraft=null,toastTimer,updateTimer,drawNumber=0;
  try{const old=JSON.parse(localStorage.getItem('vle-toolkit-problem-v3'));if(old)state=validateSaved(old);}catch{}
  const T=v=>VLE.temperatureFromC(v,state.tUnit),P=v=>VLE.pressureFromKPa(v,state.pUnit),Tc=v=>VLE.temperatureToC(v,state.tUnit),Pk=v=>VLE.pressureToKPa(v,state.pUnit);
  const tLabel=()=>state.tUnit==='K'?'K':'°'+state.tUnit;
  function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  function persist(){try{localStorage.setItem('vle-toolkit-problem-v3',JSON.stringify(state));}catch{}}
  function validateSaved(raw){
    if(!raw||raw.version!==3||!Array.isArray(raw.components)||raw.components.length<1||raw.components.length>12)throw Error('This is not a supported VLE Toolkit problem file.');
    const s={...defaults(),...raw};
    if(!['pt','pxy','txy','psat'].includes(s.mode)||!['C','K','F'].includes(s.tUnit)||!Object.keys(VLE.PRESSURE_FACTORS).includes(s.pUnit)||!['fraction','moles'].includes(s.basis))throw Error('The problem contains an unsupported mode or unit.');
    if(!s.components.every(c=>typeof c.name==='string'&&c.name.length<=100&&finite(c.amount)&&c.amount>=0&&Array.isArray(c.fits)&&c.fits.length>0&&c.fits.length<=15))throw Error('Check the species names, amounts, and property fits in this problem.');
    const z=normalize(s.components.map(c=>c.amount));const valid=VLE.validate(s.components,z);if(!valid.ok)throw Error(valid.errors.join(' '));
    for(const k of ['T','P','tMin','tMax','binaryZ','totalMoles','yMin','yMax'])if(!finite(s[k]))throw Error('Problem contains a missing or nonnumeric '+k+'.');
    if(s.T<=-273.15||s.P<=0||s.totalMoles<=0||s.binaryZ<0||s.binaryZ>1)throw Error('Problem contains invalid operating conditions.');
    if(!Number.isInteger(s.pairA)||!Number.isInteger(s.pairB)||s.pairA<0||s.pairB<0||s.pairA>=s.components.length||s.pairB>=s.components.length)throw Error('Binary pair indices are invalid.');
    if(!['auto','custom'].includes(s.rangeMode)||!['auto','custom'].includes(s.verticalRange)||!['auto','linear','log'].includes(s.pressureScale))throw Error('Unsupported plot settings.');
    s.calculation=['sat','bp','dp','bt','dt','flash'].includes(s.calculation)?s.calculation:'bp';s.samples=[121,241,481].includes(s.samples)?s.samples:241;s.theme=s.theme==='dark'?'dark':'light';s.visible=typeof s.visible==='object'&&s.visible?s.visible:{};s.panel=['steps','graph','model'].includes(s.panel)?s.panel:'steps';s.rows=12;return s;
  }
  function setValue(id,value){if(document.activeElement!==$(id))$(id).value=value;}
  function options(trace=true){return {...(state.rangeMode==='custom'?{temperatureRange:[state.tMin,state.tMax]}:{}),extrapolate:state.rangeMode==='custom'&&state.extrapolate,trace};}
  function mixture(){
    let c=state.components,z=state.components.map(c=>c.amount);
    if(state.mode==='pxy'||state.mode==='txy'){
      if(state.pairA===state.pairB||!c[state.pairA]||!c[state.pairB])throw Error('Choose two different species for a binary diagram.');
      c=[c[state.pairA],c[state.pairB]];z=[state.binaryZ,1-state.binaryZ];
    }else if(state.basis==='moles')z=normalize(z);
    const valid=VLE.validate(c,z);if(!valid.ok)throw Error(valid.errors.join(' '));
    return {c,z:normalize(z)};
  }
  function renderMixture(){
    const z=normalize(state.components.map(c=>c.amount));
    $('mixture-rows').innerHTML=state.components.map((c,i)=>`<div class="mixture-row"><div class="species-top"><span class="species-index">${String(i+1).padStart(2,'0')}</span><span class="species-name">${esc(c.name)}</span><button class="icon-button" data-remove="${i}" aria-label="Remove ${esc(c.name)}" ${state.components.length===1?'disabled':''}>×</button></div><div class="species-values"><div><label for="amount-${i}">${state.basis==='fraction'?'Mole fraction zᵢ':'Relative moles'}<input id="amount-${i}" type="number" min="0" ${state.basis==='fraction'?'max="1"':''} step="any" value="${c.amount}" data-amount="${i}"></label><div class="fraction-result" data-fraction="${i}">${state.basis==='moles'?'zᵢ = '+fixed(z[i]):c.fits.some(f=>f.model==='table')?'Table B.3 · interpolation':c.sourceLabel?.startsWith('Table B.4')?'Table B.4':'Custom data'}</div></div><button class="text-button" data-edit="${i}">${c.fits.some(f=>f.model==='table')?'Table data':'Antoine data'}</button></div></div>`).join('');
    $('component-count').textContent=state.components.length+' / 12';$('add-species').disabled=state.components.length>=12;
    const pairOpts=state.components.map((c,i)=>`<option value="${i}">${esc(c.name)}</option>`).join('');$('pair-a').innerHTML=pairOpts;$('pair-b').innerHTML=pairOpts;
    $('new-species').innerHTML='<option value="custom">+ Custom species…</option><optgroup label="Textbook Table B.4">'+library.filter(s=>!s.fits.some(f=>f.model==='table')).sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')+'</optgroup><optgroup label="Textbook Table B.3">'+library.filter(s=>s.fits.some(f=>f.model==='table')).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')+'</optgroup>';
    syncControls();renderSources();
  }
  function syncControls(){
    $$('.diagram-tab').forEach(b=>b.disabled=state.components.length<2&&['pxy','txy'].includes(b.dataset.mode));
    document.documentElement.dataset.theme=state.theme;$('theme-button').textContent=state.theme==='light'?'Dark theme':'Light theme';
    const map={'example':state.example,'problem-title':state.title,basis:state.basis,'temperature-unit':state.tUnit,'pressure-unit':state.pUnit,'feed-moles':state.totalMoles,'pair-a':state.pairA,'pair-b':state.pairB,'binary-z':state.binaryZ,'binary-slider':state.binaryZ,'temperature':fmt(T(state.T),6).replace(/,/g,''),'pressure':fmt(P(state.P),7).replace(/,/g,''),'range-mode':state.rangeMode,'pressure-scale':state.pressureScale,samples:state.samples,'vertical-range':state.verticalRange,'t-min':T(state.tMin),'t-max':T(state.tMax),'y-min':state.yMin,'y-max':state.yMax,calculation:state.calculation};
    Object.entries(map).forEach(([k,v])=>setValue(k,v));
    for(const [id,key] of [['include-state','includeState'],['show-pure','showPure'],['extrapolate','extrapolate']])$(id).checked=!!state[key];
    $('temperature-label').textContent=`Temperature (${tLabel()})`;$('pressure-label').textContent=`Pressure (${state.pUnit})`;
    $('t-min-label').firstChild.textContent=`Minimum T (${tLabel()})`;$('t-max-label').firstChild.textContent=`Maximum T (${tLabel()})`;
    const verticalUnit=state.mode==='txy'?tLabel():state.pUnit;$('y-min-label').firstChild.textContent=`Minimum (${verticalUnit})`;$('y-max-label').firstChild.textContent=`Maximum (${verticalUnit})`;
    $('y-min').disabled=$('y-max').disabled=state.verticalRange!=='custom';$('temperature-range-fields').hidden=state.rangeMode!=='custom';$('extrapolate').disabled=state.rangeMode!=='custom';$('show-pure').disabled=state.mode!=='pt';
    $('binary-controls').hidden=!['pxy','txy'].includes(state.mode);
    $$('.diagram-tab').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));});
    $$('.learning-tab').forEach(b=>{b.classList.toggle('active',b.dataset.panel===state.panel);b.setAttribute('aria-pressed',String(b.dataset.panel===state.panel));});
    ['steps','graph','model'].forEach(p=>$(p+'-panel').hidden=p!==state.panel);
    const total=sum(state.components.map(c=>c.amount));$('composition-sum').textContent=(state.basis==='moles'?'Relative total: ':'Sum zᵢ = ')+fmt(total,6);$('normalize').hidden=state.basis==='moles';
    state.components.forEach((c,i)=>{if(state.basis==='moles')document.querySelector(`[data-fraction="${i}"]`).textContent='zᵢ = '+fixed(c.amount/total);});
  }
  function safe(fn){try{return fn();}catch(e){return {ok:false,reason:e.message};}}
  function refresh(animate=false){
    clearTimeout(updateTimer);syncControls();
    try{
      if(!finite(state.T)||state.T<=-273.15||!finite(state.P)||state.P<=0)throw Error('Enter a temperature above absolute zero and a positive absolute pressure.');
      if(!finite(state.totalMoles)||state.totalMoles<=0)throw Error('Enter a positive total feed amount.');
      const {c,z}=mixture(),opts=options();
      const intervals=VLE.coverageIntervals(c,z,opts);
      const ev=safe(()=>VLE.evaluateSaturation(state.T,c,z,opts));
      const bt=safe(()=>VLE.bubbleTemperature(state.P,c,z,opts)),dt=safe(()=>VLE.dewTemperature(state.P,c,z,opts));
      const flash=safe(()=>VLE.flash(state.P,state.T,c,z,opts));
      model={c,z,opts,intervals,ev,bt,dt,flash};
      $('input-error').hidden=true;
      if(ev.ok===false){$('input-error').textContent='Selected-state calculation: '+ev.reason+' The supported graph remains available.';$('input-error').hidden=false;$('input-error').className='notice';}else $('input-error').className='notice error';
      buildCurves();renderResults();renderWorked();renderGraphData();updateSliders();drawChart(animate);persist();
    }catch(e){
      model=null;curves=null;$('input-error').textContent=e.message;$('input-error').hidden=false;$('input-error').className='notice error';$('chart-empty').textContent='Update the inputs to draw this problem.';$('chart-empty').hidden=false;$('boundary-results').innerHTML='';$('phase-state').textContent='Inputs need attention';$('phase-description').textContent='';$('vapor-amount').textContent='—';$('phase-table').querySelector('tbody').innerHTML='';$('worked-solution').innerHTML='<div class="notice">'+esc(e.message)+'</div>';$('graph-data-table').innerHTML='';$('phase-meter-fill').style.width='0%';$('plot-legend').innerHTML='';$('phase-chart').innerHTML='';chartContext=null;
    }
  }
  function updateSliders(){
    if(!model)return;
    let ints=model.intervals;if(!ints.length)ints=[[state.T-20,state.T+20]];
    let lo=ints[0][0],hi=ints[ints.length-1][1];if(lo===hi){lo-=1;hi+=1;}
    $('temperature-slider').min=T(lo);$('temperature-slider').max=T(hi);$('temperature-slider').step=(T(hi)-T(lo))/1000;$('temperature-slider').value=T(state.T);
    const ps=state.mode==='txy'?VLE.ptEnvelope(model.c,model.z,31,options(false)).points.filter(Boolean).flatMap(p=>[p.bubblePressure,p.dewPressure]):(curves?.series||[]).flatMap(s=>s.points.filter(Boolean).map(p=>p.rawP)).filter(v=>finite(v)&&v>0);
    const pmin=ps.length?Math.max(1e-8,Math.min(...ps)*.75):1,pmax=ps.length?Math.max(...ps)*1.2:200;
    $('pressure-slider').dataset.min=pmin;$('pressure-slider').dataset.max=pmax;$('pressure-slider').value=Math.max(0,Math.min(1000,1000*Math.log(state.P/pmin)/Math.log(pmax/pmin)));
  }
  function renderResults(){
    const {c,z,ev,bt,dt,flash:f}=model;
    $('practice-prompt').innerHTML='<b>Work through this state.</b> Use '+c.map((co,i)=>esc(co.name)+' ('+fixed(z[i],3)+')').join(', ')+'. Find the bubble and dew pressures at '+fmt(T(state.T),3)+' '+tLabel()+', and the bubble and dew temperatures at '+fmt(P(state.P),3)+' '+state.pUnit+'. Then determine the phase and phase amounts for '+fmt(state.totalMoles,3)+' mol at this T and P. Select a calculation below to follow its solution.';
    $('boundary-results').innerHTML=[['Bubble','bp','bt',ev.bubblePressure,bt,'x = z; the first vapor appears.','var(--bubble)'],['Dew','dp','dt',ev.dewPressure,dt,'y = z; the first liquid appears.','var(--dew)']].map(([title,pk,tk,p,t,sub,color])=>`<article class="boundary-card"><h3><span class="boundary-dot" style="background:${color}"></span>${title} point</h3><div class="boundary-values"><div><div class="boundary-value">${finite(p)?fmt(P(p),3):'—'} <small>${state.pUnit}</small></div><div class="boundary-label">at selected T = ${fmt(T(state.T),2)} ${tLabel()}</div></div><div><div class="boundary-value">${t.ok?fmt(T(t.temperatureC),3):'—'} <small>${tLabel()}</small></div><div class="boundary-label">${t.ok?'at selected P = '+fmt(P(state.P),3)+' '+state.pUnit:'No supported temperature root'}</div></div></div><div class="boundary-label">${sub}</div><div class="boundary-actions"><button class="text-button" data-boundary="${pk}" ${!finite(p)?'disabled':''}>Set pressure</button><button class="text-button" data-boundary="${tk}" ${!t.ok?'disabled':''}>Set temperature</button><button class="text-button" data-calculation="${state.mode==='txy'?tk:pk}">Show working</button></div></article>`).join('');
    [bt,dt].forEach((root,i)=>{
      if(!root.warning)return;
      const note=document.createElement('div');note.className='notice small';
      note.textContent='Multiple supported roots: '+root.roots.map(r=>fmt(T(r.temperatureC),3)+' '+tLabel()).join(', ')+'. The lowest root is displayed; inspect the supplied fits before interpreting this boundary.';
      $('boundary-results').children[i].appendChild(note);
    });
    const names={liquid:'Liquid only',vapor:'Vapor only','two-phase':'Liquid + vapor',bubble:'At the bubble point',dew:'At the dew point',indeterminate:'Saturated · phase amounts undetermined'};
    $('phase-state').textContent=names[f.phase]||'Selected state outside property data';
    const amount=finite(f.beta)?`V = ${fmt(state.totalMoles*f.beta,5)} mol · L = ${fmt(state.totalMoles*(1-f.beta),5)} mol`:'T and P alone do not determine V/N.';
    $('phase-description').textContent=f.ok===false?f.reason:({liquid:'x = z. There is no vapor phase.',vapor:'y = z. There is no liquid phase.',bubble:'x = z. The displayed y describes the first infinitesimal bubble.',dew:'y = z. The displayed x describes the first infinitesimal drop.',indeterminate:'Liquid and vapor have the same composition.','two-phase':'z = (1 − β)x + βy. '+amount}[f.phase]);
    $('vapor-amount').textContent=finite(f.beta)?fixed(f.beta,5):'—';$('phase-meter-fill').style.width=(finite(f.beta)?f.beta*100:0)+'%';
    $('phase-table').querySelector('tbody').innerHTML=c.map((co,i)=>`<tr><td>${esc(co.name)}</td><td>${fixed(z[i])}</td><td>${f.x?fixed(f.x[i]):'—'}</td><td>${f.y?fixed(f.y[i]):'—'}</td><td>${f.K?fmt(f.K[i],5):'—'}</td></tr>`).join('');
    const warned=c.some(co=>/water|methanol|ethanol|acetone|acid|amine|glycol/i.test(co.name));$('library-warning').hidden=!warned;$('library-warning').textContent='This is an ideal-model calculation. Polar or associating mixtures may deviate strongly from Raoult’s law.';
  }
  function anomalyNote(c){const a=c.sourceAnomalies||c.fits.flatMap(f=>f.sourceAnomalies||[]);return a.length?'<div class="notice small"><b>Printed-table anomalies excluded from calculations:</b> '+a.map(v=>fmt(v.T,1)+' °C → '+v.printedMmHg+' mmHg').join('; ')+'. These nonmonotonic entries are preserved in the source data, never silently corrected. At these temperatures, the tool interpolates between the surrounding accepted entries.</div>':'';}
  function renderSources(){
    $('data-sources').innerHTML=state.components.map(c=>`<article class="data-source"><h4>${esc(c.name)} <span class="muted">${esc(c.formula||'')}</span></h4><p>${esc(c.sourceLabel||'User-entered property data')}</p><p>${esc(c.notes||'')}</p>${anomalyNote(c)}${c.fits.map((f,i)=>`<p><b>${f.model==='table'?'Tabulated liquid-water pressure':'Fit '+(i+1)}</b>: ${fmt(f.minC,2)}–${fmt(f.maxC,2)} °C · ${f.model==='table'?f.points.length+' tabulated values, linear interpolation':(f.logBase==='e'?'ln':'log₁₀')+', '+f.tUnit+', '+f.pUnit}${f.starred?' · starred fit in source':''}</p>`).join('')}</article>`).join('');
  }
  function applyExample(name){
    const units={tUnit:state.tUnit,pUnit:state.pUnit,theme:state.theme};state={...defaults(),...units};
    if(name==='binary'){state.components=makeComponents(['Benzene','Toluene'],[.5,.5]);state.T=60;state.P=30;state.binaryZ=.5;state.mode='pxy';state.title='Benzene + toluene · Table B.4';state.calculation='bp';}
    if(name==='alkanes'){state.components=makeComponents(['n-Hexane','n-Heptane','n-Octane'],[.4,.35,.25]);state.T=60;state.P=34;state.title='Hydrocarbon mixture · Table B.4';}
    if(name==='alcohols'){state.components=makeComponents(['Methanol','Ethanol'],[.5,.5]);state.T=62.5;state.P=70;state.title='Alcohol mixture · ideal model';state.mode='txy';}
    if(name==='water'){const water=library.find(s=>s.fits.some(f=>f.model==='table'))||species('Water');state.components=[{...clone(water),amount:1}];state.T=25;state.P=101.325;state.title='Pure water · Table B.3';state.pairB=0;state.totalMoles=1;state.mode='psat';state.calculation='bp';}
    state.example=name;cacheKey='';renderMixture();refresh();
  }
  function editSpecies(i,custom=false){
    editorIndex=i;editorDraft=custom?{id:'custom-'+Date.now(),name:'Custom species',formula:'',sourceLabel:'User-entered data',notes:'',fits:[{A:null,B:null,C:null,tUnit:'C',pUnit:'mmHg',logBase:'10',minC:0,maxC:100}]}:clone(state.components[i]);
    $('species-name').value=editorDraft.name;$('species-formula').value=editorDraft.formula||'';$('species-notes').value=editorDraft.notes||'';$('species-dialog-title').textContent='Property data · '+editorDraft.name;$('species-error').hidden=true;renderFitEditors();$('species-dialog').showModal();
  }
  function renderFitEditors(){
    const number=(label,key,f,i)=>`<label>${label}<input type="number" step="any" data-fit="${i}" data-key="${key}" value="${f[key]??''}" required></label>`;
    const select=(label,key,f,i,vals)=>`<label>${label}<select data-fit="${i}" data-key="${key}">${vals.map(([v,t])=>`<option value="${v}" ${String(f[key]??'10')===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    $('fit-editors').innerHTML=editorDraft.fits.map((f,i)=>f.model==='table'?`<article class="fit-editor"><h3>Table B.3 · liquid water</h3><p>${f.points.length} source values from ${fmt(f.minC,2)} to ${fmt(f.maxC,2)} °C. Exact table values are returned at tabulated temperatures. Between entries, pressure is linearly interpolated.</p>${anomalyNote(editorDraft)}<p class="small muted">The ice rows are not used as liquid-water vapor pressure. Tabulated values remain bounded even when Antoine extrapolation is enabled.</p><div class="equation">P(T) = P₁ + (T − T₁) / (T₂ − T₁) × (P₂ − P₁)</div></article>`:`<article class="fit-editor"><div class="fit-heading"><h3>Fit ${i+1}${i===0?' · first priority':''}</h3><div class="fit-actions"><button class="text-button" type="button" data-fit-up="${i}" ${i===0?'disabled':''}>Move up</button><button class="text-button" type="button" data-fit-remove="${i}" ${editorDraft.fits.length===1?'disabled':''}>Remove</button></div></div><div class="fit-grid">${number('A','A',f,i)}${number('B','B',f,i)}${number('C','C',f,i)}${select('Logarithm','logBase',f,i,[['10','log₁₀'],['e','ln']])}${select('Antoine T unit','tUnit',f,i,[['C','°C'],['K','K'],['F','°F']])}${select('Antoine pressure unit','pUnit',f,i,Object.keys(VLE.PRESSURE_FACTORS).map(u=>[u,u]))}${number('Valid from (°C)','minC',f,i)}${number('Valid through (°C)','maxC',f,i)}</div><div class="fit-source">${esc(f.source||'User-entered coefficients')}</div></article>`).join('');
    $('add-fit').hidden=editorDraft.fits.some(f=>f.model==='table');
  }
  function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const filename=()=>state.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'vle-problem';

  // Plotting and worked calculations are below. All calculations use °C/kPa
  // internally; unit selectors change presentation and entry conversions.
  function color(i){return ['var(--bubble)','var(--dew)','var(--positive)','#9870c8','#ca5580','#65903a'][i%6];}
  function splitPoints(points){const groups=[];let g=[];for(const p of points){if(p&&finite(p.x)&&finite(p.y)){g.push(p);}else if(g.length){groups.push(g);g=[];}}if(g.length)groups.push(g);return groups;}
  function interp(points,x){
    for(const raw of splitPoints(points)){const a=raw.slice().sort((a,b)=>a.x-b.x);if(x<a[0].x-1e-10||x>a.at(-1).x+1e-10)continue;const i=d3.bisector(d=>d.x).left(a,x),l=a[Math.max(0,i-1)],h=a[Math.min(a.length-1,i)];if(Math.abs(x-l.x)<1e-9)return l.y;if(Math.abs(x-h.x)<1e-9)return h.y;return l.x===h.x?l.y:l.y+(h.y-l.y)*(x-l.x)/(h.x-l.x);}return null;
  }
  function buildCurves(){
    const {c,z}=model,opts=options(false);
    const key=JSON.stringify([c,z,state.mode,state.mode==='pxy'?state.T:state.mode==='txy'?state.P:null,opts,state.samples,state.showPure,state.tUnit,state.pUnit]);
    if(key===cacheKey){curves=cacheData;return;}
    const converted=(raw,x,y,rawP)=>raw?{x,y,rawP,raw,extrapolated:!!raw.evaluation?.extrapolations?.length}:null;
    const series=[],mode=state.mode;let rows=[],gaps=[],intervals=[];
    if(mode==='pt'){
      const data=VLE.ptEnvelope(c,z,state.samples,opts);rows=data.points;gaps=data.gaps;intervals=data.intervals;
      series.push({id:'bubble',label:'Bubble boundary',color:'var(--bubble)',points:rows.map(p=>p?converted(p,T(p.T),P(p.bubblePressure),p.bubblePressure):null)});
      series.push({id:'dew',label:'Dew boundary',color:'var(--dew)',dash:'6 4',points:rows.map(p=>p?converted(p,T(p.T),P(p.dewPressure),p.dewPressure):null)});
    }else if(mode==='pxy'||mode==='txy'){
      const data=mode==='pxy'?VLE.binaryPxy(state.T,c,state.samples,opts):VLE.binaryTxy(state.P,c,state.samples,opts);rows=data.points;gaps=data.gaps;intervals=model.intervals;
      series.push({id:'bubble',label:'Bubble · liquid xA',color:'var(--bubble)',points:rows.map(p=>p?converted(p,p.x,mode==='pxy'?P(p.P):T(p.T),p.P):null)});
      series.push({id:'dew',label:'Dew · vapor yA',color:'var(--dew)',dash:'6 4',points:rows.map(p=>p?converted(p,p.y,mode==='pxy'?P(p.P):T(p.T),p.P):null)});
    }
    if(mode==='psat'||(mode==='pt'&&state.showPure)){
      c.forEach((co,i)=>{
        const data=VLE.ptEnvelope([co],[1],state.samples,opts);
        const points=data.points.map(p=>p?converted(p,T(p.T),P(p.bubblePressure),p.bubblePressure):null);
        series.push({id:'species-'+i,label:co.name,color:color(i+2),dash:mode==='pt'?'3 3':null,points});
        if(mode==='psat'){data.points.forEach(p=>rows.push(p?{...p,species:co.name}:null));intervals.push(...data.intervals);gaps.push(...data.gaps);}
      });
    }
    curves={series,rows,gaps,intervals};cacheData=curves;cacheKey=key;
  }
  function drawChart(animate=false){
    if(!curves||!model)return;
    $('chart-tooltip').hidden=true;
    const {series,intervals}=curves,mode=state.mode,{c,z}=model;
    const width=Math.floor($('chart-wrap').clientWidth),height=width<420?340:420,m={l:68,r:18,t:22,b:60},w=width-m.l-m.r,h=height-m.t-m.b;
    if(width<100)return;
    const titles={pt:'P–T phase boundaries',pxy:'Pressure–composition diagram',txy:'Temperature–composition diagram',psat:'Pure-species vapor pressures'};
    $('plot-title').textContent=titles[mode];$('plot-subtitle').textContent=mode==='pt'?'Fixed overall composition · click to place a state':mode==='psat'?'Each species uses its own valid data range · click to select T':`${c[0].name} / ${c[1].name} · ${mode==='pxy'?'T = '+fmt(T(state.T),2)+' '+tLabel():'P = '+fmt(P(state.P),3)+' '+state.pUnit}`;
    $('envelope-note').hidden=mode!=='pt';
    $('coverage-note').textContent=intervals.length?'Supported T: '+intervals.map(r=>fmt(T(r[0]),2)+'–'+fmt(T(r[1]),2)).filter((s,i,a)=>a.indexOf(s)===i).join(' ; ')+' '+tLabel():'No common fitted interval';
    if(mode==='txy'&&curves.rows.some(row=>row?.warning))$('coverage-note').textContent+=' · Some compositions have multiple supported roots; the lowest is plotted. Inspect the supplied fits.';
    const all=series.flatMap(s=>s.points.filter(Boolean));
    $('chart-empty').hidden=all.length>0;
    $('chart-empty').textContent='No supported curve points for these settings. Change the conditions, select other species, or supply broader property data.';
    $('plot-legend').innerHTML=series.map(s=>`<button class="legend-toggle" data-series="${s.id}" aria-pressed="${state.visible[s.id]!==false}"><span class="legend-line ${s.dash?'dashed':''}" style="--series-color:${s.color}"></span>${esc(s.label)}</button>`).join('')+`<span class="legend-toggle"><span class="legend-point"></span>${mode==='psat'?'Selected temperature':'Selected state'}</span>`+(all.some(p=>p.extrapolated)?'<span class="legend-toggle">Dotted = extrapolated</span>':'');
    const svg=d3.select($('phase-chart')).attr('viewBox',`0 0 ${width} ${height}`).attr('height',height);svg.selectAll('*').remove();
    svg.append('title').text(titles[mode]);svg.append('desc').text('Equilibrium boundaries are shown only over available property data. Solid bubble curve, dashed dew curve. Gaps are not connected. Numeric controls and the sampled graph table provide accessible equivalent values.');
    if(!all.length){chartContext=null;return;}
    const pressureAxis=mode!=='txy';
    const op={x:['pt','psat'].includes(mode)?T(state.T):state.binaryZ,y:mode==='txy'?T(state.T):P(state.P)};
    let xDomain=['pxy','txy'].includes(mode)?[0,1]:state.rangeMode==='custom'?[T(state.tMin),T(state.tMax)]:d3.extent(all,d=>d.x);
    let yDomain=d3.extent(all,d=>d.y);
    if(state.includeState){if(['pt','psat'].includes(mode))xDomain=d3.extent([...xDomain,op.x]);yDomain=d3.extent([...yDomain,op.y]);}
    const scaleDomain=state.verticalRange==='custom'?[state.yMin,state.yMax]:yDomain;
    let log=pressureAxis&&(state.pressureScale==='log'||state.pressureScale==='auto'&&scaleDomain[0]>0&&scaleDomain[1]/scaleDomain[0]>150);
    if(state.verticalRange==='custom'){
      if(!finite(state.yMin)||!finite(state.yMax)||state.yMin>=state.yMax||log&&state.yMin<=0){$('input-error').textContent='Custom vertical limits must increase; logarithmic pressure requires a positive minimum.';$('input-error').hidden=false;return;}
      yDomain=[state.yMin,state.yMax];
    }else if(log){const a=yDomain[0],b=yDomain[1],ratio=b/a||1;yDomain=[a/Math.max(1.2,ratio**.07),b*Math.max(1.2,ratio**.07)];}
    else{const span=yDomain[1]-yDomain[0]||Math.max(Math.abs(yDomain[0])*.1,1);yDomain=[yDomain[0]-.11*span,yDomain[1]+.11*span];if(pressureAxis)yDomain[0]=Math.max(0,yDomain[0]);}
    if(xDomain[0]===xDomain[1])xDomain=[xDomain[0]-1,xDomain[1]+1];
    const xs=d3.scaleLinear().domain(xDomain).range([5,w-5]);const ys=(log?d3.scaleLog():d3.scaleLinear()).domain(yDomain).range([h-5,5]);
    $('axis-note').textContent=(log?'Log pressure':'Linear '+(pressureAxis?'pressure':'temperature'))+' · '+all.length+' plotted values';
    const inView=op.x>=xDomain[0]&&op.x<=xDomain[1]&&(mode==='psat'||op.y>=yDomain[0]&&op.y<=yDomain[1]);$('out-of-view').hidden=inView||mode==='psat';$('out-of-view').innerHTML='The selected state is outside this fitted view. <button class="text-button" id="show-state-view">Include state in axes</button>';
    svg.append('defs').append('clipPath').attr('id','plot-clip').append('rect').attr('width',w).attr('height',h);
    const g=svg.append('g').attr('transform',`translate(${m.l},${m.t})`);
    g.append('rect').attr('data-chart-frame','').attr('width',w).attr('height',h).attr('fill','none').attr('stroke','var(--line)');
    const ticks=log?ys.ticks(5).filter(v=>{const mant=v/(10**Math.floor(Math.log10(v)));return Math.abs(mant-1)<1e-5||yDomain[1]/yDomain[0]<15&&[2,5].some(x=>Math.abs(mant-x)<1e-5);}):ys.ticks(5);
    g.append('g').call(d3.axisLeft(ys).tickValues(ticks).tickSize(-w).tickFormat('')).call(s=>s.select('.domain').remove()).selectAll('line').attr('stroke-opacity',.5);
    const xAxis=g.append('g').attr('transform',`translate(0,${h})`).call(d3.axisBottom(xs).ticks(width<420?3:6).tickPadding(9).tickSize(0).tickFormat(['pxy','txy'].includes(mode)?d3.format('.1f'):d3.format('.5~g')));
    g.append('g').call(d3.axisLeft(ys).tickValues(ticks).tickPadding(9).tickSize(0).tickFormat(v=>Math.abs(v)>=1e5?d3.format('.2~s')(v):fmt(v,3)));
    const xTitle=['pt','psat'].includes(mode)?`Temperature (${tLabel()})`:`${c[0].name} mole fraction (xA, yA)`;
    const xt=svg.append('text').attr('class','axis-title').attr('data-axis','x').attr('text-anchor','middle').attr('x',m.l+w/2).attr('y',height-12).text(xTitle);
    if(xt.node().getBBox().width>width-10)xt.text('Component A mole fraction (xA, yA)');
    svg.append('text').attr('class','axis-title').attr('data-axis','y').attr('text-anchor','middle').attr('transform',`translate(15,${m.t+h/2}) rotate(-90)`).text(mode==='txy'?`Temperature (${tLabel()})`:`Pressure (${state.pUnit})`);
    const marks=g.append('g').attr('clip-path','url(#plot-clip)');
    if(['pt','pxy','txy'].includes(mode)&&state.visible.bubble!==false&&state.visible.dew!==false){
      const bp=series.find(s=>s.id==='bubble').points,dp=series.find(s=>s.id==='dew').points;
      const bubbleSegments=splitPoints(bp),dewSegments=splitPoints(dp);
      const polygon=d3.line().x(d=>xs(d.x)).y(d=>ys(d.y)).curve(d3.curveLinearClosed);
      // The two series come from paired equilibrium rows and share each null break.
      // Close each pair along its endpoint tie lines. Binary x and y need not
      // span the same horizontal interval; no area crosses a missing fit segment.
      bubbleSegments.forEach((bubble,index)=>{
        const dew=dewSegments[index];
        if(!dew||bubble.length<2||bubble.length!==dew.length)return;
        const band=[...bubble,...dew.slice().reverse()];
        if(log&&band.some(p=>p.y<=0))return;
        marks.append('path').datum(band).attr('class','phase-band').attr('fill','var(--bubble)').attr('fill-opacity',.075).attr('d',polygon);
      });
    }
    // Never connect across a missing range, a fit switch, or an extrapolation change.
    const line=d3.line().defined(p=>p&&(!log||p.y>0)).x(p=>xs(p.x)).y(p=>ys(p.y));
    series.forEach(s=>{
      if(state.visible[s.id]===false)return;
      splitPoints(s.points).forEach(points=>{
        let start=0;
        for(let i=1;i<=points.length;i++)if(i===points.length||points[i].extrapolated!==points[start].extrapolated){const pts=points.slice(Math.max(0,start-1),i);marks.append('path').attr('data-boundary',s.id).attr('fill','none').attr('stroke',s.color).attr('stroke-width',s.id.startsWith('species')&&mode!=='psat'?1.2:2.1).attr('stroke-dasharray',points[start].extrapolated?'2 5':s.dash||null).attr('d',line(pts));start=i;}
        if(points.length===1)marks.append('circle').attr('data-singleton',s.id).attr('cx',xs(points[0].x)).attr('cy',ys(points[0].y)).attr('r',3.5).attr('fill',s.color);
      });
    });
    if(['pxy','txy'].includes(mode)&&model.flash.x&&model.flash.y){const f=model.flash;marks.append('line').attr('x1',xs(f.x[0])).attr('x2',xs(f.y[0])).attr('y1',ys(op.y)).attr('y2',ys(op.y)).attr('stroke','var(--ink)').attr('stroke-width',1.3);[f.x[0],f.y[0]].forEach(x=>marks.append('rect').attr('x',xs(x)-3).attr('y',ys(op.y)-3).attr('width',6).attr('height',6).attr('fill','var(--surface)').attr('stroke','var(--ink)'));}
    if(inView){marks.append('line').attr('x1',xs(op.x)).attr('x2',xs(op.x)).attr('y1',0).attr('y2',h).attr('stroke','var(--muted)').attr('stroke-opacity',.45).attr('stroke-dasharray','3 4');if(mode!=='psat'){marks.append('line').attr('x1',0).attr('x2',w).attr('y1',ys(op.y)).attr('y2',ys(op.y)).attr('stroke','var(--muted)').attr('stroke-opacity',.45).attr('stroke-dasharray','3 4');marks.append('circle').attr('class','operating-point').attr('cx',xs(op.x)).attr('cy',ys(op.y)).attr('r',5).attr('fill','var(--ink)').attr('stroke','var(--surface)').attr('stroke-width',2);}}
    if(mode!=='psat'){
      const bp=series[0].points,dp=series[1].points;let chosen=null;
      for(const f of [.62,.38,.8,.2]){const x=xDomain[0]+f*(xDomain[1]-xDomain[0]),a=interp(bp,x),b=interp(dp,x);if(a!==null&&b!==null&&Math.abs(xs(x)-xs(op.x))>65){chosen={x,a,b};break;}}
      if(chosen){const xx=xs(chosen.x),top=Math.min(ys(chosen.a),ys(chosen.b)),bottom=Math.max(ys(chosen.a),ys(chosen.b));const labels=[];if(top>35)labels.push([top/2,mode==='txy'?'Vapor':'Liquid']);if(h-bottom>35)labels.push([bottom+(h-bottom)/2,mode==='txy'?'Liquid':'Vapor']);if(bottom-top>28)labels.push([(top+bottom)/2,'Liquid + vapor']);labels.forEach(([y,t])=>g.append('text').attr('class','region-label').attr('x',xx).attr('y',y+4).attr('text-anchor','middle').text(t));}
    }
    const hover=g.append('g').attr('pointer-events','none');
    const overlay=g.append('rect').attr('data-chart-hit','').attr('data-chart-hover-overlay','cross-series').attr('width',w).attr('height',h).attr('fill','transparent').style('cursor','crosshair');
    let pinned=false;
    function hoverAt(event){
      const [mx,my]=d3.pointer(event,g.node()),xx=xs.invert(Math.max(5,Math.min(w-5,mx)));
      const selected=series.filter(s=>state.visible[s.id]!==false).map(s=>({...s,value:interp(s.points,xx)})).filter(s=>s.value!==null);
      hover.selectAll('line').data([xx]).join('line').attr('data-chart-hover-guide','').attr('x1',xs(xx)).attr('x2',xs(xx)).attr('y1',0).attr('y2',h).attr('stroke','var(--muted)').attr('stroke-width',1);
      hover.selectAll('circle').data(selected,d=>d.id).join('circle').attr('data-chart-hover-marker','').attr('cx',xs(xx)).attr('cy',d=>ys(d.value)).attr('r',3).attr('fill',d=>d.color);
      const tip=$('chart-tooltip');tip.innerHTML=`<div class="tooltip-title">${['pt','psat'].includes(mode)?fmt(xx,3)+' '+tLabel():esc(c[0].name)+' fraction '+fmt(xx,4)}</div>`+(selected.length?selected.map(s=>`<div class="tooltip-row"><span>${esc(s.label)}</span><span>${fmt(s.value,4)} ${mode==='txy'?tLabel():state.pUnit}</span></div>`).join(''):'No supported fit at this position.');tip.hidden=false;tip.style.left=Math.max(0,Math.min(width-tip.offsetWidth,m.l+mx+14))+'px';tip.style.top=Math.max(0,Math.min(height-tip.offsetHeight,m.t+my-70))+'px';
    }
    overlay.on('pointermove',e=>{if(!pinned)hoverAt(e);}).on('pointerleave',()=>{if(!pinned){hover.selectAll('*').remove();$('chart-tooltip').hidden=true;}}).on('click',e=>{
      const [mx,my]=d3.pointer(e,g.node()),x=xs.invert(Math.max(5,Math.min(w-5,mx))),y=ys.invert(my);
      if(['pt','psat'].includes(mode))state.T=Tc(x);else state.binaryZ=Math.max(0,Math.min(1,x));
      if(mode==='txy')state.T=Tc(y);else if(mode!=='psat')state.P=Math.max(1e-10,Pk(y));
      refresh(false);pinned=e.pointerType==='touch';
    });
    const texts=xAxis.selectAll('text').nodes();for(let i=1;i<texts.length;i++){const a=texts[i-1].getBoundingClientRect(),b=texts[i].getBoundingClientRect();if(a.right+4>b.left)texts[i].parentNode.style.display='none';}
    chartContext={xs,ys,log,xDomain,yDomain,width,height};drawNumber++;
  }
  /* LEARNING_FUNCTIONS */
  /* INTERACTIONS */
})();
