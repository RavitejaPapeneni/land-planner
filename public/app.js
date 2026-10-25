// Land Planner MVP — all data fetched live from free open APIs; rules are labelled general guidance.
const $=s=>document.querySelector(s), R=$('#report');
const map=L.map('map').setView([17.385,78.4867],4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
let pin=null;
map.on('click',e=>{$('#q').value=e.latlng.lat.toFixed(5)+', '+e.latlng.lng.toFixed(5);setPin(e.latlng.lat,e.latlng.lng)});
function setPin(a,b){if(pin)pin.remove();pin=L.marker([a,b]).addTo(map);map.setView([a,b],13)}
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DIRS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const dir=d=>DIRS[Math.round(((d%360)+360)%360/22.5)%16];
const f=(x,n=1)=>Number(x).toLocaleString(undefined,{maximumFractionDigits:n,minimumFractionDigits:0});
const na=(t,e)=>`<section class="card"><h2>${t}</h2><p class="na">Unavailable — the data source did not respond (${e}). Try again later.</p></section>`;
async function J(u,ms=45000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}
$('#go').onclick=run; $('#q').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
const P=new URLSearchParams(location.search);
if(P.get('q')){$('#q').value=P.get('q');if(P.get('size'))$('#size').value=P.get('size');if(P.get('unit'))$('#unit').value=P.get('unit');run()}

async function geocode(q){
  const m=q.match(/^\s*(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)\s*$/);
  if(m)return{lat:+m[1],lon:+m[3],name:`${m[1]}, ${m[3]}`};
  const r=await J('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q));
  if(!r.length)throw new Error('place not found');return{lat:+r[0].lat,lon:+r[0].lon,name:r[0].display_name};
}
async function run(){
  R.innerHTML='';const st=$('#status');const q=$('#q').value.trim();if(!q){st.textContent='Enter a place or click the map.';return}
  const size=+$('#size').value,unit=$('#unit').value;if(!(size>0)){st.textContent='Enter a plot size.';return}
  const sqft=unit==='acre'?size*43560:size, m2=sqft*0.09290304;
  st.textContent='Finding the place…';let g;
  try{g=await geocode(q)}catch(e){st.textContent='Geocoding failed: '+e.message;return}
  setPin(g.lat,g.lon);st.textContent='Fetching climate, terrain, soil and species data (soil can take ~30 s)…';
  const yr=new Date().getFullYear()-1;
  const [cl,el,so,sp]=await Promise.allSettled([climate(g,yr),terrain(g),soil(g),species(g)]);
  st.textContent='';
  const C=cl.value,T=el.value,S=so.value;
  let h=`<section class="card"><h2>Site</h2><div class="grid">
   <div class="k">Location<b>${g.name.split(',').slice(0,3).join(',')}</b>${f(g.lat,4)}, ${f(g.lon,4)}</div>
   <div class="k">Plot area<b>${f(sqft,0)} sq ft</b>= ${f(m2,0)} m² = ${f(sqft/43560,3)} acres</div>
   ${T?`<div class="k">Elevation<b>${f(T.z0,0)} m</b>Open-Meteo Elevation</div>`:''}
   ${C?`<div class="k">Climate type<b>${C.type.label}</b>${f(C.P,0)} mm/yr, mean ${f(C.Tm)} °C (${yr})</div>`:''}</div></section>`;
  h+=sun(g.lat);
  h+=C?climateHTML(C,yr):na('Climate',cl.reason?.message);
  h+=sectors(g,C,T,el.reason);
  h+=zones(sqft,m2,C,T,g.lat);
  h+=S?soilHTML(S):na('Soil',so.reason?.message);
  h+=C?plants(C,g.lat):na('Plants & planting calendar','needs climate data');
  h+=pond(m2,C,S,T);
  h+=house(g.lat,C);
  h+=sp.status==='fulfilled'?speciesHTML(sp.value):na('Species recorded nearby',sp.reason?.message);
  R.innerHTML=h;
}
// ---------- Climate ----------
async function climate(g,yr){
  const d=(await J(`https://archive-api.open-meteo.com/v1/archive?latitude=${g.lat}&longitude=${g.lon}&start_date=${yr}-01-01&end_date=${yr}-12-31&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum,wind_direction_10m_dominant,wind_speed_10m_max&timezone=auto`)).daily;
  const M=MON.map(()=>({t:[],tn:[],tx:[],p:0,u:0,v:0,ws:[]}));
  d.time.forEach((t,i)=>{const m=M[+t.slice(5,7)-1];const ws=d.wind_speed_10m_max[i],wd=d.wind_direction_10m_dominant[i];
    if(d.temperature_2m_mean[i]!=null)m.t.push(d.temperature_2m_mean[i]);if(d.temperature_2m_min[i]!=null)m.tn.push(d.temperature_2m_min[i]);if(d.temperature_2m_max[i]!=null)m.tx.push(d.temperature_2m_max[i]);
    m.p+=d.precipitation_sum[i]||0;if(ws!=null&&wd!=null){m.ws.push(ws);m.u+=ws*Math.sin(wd*Math.PI/180);m.v+=ws*Math.cos(wd*Math.PI/180)}});
  const avg=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
  const mon=M.map(m=>({t:avg(m.t),tn:Math.min(...m.tn),tx:Math.max(...m.tx),p:m.p,ws:avg(m.ws),wd:(Math.atan2(m.u,m.v)*180/Math.PI+360)%360}));
  let U=0,V=0;M.forEach(m=>{U+=m.u;V+=m.v});
  const P=mon.reduce((a,m)=>a+m.p,0),Tm=avg(mon.map(m=>m.t)),Tc=Math.min(...mon.map(m=>m.t)),Th=Math.max(...mon.map(m=>m.t));
  const wet=mon.map((m,i)=>m.p>=60?i:-1).filter(i=>i>=0);
  return{mon,P,Tm,Tc,Th,wet,wind:(Math.atan2(U,V)*180/Math.PI+360)%360,type:ctype(P,Tm,Tc)};
}
function ctype(P,Tm,Tc){ // simplified Köppen-style rules (shown on page)
  const dryT=20*Tm+140; // Köppen aridity threshold (mm), mid-season rain
  if(P<dryT/2)return{k:'arid',label:'Arid (desert)'};
  if(P<dryT)return{k:'semiarid',label:Tc>=18?'Semi-arid tropical':'Semi-arid'};
  if(Tc>=18)return P>=1500?{k:'tropwet',label:'Tropical wet'}:{k:'tropdry',label:'Tropical wet-dry (savanna)'};
  if(Tc>-3)return{k:'temperate',label:'Temperate'};
  return{k:'cold',label:'Cold / continental'};
}
function climateHTML(C,yr){
  const mx=Math.max(...C.mon.map(m=>m.p),1);
  const bars=C.mon.map((m,i)=>`<rect x="${i*40+10}" y="${150-m.p/mx*120}" width="28" height="${m.p/mx*120}" fill="#4a90c2"/><text x="${i*40+24}" y="166" font-size="11" text-anchor="middle">${MON[i]}</text><text x="${i*40+24}" y="${145-m.p/mx*120}" font-size="10" text-anchor="middle">${f(m.p,0)}</text>`).join('');
  return`<section class="card"><h2>Climate (${yr})</h2><p>Annual rainfall <b>${f(C.P,0)} mm</b>; mean temperature <b>${f(C.Tm)} °C</b> (coolest month ${f(C.Tc)} °C, warmest ${f(C.Th)} °C). Wet months (≥60 mm): <b>${C.wet.map(i=>MON[i]).join(', ')||'none'}</b>. Year-round prevailing wind (speed-weighted vector mean of daily dominant direction): <b>from ${dir(C.wind)} (${f(C.wind,0)}°)</b>.</p>
  <svg viewBox="0 0 490 172" width="100%">${bars}</svg><p class="src">Monthly rainfall, mm</p>
  <table><tr><th>Month</th>${MON.map(m=>`<th>${m}</th>`).join('')}</tr>
  <tr><td>Mean °C</td>${C.mon.map(m=>`<td>${f(m.t)}</td>`).join('')}</tr>
  <tr><td>Min / max °C</td>${C.mon.map(m=>`<td>${f(m.tn,0)}/${f(m.tx,0)}</td>`).join('')}</tr>
  <tr><td>Rain mm</td>${C.mon.map(m=>`<td>${f(m.p,0)}</td>`).join('')}</tr>
  <tr><td>Wind from</td>${C.mon.map(m=>`<td>${dir(m.wd)}</td>`).join('')}</tr>
  <tr><td>Max wind km/h (avg)</td>${C.mon.map(m=>`<td>${f(m.ws,0)}</td>`).join('')}</tr></table>
  <p class="src">Source: Open-Meteo Historical Weather API (ERA5 reanalysis), daily values for ${yr} aggregated by month. Climate type rule: Köppen aridity threshold 20×T̄+140 mm; tropical if coolest month ≥18 °C.</p></section>`;
}
// ---------- Sun ----------
function sun(lat){
  const r=Math.PI/180,rows=[['June solstice',23.44],['Equinoxes',0],['December solstice',-23.44]].map(([n,dc])=>{
    const noon=90-Math.abs(lat-dc), side=lat-dc>0?'south':lat-dc<0?'north':'overhead';
    let ch=-Math.tan(lat*r)*Math.tan(dc*r);ch=Math.max(-1,Math.min(1,ch));const day=2*Math.acos(ch)/r/15;
    let ca=Math.sin(dc*r)/Math.cos(lat*r);ca=Math.max(-1,Math.min(1,ca));const az=Math.acos(ca)/r;
    return`<tr><td>${n}</td><td>${f(noon)}° to the ${side}</td><td>${f(az,0)}° (${dir(az)})</td><td>${f(360-az,0)}° (${dir(360-az)})</td><td>${f(day)} h</td></tr>`}).join('');
  return`<section class="card"><h2>Sun sector</h2><table><tr><th>Date</th><th>Noon sun height</th><th>Sunrise azimuth</th><th>Sunset azimuth</th><th>Day length</th></tr>${rows}</table>
  <p>${Math.abs(lat)<23.44?'You are inside the tropics: the midday sun passes overhead twice a year and stands to the north part of the year. East and west walls get the harshest sun — shade them.':`The winter sun stays low in the ${lat>0?'south':'north'}; keep that side open for winter sun and plant tall trees on the ${lat>0?'north':'south'} and west.`}</p>
  <p class="src">Formula: noon height = 90° − |latitude − declination|; sunrise azimuth = arccos(sin δ / cos φ); day length = 2·arccos(−tan φ·tan δ)/15 h (no refraction).</p></section>`;
}
// ---------- Terrain ----------
async function terrain(g){
  const d=0.0009,la=[],lo=[];for(const i of[-1,0,1])for(const j of[-1,0,1]){la.push((g.lat+i*d).toFixed(6));lo.push((g.lon+j*d).toFixed(6))}
  const z=(await J(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${lo}`)).elevation;
  const dy=d*111320,dx=d*111320*Math.cos(g.lat*Math.PI/180);
  const gx=((z[2]+2*z[5]+z[8])-(z[0]+2*z[3]+z[6]))/(8*dx); // east gradient (Sobel)
  const gy=((z[6]+2*z[7]+z[8])-(z[0]+2*z[1]+z[2]))/(8*dy); // north gradient
  const s=Math.hypot(gx,gy)*100,asp=(Math.atan2(-gx,-gy)*180/Math.PI+360)%360;
  return{z,z0:z[4],slope:s,aspect:asp,dx,dy};
}
function sectors(g,C,T,err){
  return`<section class="card"><h2>Sectors: wind, water and slope</h2>
  ${C?`<p><b>Wind:</b> prevailing from ${dir(C.wind)} (${f(C.wind,0)}°). Put a windbreak / hedge on that side if winds are hot or strong${C.type.k.startsWith('trop')||C.type.k==='semiarid'?', and open the house to it for cooling breeze':''}.</p>`:'<p class="na">Wind unavailable (climate source failed).</p>'}
  ${T?`<p><b>Slope:</b> ${f(T.slope)}% (${f(Math.atan(T.slope/100)*180/Math.PI)}°), falling towards <b>${dir(T.aspect)}</b> (${f(T.aspect,0)}°). <b>Water flows</b> towards the ${dir(T.aspect)}: put the pond / swales on the downhill ${dir(T.aspect)} side, swales on contour (across the ${dir((T.aspect+90)%360)}–${dir((T.aspect+270)%360)} line).
   ${T.slope<1?' Nearly flat: water will pond rather than run — use raised beds and small basins.':T.slope>15?' Steep: terrace, avoid digging large ponds.':''}</p>
   <p class="src">Elevations (m), 3×3 grid at ~100 m spacing (N row first): ${[T.z.slice(6),T.z.slice(3,6),T.z.slice(0,3)].map(r=>r.join(' · ')).join(' / ')}. Slope by Sobel gradient: √(gx²+gy²)×100; source Open-Meteo Elevation API (Copernicus DEM 90 m — sub-plot detail needs a site survey).</p>`:`<p class="na">Slope unavailable (${err?.message||'elevation source failed'}).</p>`}</section>`;
}
// ---------- Zones ----------
function zones(sqft,m2,C,T,lat){
  const Z=[['0','House & yard',.05,'#c9a66b'],['1','Kitchen garden, herbs',.10,'#7fbf5f'],['2','Orchard, small livestock',.15,'#a3d17c'],['3','Main crops, food forest',.30,'#c7e3a0'],['4','Managed woodland, fodder',.20,'#dfeec9'],['5','Wild / native area',.20,'#f2f7ea']];
  let cum=1,svg='';const S=300;
  for(let i=Z.length-1;i>=0;i--){const s=Math.sqrt(cum)*S;svg+=`<rect x="10" y="${10+S-s}" width="${s}" height="${s}" fill="${Z[i][3]}" stroke="#556"/>`;cum-=Z[i][2]}
  cum=0;Z.forEach(z=>{cum+=z[2];const s=Math.sqrt(cum)*S;svg+=`<text x="${10+s-4}" y="${10+S-s+14}" font-size="12" text-anchor="end">Z${z[0]}</text>`});
  const arrow=(deg,label,col,cx=420,cy=160)=>{const r=deg*Math.PI/180,x=cx+Math.sin(r)*55,y=cy-Math.cos(r)*55;return`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${col}" stroke-width="3" marker-end="url(#a)"/><text x="${cx+Math.sin(r)*75}" y="${cy-Math.cos(r)*75+4}" font-size="11" text-anchor="middle" fill="${col}">${label}</text>`};
  let ar=arrow(0,'N','#000');if(C)ar+=arrow((C.wind+180)%360,'wind','#2a6fb0');if(T)ar+=arrow(T.aspect,'downhill','#0a8');ar+=arrow(lat>=0?180:0,'winter sun','#d80');
  const rows=Z.map(z=>`<tr><td>Zone ${z[0]}</td><td>${z[1]}</td><td>${z[2]*100}%</td><td>${f(sqft*z[2],0)} sq ft</td><td>${f(m2*z[2],0)} m²</td></tr>`).join('');
  return`<section class="card"><h2>Zones 0–5</h2><svg viewBox="0 0 520 320" width="100%"><defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="context-stroke"/></marker></defs>${svg}${ar}</svg>
  <table><tr><th>Zone</th><th>Use</th><th>Share</th><th>Area</th><th></th></tr>${rows}</table>
  <p>Place Zone 0 (house) on the ${T?`uphill side (away from ${dir(T.aspect)})`:'higher ground'}, so water and nutrients flow down through the zones.${sqft<20000?' On a small plot, zones 4–5 shrink to a hedge and a wildlife corner.':''}</p>
  <p class="src">Zone shares are a planning assumption (shown), multiplied by your plot area. Diagram is schematic, not to scale with your boundary.</p></section>`;
}
// ---------- Soil ----------
async function soil(g){
  const r=await J(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${g.lon}&lat=${g.lat}&property=clay&property=sand&property=silt&property=phh2o&property=soc&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`,60000);
  const o={};r.properties.layers.forEach(L=>{const v=L.depths.map(d=>d.values.mean).filter(x=>x!=null);o[L.name]=v.length?v.reduce((a,b)=>a+b,0)/v.length/L.unit_measure.d_factor:null});
  if(o.clay==null)throw new Error('no soil data at this point (water/urban?)');
  return o;
}
function texture(c,s,si){if(c>=40)return si>=40?'silty clay':s>45?'sandy clay':'clay';if(c>=27)return s>45?'sandy clay loam':si>=40?'silty clay loam':'clay loam';if(c>=20&&s>45)return'sandy clay loam';if(s>=85)return'sand';if(s>=70)return'loamy sand';if(s>52)return'sandy loam';if(si>=50)return'silt loam';return'loam'}
function soilHTML(S){const t=texture(S.clay,S.sand,S.silt);
  return`<section class="card"><h2>Soil (top 30 cm)</h2><div class="grid"><div class="k">Texture<b>${t}</b>clay ${f(S.clay)}% · sand ${f(S.sand)}% · silt ${f(S.silt)}%</div><div class="k">pH (water)<b>${f(S.phh2o)}</b>${S.phh2o<5.5?'acidic — add wood ash/lime':S.phh2o>7.8?'alkaline — add compost, mulch':'good for most crops'}</div><div class="k">Organic carbon<b>${f(S.soc)} g/kg</b>${S.soc<10?'low — mulch, compost, cover crops':'moderate/good'}</div></div>
  <p class="src">Source: ISRIC SoilGrids v2.0 (250 m modelled estimate), mean of 0–5, 5–15, 15–30 cm. Texture by USDA triangle (simplified). Test your actual soil before building.</p></section>`}
// ---------- Plants ----------
const PL={ // [name, season key]; keys: rains, prerain, cool, dry, spring, autumn
 tropdry:[['Neem (Azadirachta indica)','rains'],['Tamarind','rains'],['Jamun (Syzygium cumini)','rains'],['Amla / Indian gooseberry','rains'],['Moringa / drumstick','prerain'],['Custard apple','rains'],['Ber (Ziziphus mauritiana)','rains'],['Pongamia (Karanj)','rains'],['Bael','rains'],['Curry leaf','rains'],['Mango','rains'],['Pigeon pea (toor dal)','rains'],['Finger millet (ragi)','rains'],['Sorghum (jowar)','rains'],['Chickpea','cool'],['Tulsi (holy basil)','prerain'],['Lemongrass','rains'],['Vetiver (on contours)','rains']],
 semiarid:[['Neem (Azadirachta indica)','rains'],['Ber (Ziziphus)','rains'],['Khejri (Prosopis cineraria)','rains'],['Tamarind','rains'],['Custard apple','rains'],['Amla','rains'],['Pomegranate','rains'],['Moringa','prerain'],['Pongamia','rains'],['Pearl millet (bajra)','rains'],['Sorghum','rains'],['Horse gram','rains'],['Pigeon pea','rains'],['Aloe vera','prerain'],['Vetiver (on contours)','rains'],['Chickpea','cool']],
 arid:[['Date palm','dry'],['Khejri / mesquite-type native legume','rains'],['Acacia (native spp.)','rains'],['Jujube (Ziziphus)','rains'],['Fig','cool'],['Pomegranate','cool'],['Olive','cool'],['Prickly pear','dry'],['Moringa','prerain'],['Saltbush','rains'],['Pearl millet','rains'],['Cluster bean (guar)','rains'],['Aloe','cool']],
 tropwet:[['Coconut','rains'],['Jackfruit','rains'],['Banana','rains'],['Breadfruit','rains'],['Mango','rains'],['Cacao (shade)','rains'],['Black pepper (on trees)','rains'],['Turmeric','prerain'],['Ginger','prerain'],['Taro','rains'],['Papaya','prerain'],['Bamboo','rains'],['Moringa','dry'],['Gliricidia (nitrogen/fodder)','rains'],['Pineapple','rains'],['Sweet potato','rains']],
 temperate:[['Oak (native spp.)','autumn'],['Apple','autumn'],['Pear','autumn'],['Plum','autumn'],['Hazelnut','autumn'],['Walnut','autumn'],['Elderberry','autumn'],['Currant / gooseberry','autumn'],['Raspberry','autumn'],['Comfrey','spring'],['Garlic','autumn'],['Potato','spring'],['Beans','spring'],['Squash','spring'],['Kale','spring'],['Clover (cover crop)','spring']],
 cold:[['Birch','autumn'],['Hardy apple','spring'],['Sea buckthorn','spring'],['Serviceberry','autumn'],['Haskap','spring'],['Currants','autumn'],['Rhubarb','spring'],['Potato','spring'],['Peas','spring'],['Kale','spring'],['Garlic','autumn'],['Rye (cover crop)','autumn']]};
function plants(C,lat){
  const k=C.type.k,list=PL[k],wet=C.wet,N=lat>=0,M=C.mon;
  const order=M.map((m,i)=>i);const cool=[...order].sort((a,b)=>M[a].t-M[b].t).slice(0,3).sort((a,b)=>a-b);
  const dry=[...order].sort((a,b)=>M[a].p-M[b].p).slice(0,3).sort((a,b)=>a-b);
  const first=wet.length?(wet.find(i=>!wet.includes((i+11)%12))??wet[0]):null;
  const S={rains:first!=null?`${MON[first]}–${MON[(first+1)%12]} (start of rains)`:'when irrigation is available',prerain:first!=null?`${MON[(first+11)%12]}–${MON[first]} (just before rains)`:'early warm season',
    cool:`${MON[cool[0]]}–${MON[cool[2]]} (coolest months)`,dry:`${MON[dry[0]]}–${MON[dry[2]]} (driest months, with water)`,spring:N?'Mar–May (spring, after frost)':'Sep–Nov (spring, after frost)',autumn:N?'Oct–Nov (autumn)':'Apr–May (autumn)'};
  return`<section class="card"><h2>Plants & planting calendar</h2><p>Climate type <b>${C.type.label}</b>. ${list.length} suggestions:</p>
  <table><tr><th>#</th><th>Plant</th><th>When to plant here</th></tr>${list.map((p,i)=>`<tr><td>${i+1}</td><td>${p[0]}</td><td>${S[p[1]]}</td></tr>`).join('')}</table>
  <p class="src">General guidance from a built-in rule set for this climate type (South-Asian examples for tropical/semi-arid); planting months are derived from your site's climate data (first wet month ≥60 mm, coolest/driest months). Confirm local nativeness with the GBIF list below and local nurseries.</p></section>`}
// ---------- Pond ----------
function pond(m2,C,S,T){
  if(!C)return na('Pond feasibility','needs rainfall data');
  const vol=m2*C.P/1000,run=vol*0.3;let pts=[],score=0;
  if(C.P>=600){pts.push(`✔ Rainfall ${f(C.P,0)} mm/yr is enough to fill a pond in the wet season.`);score++}else pts.push(`✖ Rainfall ${f(C.P,0)} mm/yr is low — a pond needs a large catchment or a liner and will dry in summer.`);
  if(S){if(S.clay>=20){pts.push(`✔ Clay ${f(S.clay)}%: the soil can likely seal with compaction.`);score++}else if(S.clay>=10)pts.push(`~ Clay ${f(S.clay)}%: add clay/bentonite or compact well; test with a soak pit.`);else pts.push(`✖ Clay ${f(S.clay)}%: sandy — needs a liner.`)}else pts.push('? Soil unavailable — do a soak test.');
  if(T){if(T.slope>=0.5&&T.slope<=8){pts.push(`✔ Slope ${f(T.slope)}%: gentle, good for a pond fed by a swale.`);score++}else if(T.slope<0.5)pts.push(`~ Slope ${f(T.slope)}%: flat — dig the pond at the lowest spot and guide roof/path runoff in.`);else pts.push(`✖ Slope ${f(T.slope)}%: steep — build small check-dam ponds only.`)}
  const verdict=['Difficult','Possible with work','Good','Very good'][score];
  return`<section class="card"><h2>Pond feasibility: ${verdict}</h2><ul>${pts.map(p=>`<li>${p}</li>`).join('')}</ul>
  <p>Rain falling on the plot per year: <b>${f(vol,0)} m³</b> (${f(vol*1000,0)} litres) = area ${f(m2,0)} m² × ${f(C.P,0)} mm ÷ 1000.<br>Likely runoff you can catch (assumed runoff coefficient 0.3): <b>${f(run,0)} m³</b>. A pond 1.5 m deep holding that would be about <b>${f(run/1.5,0)} m²</b> (${f(run/1.5/0.0929,0)} sq ft)${run/1.5>m2*0.1?' — larger than practical, so size it to ~10% of the plot and let the rest recharge groundwater':''}. Put it ${T?`on the ${dir(T.aspect)} (downhill) side`:'at the lowest point'}.</p>
  <p class="src">Inputs: Open-Meteo rainfall, SoilGrids clay, Open-Meteo slope. Thresholds (600 mm, 20% clay, 0.5–8% slope) and 0.3 runoff are rule-of-thumb assumptions.</p></section>`}
// ---------- House ----------
function house(lat,C){
  const eq=lat>=0?'south':'north',k=C?.type.k;
  const cool=!k?'':k.startsWith('trop')||k==='semiarid'||k==='arid'?`Natural cooling: central courtyard, thick earth/stone walls (rammed earth, compressed earth blocks, laterite), jaali screens, deep verandas, lime plaster, high ceilings with vents, and windows on opposite sides aligned with the ${C?'breeze from '+dir(C.wind):'prevailing breeze'} for cross-ventilation. Local materials: earth, stone, lime, bamboo.${k==='tropwet'?' In this wet climate, raise the floor and use wide roof overhangs.':''}`:`Natural heating: ${eq}-facing windows for winter sun, thermal mass (earth, stone) inside, insulation and a windbreak against the ${C?dir(C.wind):'prevailing'} wind; overhangs to shade summer sun.`;
  return`<section class="card"><h2>House orientation & natural cooling (short note)</h2><p>Orient the long side east–west so the long walls face ${eq} and ${eq==='south'?'north':'south'}; keep east and west walls short and shaded. ${cool}</p><p class="src">General guidance by climate type. Photo reading and full house design are planned for phase 2.</p></section>`}
// ---------- Species ----------
async function species(g){
  const q=k=>J(`https://api.gbif.org/v1/occurrence/search?geoDistance=${g.lat},${g.lon},10km&${k}&hasCoordinate=true&occurrenceStatus=PRESENT&limit=300`);
  const [p,b,m]=await Promise.all([q('kingdomKey=6'),q('classKey=212'),q('classKey=359')]);
  const top=r=>{const c={};r.results.forEach(o=>{if(o.species){const n=o.species+(o.vernacularName?` (${o.vernacularName})`:'');c[o.species]=c[o.species]||{n:o.species,v:o.vernacularName,c:0};c[o.species].c++}});return{total:r.count,list:Object.values(c).sort((a,b)=>b.c-a.c).slice(0,15)}};
  return{plants:top(p),birds:top(b),mammals:top(m)};
}
function speciesHTML(S){const col=(t,x)=>`<div><h3>${t}</h3><p class="src">${f(x.total,0)} records within 10 km; top by count in latest 300</p><ol>${x.list.map(s=>`<li><i>${s.n}</i>${s.v?' – '+s.v:''} <span class="src">(${s.c})</span></li>`).join('')||'<li class="na">none recorded</li>'}</ol></div>`;
  return`<section class="card"><h2>Species recorded nearby</h2><div class="grid">${col('Plants',S.plants)}${col('Birds',S.birds)}${col('Mammals',S.mammals)}</div>
  <p class="src">Source: GBIF.org occurrence API. These are <b>recorded nearby</b> (including garden/planted and introduced species), <b>not guaranteed native</b>.</p></section>`}
