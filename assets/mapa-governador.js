"use strict";
// CMG - mapa eleitoral por UF, municipio e zona. Fonte exclusiva de votos: TSE.
const UF={AC:"Acre",AL:"Alagoas",AP:"Amapá",AM:"Amazonas",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MT:"Mato Grosso",MS:"Mato Grosso do Sul",MG:"Minas Gerais",PA:"Pará",PB:"Paraíba",PR:"Paraná",PE:"Pernambuco",PI:"Piauí",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RS:"Rio Grande do Sul",RO:"Rondônia",RR:"Roraima",SC:"Santa Catarina",SP:"São Paulo",SE:"Sergipe",TO:"Tocantins"};
const UFS=Object.keys(UF),TSE_ROOT="https://resultados.tse.jus.br/oficial/ele2026/";
const ELE={1:"6259",2:"6260"},PLEITO={1:"3220",2:"3221"};
const GOV_STATES=["AC","AM","DF","ES","RN","TO"];
const GOV_SET=new Set(GOV_STATES);
const MAPBOX=[0,0,860,760],S=document.getElementById.bind(document);
const state={turn:2,uf:null,city:null,zone:null,section:null,view:"br",geoStates:[],geoCities:new Map(),cities:[],byIbge:new Map(),byUf:new Map(),mapProjection:null,ufBounds:new Map(),cityBounds:new Map(),ufData:{},brData:null,cityData:new Map(),zoneData:null,cityCache:new Map(),mapJob:0,loadJob:0,registryLoading:null,busy:false,lastRequest:null,currentView:MAPBOX.slice(),animateFrame:0,interval:null,errors:0,sectionCache:new Map()};
function normalize(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function num(v){if(typeof v==="number")return v;return Number(String(v??"0").replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,""))||0}
function fmt(v){return Math.round(v||0).toLocaleString("pt-BR")}
function pct(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"}
function esc(t){return String(t??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]))}
function dateNow(){return new Date().toLocaleTimeString("pt-BR")}
function padded(s,n){return String(s).padStart(n,"0")}
function status(text,tone){S("status").textContent=text;S("status").dataset.tone=tone||"neutral"}
function notice(text,tone){S("notice").textContent=text||"";S("notice").className="notice"+(text?" show":"")+(tone?" "+tone:"")}
function progress(text){S("loadProgress").textContent=text}
function validCandidates(doc){
  if(!doc||!Array.isArray(doc.carg))throw Error("Arquivo TSE sem resultado de governador");
  const candidates=[];
  for(const cargo of doc.carg){
    if(Number(cargo.cd)!==3)continue;
    for(const ag of (cargo.agr||[]))for(const p of (ag.par||[]))
      for(const c of (p.cand||[]))candidates.push({...c,__party:p.sg||p.sgpart||""});
  }
  const unique=[...new Map(candidates.map(c=>[String(c.n),c])).values()].sort((a,b)=>num(a.n)-num(b.n));
  if(unique.length!==2)throw Error("O arquivo do 2º turno não contém exatamente dois candidatos ao governo");
  const [first,second]=unique,lv=num(first.vap),bv=num(second.vap);
  const vv=num(doc.v&&doc.v.vv),sum=lv+bv,available=vv>0&&sum>0;
  const denominator=vv>0?vv:sum;
  function display(c){
    const name=c.nm||c.nmu||c.nmc||c.nome||("Candidato "+c.n);
    return String(name).trim();
  }
  return {lula:lv,bolsonaro:bv,name1:display(first),name2:display(second),
    num1:String(first.n),num2:String(second.n),
    party1:String(first.__party||""),party2:String(second.__party||""),
    valid:vv,lp:available?100*lv/denominator:0,bp:available?100*bv/denominator:0,
    margin:available?100*(lv-bv)/denominator:0,available,
    progress:num(doc.s&&doc.s.pst),dg:doc.dg||"",hg:doc.hg||"",dv:doc.dv||""};
}
function color(d){
  if(!d||!d.available||Math.abs(d.margin)<.005)return "#1a2a20";
  const opacity=Math.min(0.92,0.18+Math.pow(Math.min(1,Math.abs(d.margin)/32),.74)*.74);
  if(d.margin>0)return "rgba(239,180,67,"+opacity.toFixed(3)+")";
  return "rgba(53,183,224,"+opacity.toFixed(3)+")";
}
function resultUrl(uf,city,zone){
  const e=ELE[2],ufl=uf.toLowerCase();
  let n=ufl+(city?city.cd:"");
  if(zone)n+="-z"+padded(zone,4);
  return TSE_ROOT+e+"/dados/"+ufl+"/"+n+"-c0003-e"+padded(e,6)+"-u.json";
}
async function getJSON(url,timeoutMs){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs||18000);
  try{
    const res=await fetch(url+(url.includes("?")?"&":"?")+"v="+Date.now(),{cache:"no-store",signal:c.signal});
    if(!res.ok)throw Error("HTTP "+res.status);
    return await res.json();
  }finally{clearTimeout(timer)}
}
async function official(uf,city,zone){return validCandidates(await getJSON(resultUrl(uf,city,zone)))}
function coordsOf(feature){
  const geometry=feature.geometry,out=[];
  if(!geometry)return out;
  const p=geometry.type==="Polygon"?[geometry.coordinates]:geometry.type==="MultiPolygon"?geometry.coordinates:[];
  for(const polygon of p)for(const ring of polygon)for(const point of ring)out.push(point);
  return out;
}
function boundCoords(features){
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(const f of features)for(const [x,y] of coordsOf(f)){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}
  return [xmin,ymin,xmax,ymax];
}
function projBuilder(features){
  const b=boundCoords(features);
  const scale=Math.min(775/(b[2]-b[0]),670/(b[3]-b[1]));
  const offx=(860-(b[2]-b[0])*scale)/2,offy=(760-(b[3]-b[1])*scale)/2;
  return p=>[offx+(p[0]-b[0])*scale,offy+(b[3]-p[1])*scale];
}
function boundsFor(features){
  const geo=boundCoords(features),p=state.mapProjection;
  const a=p([geo[0],geo[3]]),b=p([geo[2],geo[1]]);
  return [a[0],a[1],b[0]-a[0],b[1]-a[1]];
}
function coordsPath(feature){
  const geo=feature.geometry,p=state.mapProjection;
  const polygons=geo.type==="Polygon"?[geo.coordinates]:geo.type==="MultiPolygon"?geo.coordinates:[];
  return polygons.map(rings=>rings.map(ring=>ring.map((c,i)=>{const xy=p(c);return(i?"L":"M")+xy[0].toFixed(2)+" "+xy[1].toFixed(2)}).join(" ")+"Z").join(" ")).join(" ");
}
function svgPath(id,feature,kind,code){
  const ns="http://www.w3.org/2000/svg",el=document.createElementNS(ns,"path");
  el.setAttribute("id",id);el.setAttribute("d",coordsPath(feature));
  el.setAttribute("fill-rule","evenodd");
  el.setAttribute("class","geo "+kind);el.setAttribute("tabindex","0");
  el.setAttribute("role","button");el.dataset.code=code;
  return el;
}
function zoomBox(bounds,pad){
  const padding=pad||1.11,cx=bounds[0]+bounds[2]/2,cy=bounds[1]+bounds[3]/2;
  let w=Math.max(11,bounds[2]*padding),h=Math.max(11,bounds[3]*padding);
  const aspect=860/760;
  if(w/h>aspect)h=w/aspect;else w=h*aspect;
  return [cx-w/2,cy-h/2,w,h];
}
function tweenView(box){
  const svg=S("map"),from=svg.getAttribute("viewBox").trim().split(/\s+/).map(Number),to=box.slice(),ms=680;
  if(state.animateFrame)cancelAnimationFrame(state.animateFrame);
  if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    state.currentView=to;svg.setAttribute("viewBox",to.join(" "));return;
  }
  let start=null;
  function frame(t){
    if(start===null)start=t;
    const progress=Math.min(1,(t-start)/ms),e=1-Math.pow(1-progress,3);
    const v=from.map((x,i)=>x+(to[i]-x)*e);
    svg.setAttribute("viewBox",v.join(" "));
    if(progress<1)state.animateFrame=requestAnimationFrame(frame);
    else{state.currentView=to;state.animateFrame=0}
  }
  state.currentView=to;state.animateFrame=requestAnimationFrame(frame);
}
function pointForEvent(event){
  const svg=S("map"),r=svg.getBoundingClientRect();
  return [(event.clientX-r.left-r.width/2)*1, (event.clientY-r.top-r.height/2)*1];
}
function tooltip(target,ev){
  const d=target.dataset,uf=d.uf,code=d.city,city=code?state.byIbge.get(code):null;
  const result=city?state.cityData.get(state.turn+"-"+city.ibge):state.ufData[uf];
  const title=city?city.nome+" / "+uf:UF[uf]||uf;
  S("tooltip").innerHTML="<b>"+esc(title)+"</b>"+(result&&result.available?
    "<span>"+esc(result.name1)+": "+pct(result.lp)+"</span><span>"+esc(result.name2)+": "+pct(result.bp)+
    "</span><small>Vantagem: "+pct(Math.abs(result.margin))+" p.p.</small>":
    "<small>"+(GOV_SET.has(uf)?"Ainda sem votos oficiais apurados.":"Sem 2º turno de governador nesta UF.")+"</small>");
  const rect=S("mapWrap").getBoundingClientRect();
  S("tooltip").style.left=Math.min(rect.width-205,Math.max(8,ev.clientX-rect.left+12))+"px";
  S("tooltip").style.top=Math.max(8,Math.min(rect.height-140,ev.clientY-rect.top+8))+"px";
  S("tooltip").classList.add("show");
}
function hideTooltip(){S("tooltip").classList.remove("show")}
function attachMapEvent(path,click){
  path.addEventListener("click",click);
  path.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();click()}});
  path.addEventListener("pointermove",e=>tooltip(path,e));
  path.addEventListener("pointerleave",hideTooltip);
}
async function loadStates(){
  const geo=await getJSON("assets/brasil-estados.geojson");
  if(!geo.features||geo.features.length!==27)throw Error("malha dos estados incompleta");
  state.geoStates=geo.features;state.mapProjection=projBuilder(geo.features);
  const layer=S("ufLayer");layer.replaceChildren();
  for(const f of geo.features){
    const code=f.properties.sigla,p=svgPath("uf-"+code,f,"uf",code);
    p.dataset.uf=code;p.setAttribute("aria-label","Aproximar "+UF[code]);
    attachMapEvent(p,()=>selectUF(code));p.classList.toggle("no-second-round",!GOV_SET.has(code));layer.appendChild(p);
    state.ufBounds.set(code,boundsFor([f]));
  }
  paintMap();
}
async function loadRegistry(){
  if(state.cities.length)return state.cities;
  if(state.registryLoading)return state.registryLoading;
  state.registryLoading=(async()=>{
    let j,source=null;
    // EA12: codigos TSE, IBGE, zona e UF. Metadados permanecem os mesmos entre turnos.
    for(const turn of [state.turn,state.turn===1?2:1]){
      const e=ELE[turn],url=TSE_ROOT+e+"/config/mun-e"+padded(e,6)+"-cm.json";
      try{j=await getJSON(url,20000);if(Array.isArray(j.abr)){source=turn;break}}catch(err){}
    }
    if(!j||!Array.isArray(j.abr))throw Error("A lista oficial de municípios do TSE não pôde ser carregada");
    const all=[],byIbge=new Map(),byUf=new Map();
    for(const a of j.abr){
      const uf=String(a.cd||"").toUpperCase();
      if(!UF[uf])continue;
      for(const m of a.mu||[]){
        if(!m.cd||!m.nm||!m.cdi)continue;
        const city={uf,nome:String(m.nm),cd:padded(m.cd,5),ibge:String(m.cdi),zones:(m.z||[]).map(z=>Number(z))};
        all.push(city);byIbge.set(city.ibge,city);
        if(!byUf.has(uf))byUf.set(uf,[]);
        byUf.get(uf).push(city);
      }
    }
    if(all.length<5000)throw Error("Lista municipal incompleta");
    state.cities=all;state.byIbge=byIbge;state.byUf=byUf;
    S("searchHint").textContent=fmt(all.length)+" municípios indexados pelo TSE";
    if(source!==state.turn)S("searchHint").textContent+=" · cadastro do 1º turno";
    fillCitySuggestions();
    return all;
  })();
  try{return await state.registryLoading}catch(e){
    S("searchHint").textContent="Busca por cidade indisponível: "+e.message;
    throw e;
  }finally{state.registryLoading=null}
}
function fillCitySuggestions(){
  const q=normalize(S("cityInput").value);
  const uf=S("ufSelect").value;
  const available=uf?state.byUf.get(uf)||[]:state.cities.filter(c=>GOV_SET.has(c.uf));
  const matches=available.filter(c=>!q||normalize(c.nome).includes(q)).slice(0,45);
  S("cityOptions").innerHTML=matches.map(c=>'<option value="'+esc(c.nome+" / "+c.uf)+'"></option>').join("");
}
function findCity(input){
  const raw=normalize(input).replace(/\s*\/\s*[a-z]{2}$/,"");
  if(!raw)return null;
  const uf=S("ufSelect").value;
  const candidates=uf?state.byUf.get(uf)||[]:state.cities.filter(c=>GOV_SET.has(c.uf));
  const exact=candidates.filter(c=>normalize(c.nome)===raw||normalize(c.nome+" / "+c.uf)===normalize(input));
  if(exact.length)return exact[0];
  return candidates.find(c=>normalize(c.nome).startsWith(raw))||candidates.find(c=>normalize(c.nome).includes(raw))||null;
}
async function loadUfGeo(uf){
  if(state.geoCities.has(uf))return state.geoCities.get(uf);
  const urls=[
    "https://cdn.jsdelivr.net/gh/henriquemalvar/br-geojson@main/dist/municipios/"+uf+".geojson",
    "https://raw.githubusercontent.com/henriquemalvar/br-geojson/main/dist/municipios/"+uf+".geojson"
  ];
  let last;for(const url of urls)try{
    const geo=await getJSON(url,25000);
    if(!geo.features||!geo.features.length)throw Error("malha vazia");
    state.geoCities.set(uf,geo.features);return geo.features;
  }catch(err){last=err}
  throw last||Error("malha municipal indisponível");
}
function colorForCity(f){
  const data=state.cityData.get(state.turn+"-"+String(f.properties.cd_geocmu));
  return color(data);
}
function paintMap(){
  for(const uf of UFS){
    const p=S("uf-"+uf);
    if(p){p.setAttribute("fill",GOV_SET.has(uf)?color(state.ufData[uf]):"#101e15");p.style.opacity=GOV_SET.has(uf)?"1":"0.23";p.classList.toggle("current",state.uf===uf)}
  }
  for(const path of S("cityLayer").children){
    const ibge=path.dataset.city;
    path.setAttribute("fill",color(state.cityData.get(state.turn+"-"+ibge)));
    path.classList.toggle("current",!!(state.city&&state.city.ibge===ibge));
  }
  S("ufLayer").classList.toggle("muted",state.view!=="br");
  S("cityLayer").classList.toggle("visible",state.view!=="br");
  S("mapCaption").textContent=state.view==="br"?"Seis UFs com 2º turno para governador":state.view==="uf"?
      "Mapa de calor por município · "+UF[state.uf]:"Município: "+state.city.nome+" / "+state.uf;
}
function drawCities(uf){
  const layer=S("cityLayer");layer.replaceChildren();
  const features=state.geoCities.get(uf)||[];
  for(const f of features){
    const ibge=String(f.properties.cd_geocmu),city=state.byIbge.get(ibge);
    const p=svgPath("city-"+ibge,f,"municipio",ibge);
    p.dataset.city=ibge;p.dataset.uf=uf;
    p.setAttribute("aria-label",city?city.nome+" / "+uf:f.properties.nome+" / "+uf);
    attachMapEvent(p,()=>selectCity(city||{uf,nome:f.properties.nome,ibge,cd:null}));
    layer.appendChild(p);
    state.cityBounds.set(ibge,boundsFor([f]));
  }
  paintMap();
}
async function selectUF(uf,opt){
  if(!UF[uf])return;
  if(!GOV_SET.has(uf)){notice(UF[uf]+" não tem segundo turno para governador em 2026.","warn");return}
  const job=++state.mapJob;
  state.uf=uf;state.city=null;state.zone=null;state.section=null;state.view="uf";
  S("ufSelect").value=uf;S("cityInput").value="";S("zoneInput").value="";S("sectionInput").value="";
  S("breadcrumb").textContent="BRASIL  /  "+UF[uf].toUpperCase();
  fillCitySuggestions();setSummary(state.ufData[uf],"Estado · "+UF[uf]);
  tweenView(zoomBox(state.ufBounds.get(uf),1.15));
  S("cityLayer").replaceChildren();paintMap();
  status("Carregando limites municipais...");
  try{
    await loadUfGeo(uf);
    if(job!==state.mapJob)return;
    drawCities(uf);
    progress(fmt(state.geoCities.get(uf).length)+" municípios desenhados. Consultando votos...");
    status("Municípios de "+uf+" carregados","ok");
    batchMunicipal(uf,false,job).catch(err=>{if(job===state.mapJob)progress('Falha na leitura de cidades: '+err.message)});
  }catch(err){
    if(job!==state.mapJob)return;
    status("Geografia municipal indisponível","warn");
    notice("Não foi possível carregar municípios de "+uf+": "+err.message,"warn");
  }
}
function municipalKey(city){return state.turn+"-"+city.ibge}
async function loadCityVote(city,force){
  if(!city.cd)throw Error("Código TSE do município não localizado no cadastro oficial");
  const key=municipalKey(city),old=state.cityData.get(key);
  if(old&&!force)return old;
  const data=await official(city.uf,city,null);
  state.cityData.set(key,data);
  return data;
}
async function batchMunicipal(uf,force,job){
  if(!state.byUf.has(uf)){
    try{await loadRegistry()}catch(e){progress("Não foi possível vincular municípios aos códigos oficiais do TSE");return}
  }
  const cities=state.byUf.get(uf)||[],round=state.turn,cacheKey=round+"-"+uf;
  if(!force && state.cityCache.has(cacheKey) && Date.now()-state.cityCache.get(cacheKey)<300000){
    progress("Votação municipal em cache · "+UF[uf]);paintMap();return;
  }
  if(!state.ufData[uf]||!state.ufData[uf].available){
    progress("TSE ainda não divulgou votos do "+(round===2?"2º":"1º")+" turno nesta UF. Municípios mantidos neutros.");
    return;
  }
  let index=0,done=0,good=0,fail=0;
  const current=()=>state.mapJob===job&&state.turn===round;
  async function worker(){
    while(index<cities.length&&current()){
      const city=cities[index++],key=municipalKey(city);
      try{
        if(!force&&state.cityData.has(key)){good++;done++;continue}
        const data=await official(uf,city,null);
        if(!current())return;
        state.cityData.set(key,data);good++;
        const path=S("city-"+city.ibge);if(path)path.setAttribute("fill",color(data));
        if(state.city&&state.city.ibge===city.ibge)renderSummary();
      }catch(e){fail++}
      done++;
      if(done%7===0||done===cities.length)progress("Calor municipal "+uf+": "+done+"/"+cities.length+" consultas · "+fail+" indisponíveis");
      if(done%17===0)await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
  // Várias consultas, mas abaixo dos limites publicados pelo TSE.
  await Promise.all(Array.from({length:Math.min(6,cities.length)},()=>worker()));
  if(!current())return;
  state.cityCache.set(cacheKey,Date.now());
  progress("Mapa "+uf+": "+good+"/"+cities.length+" municípios consultados"+(fail?" · "+fail+" indisponíveis":""));
  paintMap();
}
async function selectCity(city){
  if(!city)return;
  if(state.uf!==city.uf||!state.geoCities.has(city.uf))await selectUF(city.uf,{city:true});
  state.city=city;state.uf=city.uf;state.view="city";state.zone=null;state.section=null;
  S("ufSelect").value=city.uf;S("cityInput").value=city.nome+" / "+city.uf;
  S("zoneInput").value="";S("sectionInput").value="";
  S("breadcrumb").textContent="BRASIL  /  "+UF[city.uf].toUpperCase()+"  /  "+city.nome.toUpperCase();
  const bounds=state.cityBounds.get(city.ibge)||state.ufBounds.get(city.uf);
  tweenView(zoomBox(bounds,1.52));paintMap();renderSummary();
  if(!city.cd){
    notice("Município localizado geograficamente. Código TSE ainda não disponível; consulta nominal suspensa.","warn");return
  }
  status("Consultando "+city.nome+"...");
  try{
    const data=await loadCityVote(city,false);
    if(state.city!==city)return;
    renderSummary();paintMap();notice("");
    status(city.nome+" · TSE consultado","ok");
  }catch(e){
    status("Município sem consulta","warn");notice("Não foi possível consultar "+city.nome+": "+e.message,"warn");
  }
}
function setSummary(d,title){
  S("detailTitle").textContent=title||"Brasil";
  S("lulaName").textContent=d&&d.name1?d.name1.toUpperCase():"CANDIDATO 1";
  S("bolsoName").textContent=d&&d.name2?d.name2.toUpperCase():"CANDIDATO 2";
  S("lulaPct").textContent=d&&d.available?pct(d.lp):"—";
  S("bolsoPct").textContent=d&&d.available?pct(d.bp):"—";
  S("lulaVotes").textContent=d&&d.available?fmt(d.lula)+" votos":"— votos";
  S("bolsoVotes").textContent=d&&d.available?fmt(d.bolsonaro)+" votos":"— votos";
  S("lulaBar").style.width=d&&d.available?Math.min(d.lp,100)+"%":"0";
  S("bolsoBar").style.width=d&&d.available?Math.min(d.bp,100)+"%":"0";
  S("counted").textContent=d?pct(d.progress):"—";
  S("difference").textContent=d&&d.available?pct(Math.abs(d.margin))+" p.p.":"—";
  S("leader").textContent=d&&d.available?(d.margin>0?d.name1:d.margin<0?d.name2:"Empate"):"Sem votos";
  S("sourceTime").textContent=d&&d.dg?"Atualização TSE: "+d.dg+" "+d.hg:"Aguardando atualização oficial";
  S("currentData").textContent=d&&d.available?"DADOS OFICIAIS":"SEM DADOS APURADOS";
}
function renderSummary(){
  const d=state.zoneData&&state.zone?state.zoneData:state.city?
    state.cityData.get(municipalKey(state.city)):state.uf?state.ufData[state.uf]:state.brData;
  let title=state.city?state.city.nome+" / "+state.uf:state.uf?UF[state.uf]:"Brasil";
  if(state.zone)title+=" · Zona "+state.zone;
  setSummary(d,title);
}
async function search(){
  const uf=S("ufSelect").value,cityText=S("cityInput").value.trim(),zoneText=S("zoneInput").value.trim(),sectionText=S("sectionInput").value.trim();
  notice("");
  if(!state.cities.length&&cityText)try{await loadRegistry()}catch(e){notice("Não foi possível consultar índice de municípios: "+e.message,"warn");return}
  if(!cityText&&(zoneText||sectionText)){notice("Para consultar zona ou urna/seção, informe a cidade.","warn");return}
  let city=cityText?findCity(cityText):null;
  if(cityText&&!city){notice("Município não encontrado nos seis estados com 2º turno. Confira o nome e a UF.","warn");return}
  if(city)await selectCity(city);
  else if(uf)await selectUF(uf);
  else{resetMap();return}
  if(!zoneText&&!sectionText)return;
  if(!state.city){notice("Para pesquisar zona ou seção (urna), informe também a cidade.","warn");return}
  const zon=Number(zoneText),sec=Number(sectionText);
  if(!Number.isInteger(zon)||zon<1||zon>9999){
    notice("Informe uma zona eleitoral válida antes de consultar a seção.","warn");return;
  }
  state.zone=zon;state.zoneData=null;state.section=null;
  status("Consultando Zona "+zon+"...");
  try{
    const data=await official(state.city.uf,state.city,zon);
    state.zoneData=data;renderSummary();
    status("Zona "+zon+" · consulta TSE","ok");
  }catch(e){notice("Resultado da zona indisponível: "+e.message,"warn");status("Zona sem dados","warn");renderSummary()}
  if(sectionText){
    if(!Number.isInteger(sec)||sec<1||sec>9999){notice("Número de seção inválido.","warn");return}
    await verifySection(state.city,zon,sec);
  }
}
async function verifySection(city,zone,secao){
  const key=state.turn+"-"+city.uf;
  S("sectionDetails").textContent="Conferindo seção "+secao+" na configuração EA16 do TSE...";
  status("Conferindo urna...");
  let document=state.sectionCache.get(key);
  if(!document){
    const pleito=PLEITO[state.turn],uf=city.uf.toLowerCase();
    const url=TSE_ROOT+"arquivo-urna/"+pleito+"/config/"+uf+"/"+uf+"-p"+padded(pleito,6)+"-cs.json";
    try{document=await getJSON(url,30000);state.sectionCache.set(key,document)}
    catch(e){S("sectionDetails").textContent="Não foi possível validar a seção no arquivo EA16: "+e.message;status("Urna não validada","warn");return}
  }
  let found=null;
  for(const abr of (document.abr||[])){
    if(String(abr.cd).toUpperCase()!==city.uf)continue;
    for(const m of (abr.mu||[])){
      if(padded(m.cd,5)!==city.cd)continue;
      for(const z of (m.zon||[])){
        if(Number(z.cd)!==zone)continue;
        found=(z.sec||[]).find(s=>Number(s.ns)===secao)||null;
      }
    }
  }
  if(found){
    state.section=secao;
    let msg="Seção "+padded(secao,4)+" confirmada na Zona "+zone+" de "+city.nome+".";
    if(found.nsp)msg+=" Seção agregada à seção principal "+Number(found.nsp)+".";
    msg+=" Os votos por seção exigem leitura do Boletim de Urna (BU), não disponível no resumo municipal.";
    S("sectionDetails").textContent=msg;
    status("Seção confirmada no TSE","ok");
  }else{
    S("sectionDetails").textContent="Seção "+secao+" não encontrada para a Zona "+zone+" de "+city.nome+" no arquivo de configuração do TSE.";
    status("Seção não encontrada","warn");
  }
}
async function refreshNational(){
  if(state.busy)return;
  state.busy=true;
  const job=++state.loadJob;
  status("Consultando governos estaduais...");
  let ok=0,error=0,index=0,hasVotes=0,completed=0;
  const items=GOV_STATES.slice();
  async function worker(){
    while(index<items.length&&job===state.loadJob){
      const uf=items[index++];
      try{
        const data=await official(uf,null,null);
        if(job!==state.loadJob)return;
        state.ufData[uf]=data;
        if(data.available)hasVotes++;
        if(data.progress>=99.995)completed++;
        ok++;
      }catch(err){error++}
      S("ufCounter").textContent=ok+"/"+items.length+" arquivos";
    }
  }
  await Promise.all(Array.from({length:3},worker));
  if(job!==state.loadJob)return;
  state.busy=false;state.lastRequest=Date.now();
  S("lastUpdate").textContent="Consulta: "+dateNow();
  S("nationalLula").textContent="6 UFs";
  S("nationalBolso").textContent=hasVotes+"/6";
  S("nationalProgress").textContent=completed+"/6";
  S("ufCounter").textContent=ok+"/6 arquivos";
  S("hintTurn").textContent="UFs com 100% das seções totalizadas.";
  if(error)notice(error+" estados não responderam. Mapa neutro onde não há dados confirmados.","warn");
  else if(!hasVotes)notice("Aguardando divulgação oficial da apuração do 2º turno para governador. Nenhum resultado fictício será exibido.");
  else notice("");
  status(ok?"TSE · "+ok+"/6 UFs":"TSE indisponível",ok?"ok":"warn");
  paintMap();renderSummary();
}
function resetMap(){
  state.mapJob++;state.uf=null;state.city=null;state.zone=null;state.section=null;state.zoneData=null;state.view="br";
  S("ufSelect").value="";S("cityInput").value="";S("zoneInput").value="";S("sectionInput").value="";
  S("cityLayer").replaceChildren();
  S("breadcrumb").textContent="BRASIL  /  VISÃO NACIONAL";
  S("sectionDetails").textContent="A pesquisa por urna considera município + zona + seção; a urna não possui contorno próprio no mapa.";
  fillCitySuggestions();tweenView(MAPBOX);paintMap();renderSummary();notice("");
  progress("Clique em um estado para visualizar a malha municipal.");
}
function setup(){
  const stateSelect=S("ufSelect");
  for(const uf of GOV_STATES.slice().sort((a,b)=>UF[a].localeCompare(UF[b],"pt-BR"))){
    const o=document.createElement("option");o.value=uf;o.textContent=UF[uf]+" ("+uf+")";stateSelect.appendChild(o);
  }
  stateSelect.addEventListener("change",()=>{fillCitySuggestions();if(stateSelect.value)selectUF(stateSelect.value);else resetMap()});
  S("cityInput").addEventListener("input",fillCitySuggestions);
  S("cityInput").addEventListener("change",()=>{const v=S("cityInput").value;if(v&&v.includes("/"))search()});
  for(const id of ["cityInput","zoneInput","sectionInput"]){
    S(id).addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();search()}});
  }
  S("searchBtn").addEventListener("click",search);
  S("resetBtn").addEventListener("click",resetMap);
  S("refreshBtn").addEventListener("click",async()=>{await refreshNational();if(state.uf){
    state.cityCache.delete(state.turn+"-"+state.uf);
    if(state.city){await loadCityVote(state.city,true).then(()=>{renderSummary();paintMap()}).catch(e=>notice("Erro ao atualizar cidade: "+e.message,"warn"))}
    else await batchMunicipal(state.uf,true,state.mapJob);
  }});
  S("obsBtn").addEventListener("click",()=>{document.body.classList.toggle("obs");S("obsBtn").textContent=document.body.classList.contains("obs")?"SAIR DO OBS":"MODO OBS"});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){hideTooltip();if(document.body.classList.contains("obs")){document.body.classList.remove("obs");S("obsBtn").textContent="MODO OBS"}}});
  state.interval=setInterval(()=>refreshNational(),120000);
}
(async()=>{
  setup();
  await Promise.allSettled([loadRegistry(),loadStates()]);
  if(!state.mapProjection){
    notice("A malha geográfica do Brasil não pôde ser carregada. Atualize a página.","warn");
    status("Mapa indisponível","warn");
  }else{
    progress("Clique em um estado ou pesquise um município.");
    await refreshNational();
  }
})();
