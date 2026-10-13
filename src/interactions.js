  function schedule(){clearTimeout(updateTimer);updateTimer=setTimeout(()=>refresh(),90);}
  function changed(){state.example='custom';cacheKey='';}
  function showPanel(panel,scroll=false){state.panel=panel;syncControls();persist();if(scroll)$('learning-heading').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  function numeric(id,fn){$(id).addEventListener('input',e=>{fn(e.target.value===''?NaN:Number(e.target.value));schedule();});$(id).addEventListener('change',()=>refresh());}
  numeric('temperature',v=>state.T=Tc(v));numeric('pressure',v=>state.P=Pk(v));numeric('feed-moles',v=>state.totalMoles=v);
  numeric('binary-z',v=>state.binaryZ=v);numeric('t-min',v=>{state.tMin=Tc(v);cacheKey='';});numeric('t-max',v=>{state.tMax=Tc(v);cacheKey='';});numeric('y-min',v=>state.yMin=v);numeric('y-max',v=>state.yMax=v);
  $('problem-title').addEventListener('input',e=>{state.title=e.target.value;persist();});
  $('temperature-slider').addEventListener('input',e=>{state.T=Tc(+e.target.value);refresh();});
  $('pressure-slider').addEventListener('input',e=>{const a=+e.target.dataset.min,b=+e.target.dataset.max;state.P=a*(b/a)**(+e.target.value/1000);refresh();});
  $('binary-slider').addEventListener('input',e=>{state.binaryZ=+e.target.value;refresh();});
  for(const [id,key] of [['range-mode','rangeMode'],['pressure-scale','pressureScale'],['vertical-range','verticalRange'],['calculation','calculation']])$(id).addEventListener('change',e=>{state[key]=e.target.value;refresh();});
  $('samples').addEventListener('change',e=>{state.samples=+e.target.value;refresh();});
  for(const [id,key] of [['include-state','includeState'],['show-pure','showPure'],['extrapolate','extrapolate']])$(id).addEventListener('change',e=>{state[key]=e.target.checked;refresh();});
  for(const [id,key] of [['temperature-unit','tUnit'],['pressure-unit','pUnit']])$(id).addEventListener('change',e=>{state[key]=e.target.value;state.verticalRange='auto';refresh();});
  for(const [id,key] of [['pair-a','pairA'],['pair-b','pairB']])$(id).addEventListener('change',e=>{state[key]=+e.target.value;refresh();});
  $('basis').addEventListener('change',e=>{if(e.target.value==='fraction'){const z=normalize(state.components.map(c=>c.amount));state.components.forEach((c,i)=>c.amount=z[i]);}state.basis=e.target.value;renderMixture();refresh();});
  $('example').addEventListener('change',e=>{if(e.target.value==='custom'){state.example='custom';persist();}else applyExample(e.target.value);});
  $('normalize').addEventListener('click',()=>{const a=state.components.map(c=>c.amount);if(a.some(v=>!finite(v)||v<0)||sum(a)<=0){notify('Enter nonnegative amounts with a positive sum.');return;}const z=normalize(a);state.components.forEach((c,i)=>c.amount=z[i]);changed();renderMixture();refresh();});
  $('mixture-rows').addEventListener('input',e=>{if(e.target.dataset.amount!==undefined){state.components[+e.target.dataset.amount].amount=e.target.value===''?NaN:+e.target.value;changed();schedule();}});
  $('add-species').addEventListener('click',()=>{if(state.components.length>=12)return;const id=$('new-species').value;if(id==='custom'){editSpecies(state.components.length,true);return;}state.components.push({...species(id),amount:0});if(state.components.length===2)state.pairB=1;changed();renderMixture();refresh();});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.mode){state.mode=b.dataset.mode;state.verticalRange='auto';state.visible={};state.rows=12;refresh();}
    if(b.dataset.panel)showPanel(b.dataset.panel,!b.classList.contains('learning-tab'));
    if(b.dataset.edit!==undefined)editSpecies(+b.dataset.edit);
    if(b.dataset.remove!==undefined&&state.components.length>1){state.components.splice(+b.dataset.remove,1);if(state.basis==='fraction'){const z=normalize(state.components.map(c=>c.amount));state.components.forEach((c,i)=>c.amount=z[i]);}state.pairA=0;state.pairB=state.components.length>1?1:0;if(state.components.length===1&&['pxy','txy'].includes(state.mode))state.mode='pt';changed();renderMixture();refresh();}
    if(b.dataset.series){state.visible[b.dataset.series]=state.visible[b.dataset.series]===false;drawChart();persist();}
    if(b.dataset.calculation){state.calculation=b.dataset.calculation;showPanel('steps',true);renderWorked();syncControls();}
    if(b.dataset.boundary&&model){const k=b.dataset.boundary;if(k==='bp')state.P=model.ev.bubblePressure;if(k==='dp')state.P=model.ev.dewPressure;if(k==='bt'&&model.bt.ok)state.T=model.bt.temperatureC;if(k==='dt'&&model.dt.ok)state.T=model.dt.temperatureC;state.calculation=k;refresh();}
    if(b.id==='show-state-view'){state.includeState=true;refresh();}
    if(b.dataset.sample!==undefined&&curves){const r=curves.rows[+b.dataset.sample];if(r){if(finite(r.T))state.T=r.T;if(['pxy','txy'].includes(state.mode)){state.binaryZ=r.x;state.P=r.P;}else if(state.mode==='pt')state.P=r.bubblePressure;state.calculation=state.mode==='psat'?'sat':'bp';state.inspectedSpecies=state.mode==='psat'?r.species:null;refresh();showPanel('steps',true);}}
    if(b.dataset.fitUp!==undefined){const i=+b.dataset.fitUp;if(i>0)[editorDraft.fits[i-1],editorDraft.fits[i]]=[editorDraft.fits[i],editorDraft.fits[i-1]];renderFitEditors();}
    if(b.dataset.fitRemove!==undefined&&editorDraft.fits.length>1){editorDraft.fits.splice(+b.dataset.fitRemove,1);renderFitEditors();}
  });
  $('fit-view').addEventListener('click',()=>{state.rangeMode='auto';state.verticalRange='auto';state.extrapolate=false;state.includeState=false;state.visible={};refresh();notify('All supported boundaries are fitted to the plot.');});
  $('plot-options').addEventListener('click',()=>{const hide=!$('plot-settings').hidden;$('plot-settings').hidden=hide;$('plot-options').setAttribute('aria-expanded',String(!hide));});
  $('theme-button').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';syncControls();drawChart();persist();});
  $('fit-editors').addEventListener('input',e=>{if(e.target.dataset.fit!==undefined){const f=editorDraft.fits[+e.target.dataset.fit],key=e.target.dataset.key;f[key]=e.target.type==='number'?(e.target.value===''?null:+e.target.value):e.target.value;if(!editorDraft.sourceLabel?.startsWith('User-edited'))editorDraft.sourceLabel='User-edited property data (started from '+(editorDraft.sourceLabel||'custom data')+')';}});
  $('add-fit').addEventListener('click',()=>{if(editorDraft.fits.length>=15){notify('A species can have up to 15 fits.');return;}editorDraft.fits.push({A:null,B:null,C:null,tUnit:'C',pUnit:'mmHg',logBase:'10',minC:0,maxC:100});renderFitEditors();});
  for(const id of ['close-species','cancel-species'])$(id).addEventListener('click',()=>$('species-dialog').close());
  $('species-form').addEventListener('submit',e=>{e.preventDefault();editorDraft.name=$('species-name').value.trim();editorDraft.formula=$('species-formula').value.trim();editorDraft.notes=$('species-notes').value;const valid=VLE.validate([editorDraft],[1]);if(!editorDraft.name||!valid.ok){$('species-error').textContent=editorDraft.name?valid.errors.join(' '):'Enter a species name.';$('species-error').hidden=false;return;}editorDraft.amount=editorIndex<state.components.length?state.components[editorIndex].amount:0;state.components[editorIndex]=clone(editorDraft);if(state.components.length===2&&state.pairA===state.pairB)state.pairB=1;$('species-dialog').close();changed();renderMixture();refresh();});
  $('save-problem').addEventListener('click',()=>{try{validateSaved(state);download(JSON.stringify(state,null,2),'application/json',filename()+'.json');notify('Problem saved with its species data and plot settings.');}catch(e){notify('Fix the inputs before saving: '+e.message);}});
  $('load-problem').addEventListener('click',()=>$('problem-file').click());
  $('problem-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>2000000)throw Error('Choose a problem file smaller than 2 MB.');const next=validateSaved(JSON.parse(await file.text()));state=next;cacheKey='';renderMixture();refresh();notify('Problem opened.');}catch(err){notify('Could not open problem: '+err.message);}e.target.value='';});
  $('download-svg').addEventListener('click',()=>{if(!chartContext){notify('Draw a supported graph first.');return;}const original=$('phase-chart'),copy=original.cloneNode(true),a=[original,...original.querySelectorAll('*')],b=[copy,...copy.querySelectorAll('*')];a.forEach((n,i)=>{const st=getComputedStyle(n);for(const k of ['fill','stroke','font-family','font-size','font-weight','color'])b[i].style.setProperty(k,st.getPropertyValue(k));});copy.querySelectorAll('[data-chart-hover-overlay],[data-chart-hover-guide],[data-chart-hover-marker]').forEach(n=>n.remove());copy.setAttribute('xmlns','http://www.w3.org/2000/svg');const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('width','100%');rect.setAttribute('height','100%');rect.setAttribute('fill',getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());copy.insertBefore(rect,copy.firstChild);download(new XMLSerializer().serializeToString(copy),'image/svg+xml',filename()+'-'+state.mode+'.svg');});
  $('download-csv').addEventListener('click',()=>exportGraphCSV());
  $('more-rows').addEventListener('click',()=>{state.rows+=24;renderGraphData();});
  $('print-solution').addEventListener('click',()=>window.print());
  let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>drawChart(),80);}).observe($('chart-wrap'));
  renderMixture();refresh();
