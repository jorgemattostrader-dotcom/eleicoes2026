"use strict";
const BASE="https://resultados.tse.jus.br/oficial";
const MAP={w:1000,h:540},TURNS={1:"6257",2:"6258"},CANDIDATES={lula:"13",bolsonaro:"22"};
const GEO_CENTERS={AG:[-61.8,17.1],BB:[-59.56,13.19],BH:[50.55,26.07],CV:[-23.6,15.1],HK:[114.17,22.31],LC:[-60.97,13.9],SG:[103.8,1.35],ST:[6.73,.34]};
const $=id=>document.getElementById(id);
const state={turn:2,features:[],refMap:new Map(),crosswalk:[],mapping:new Map(),countryIndex:new Map(),countryFeatures:new Map(),eligible:new Map(),activeSource:null,sourceDescription:"",activeCityCount:0,unknownCodes:[],roundResults:new Map(),cityRows:new Map(),cityStatus:new Map(),zz:null,selected:null,revision:0,loading:false,registryReady:false,viewBox:[0,0,MAP.w,MAP.h],frame:0,tour:null,tourIndex:0,refreshTimer:null};
function norm(s){return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function esc(s){return String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]))}
function n(s){if(typeof s==="number")return s;return Number(String(s??0).replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,""))||0}
function count(v){return Math.round(v||0).toLocaleString("pt-BR")}
function percent(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"}
function pad(v,d){return String(v).padStart(d,"0")}
function setStatus(msg,level){const x=$("status");x.textContent=msg;x.dataset.level=level||"neutral"}
function notice(msg,kind){const x=$("notice");x.textContent=msg||"";x.className="notice"+(msg?" visible":"")+(kind?" "+kind:"")}
function point(lon,lat){return [(lon+180)/360*MAP.w,(90-lat)/180*MAP.h]}
function boxAt(bounds,pad){
 let [x,y,w,h]=bounds,ratio=MAP.w/MAP.h;
 w=Math.max(9,w*pad);h=Math.max(8,h*pad);
 if(w/h>ratio)h=w/ratio;else w=h*ratio;
 const midX=x+bounds[2]/2,midY=y+bounds[3]/2;
 return [midX-w/2,midY-h/2,w,h]
}
function zoomTo(to){
 const svg=$("map"),from=svg.getAttribute("viewBox").split(/\s+/).map(Number),begin=performance.now(),ms=770;
 if(state.frame)cancelAnimationFrame(state.frame);
 if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){svg.setAttribute("viewBox",to.join(" "));state.viewBox=to;return}
 function run(now){
   const p=Math.min(1,(now-begin)/ms),t=1-Math.pow(1-p,3);
   const arr=from.map((value,i)=>value+(to[i]-value)*t);
   svg.setAttribute("viewBox",arr.join(" "));
   if(p<1)state.frame=requestAnimationFrame(run);else{state.frame=0;state.viewBox=to}
 }
 state.viewBox=to;state.frame=requestAnimationFrame(run);
}
function coords(g){
 const polygons=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
 return polygons;
}
function shapePath(g){
 return coords(g).map(poly=>poly.map(r=>r.map((p,i)=>{
   const xy=point(p[0],p[1]);return(i?"L":"M")+xy[0].toFixed(1)+","+xy[1].toFixed(1)
 }).join(" ")+"Z").join(" ")).join(" ");
}
function getBounds(geo){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const polygon of coords(geo))for(const ring of polygon)for(const p of ring){
   const xy=point(p[0],p[1]);x0=Math.min(x0,xy[0]);x1=Math.max(x1,xy[0]);y0=Math.min(y0,xy[1]);y1=Math.max(y1,xy[1]);
 }
 if(!Number.isFinite(x0))return [0,0,MAP.w,MAP.h];
 return [x0,y0,x1-x0,y1-y0];
}
async function get(url,ms=17000){
 const c=new AbortController(),kill=setTimeout(()=>c.abort(),ms);
 try{
   const u=url+(url.includes("?")?"&":"?")+"ts="+Date.now();
   const response=await fetch(u,{signal:c.signal,cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   return await response.json();
 }finally{clearTimeout(kill)}
}
function resultUrl(city,turn){
 const code=TURNS[turn],uf="zz";
 return BASE+"/ele2026/"+code+"/dados/zz/zz"+city+"-c0001-e"+pad(code,6)+"-u.json"
}
function overseasUrl(turn){
 const code=TURNS[turn];
 return BASE+"/ele2026/"+code+"/dados/zz/zz-c0001-e"+pad(code,6)+"-u.json"
}
function parseVotes(json){
 if(!json||!Array.isArray(json.carg))throw Error("Formato EA20 inválido");
 const all=[];
 for(const c of json.carg)if(n(c.cd)===1){
   for(const a of (c.agr||[]))for(const p of (a.par||[]))for(const can of (p.cand||[]))all.push(can);
 }
 const lula=all.find(c=>String(c.n)===CANDIDATES.lula);
 const bolso=all.find(c=>String(c.n)===CANDIDATES.bolsonaro);
 if(!lula||!bolso)throw Error("Candidatos não encontrados");
 const lv=n(lula.vap),bv=n(bolso.vap),valid=n(json.v&&json.v.vv);
 const available=valid>0&&(lv+bv)>0;
 return {lula:lv,bolso:bv,valid,available,total:n(json.s?.ts),counted:n(json.s?.st),
   progress:n(json.s?.pst),at:(json.dg||"")+" "+(json.hg||""), round:json.t||null};
}
function add(a,b){return {lula:(a.lula||0)+(b.lula||0),bolso:(a.bolso||0)+(b.bolso||0),valid:(a.valid||0)+(b.valid||0),
  total:(a.total||0)+(b.total||0),counted:(a.counted||0)+(b.counted||0),available:true}}
function votePercent(v){return v&&v.valid?100*v.lula/v.valid:0}
function otherPercent(v){return v&&v.valid?100*v.bolso/v.valid:0}
function margin(v){return votePercent(v)-otherPercent(v)}
function heat(v){
 if(!v||!v.available||v.valid<=0||Math.abs(margin(v))<0.005)return "#17261c";
 const advantage=Math.abs(margin(v)),power=Math.pow(Math.min(advantage/35,1),.75);
 const alpha=(.18+.78*power).toFixed(3);
 return margin(v)>0?"rgba(240,72,84,"+alpha+")":"rgba(18,208,119,"+alpha+")"
}
async function loadGeography(){
 const [shapes,locationMap]=await Promise.all([get("assets/mundo-paises.geojson",15000),get("assets/exterior-localidades.json",15000)]);
 if(!Array.isArray(shapes.features)||shapes.features.length<170)throw Error("Mapas mundiais incompletos");
 if(!Array.isArray(locationMap.countries)||locationMap.countries.length<130)throw Error("Cadastro de países incompleto");
 state.features=shapes.features;
 state.crosswalk=locationMap.countries;
 state.mapping=new Map(locationMap.countries.flatMap(country=>country.cities.map(city=>[pad(city.code,5),{...country,cityCode:pad(city.code,5),cityName:city.name}])));
 state.countryIndex=new Map(locationMap.countries.map(c=>[c.iso2,c]));
 const layer=$("land");
 layer.replaceChildren();state.countryFeatures.clear();
 const ns="http://www.w3.org/2000/svg";
 for(const f of shapes.features){
   const path=document.createElementNS(ns,"path");
   path.setAttribute("d",shapePath(f.geometry));
   path.setAttribute("fill-rule","evenodd");
   path.setAttribute("class","country");
   path.setAttribute("fill","#102218");
   path.setAttribute("stroke","#3b5b48");
   path.dataset.iso3=f.id;
   layer.appendChild(path);
   state.countryFeatures.set(f.id,{path,feature:f,bounds:getBounds(f.geometry)});
 }
 setStatus("Mapa mundial carregado");
}
async function findPleito2(){
 const j=await get(BASE+"/comum/config/ele-c.json",22000);
 for(const p of j.pl||[]){
   if(p.c!=="ele2026")continue;
   if((p.e||[]).some(e=>String(e.cd)==="6258"))return String(p.cd);
 }
 return null;
}
async function fetchActiveSections(){
 const tries=[];
 try{
   const id=await findPleito2();
   if(id)tries.push({id,kind:"2º turno",turn:2});
 }catch(e){}
 tries.push({id:"3221",kind:"2º turno (código candidato)",turn:2});
 tries.push({id:"3220",kind:"1º turno (referência de seções)",turn:1});
 const attempted=new Set();
 let lastError;
 for(const p of tries){
   if(attempted.has(p.id))continue;attempted.add(p.id);
   const url=BASE+"/ele2026/arquivo-urna/"+p.id+"/config/zz/zz-p"+pad(p.id,6)+"-cs.json";
   try{
     const j=await get(url,28000);
     if(!Array.isArray(j.abr))throw Error("Cadastro de seções sem lista de localidades");
     const codes=new Map();
     for(const abr of j.abr){
       if(String(abr.cd).toLowerCase()!=="zz")continue;
       for(const mu of abr.mu||[]){
         let totalSections=0;
         for(const zone of mu.zon||[])
           totalSections+=(zone.sec||[]).filter(s=>!s.nsp).length;
         if(totalSections>0)codes.set(pad(mu.cd,5),totalSections);
       }
     }
     if(codes.size<80)throw Error("Seções insuficientes ou estrutura incompatível");
     return {codes,source:p.kind,pleito:p.id,referenceTurn:p.turn};
   }catch(e){lastError=e}
 }
 throw lastError||Error("Nenhum cadastro de seções eleitorais do exterior pôde ser consultado");
}
function applyEligibility(sectionInfo){
 state.eligible.clear();state.unknownCodes=[];
 let activeCount=0;
 for(const [code,sections] of sectionInfo.codes){
   const row=state.mapping.get(code);
   if(!row){state.unknownCodes.push(code);continue}
   let item=state.eligible.get(row.iso2);
   if(!item){item={iso2:row.iso2,iso3:row.iso3,name:row.name,cities:[],sections:0};state.eligible.set(row.iso2,item)}
   item.cities.push({code,name:row.cityName,sections});
   item.sections+=sections;
   activeCount++;
 }
 state.activeCityCount=activeCount;
 state.activeSource=sectionInfo;
 state.sourceDescription="Seções oficiais: "+sectionInfo.source+" · pleito "+sectionInfo.pleito;
 renderList();renderPins();paint();
 $("eligibleCountries").textContent=count(state.eligible.size);
 $("eligibleCities").textContent=count(activeCount);
 $("registerNote").textContent=state.sourceDescription+(state.unknownCodes.length?" · "+state.unknownCodes.length+" locais sem país vinculado":"");
 if(sectionInfo.referenceTurn===1)notice("Países definidos pelas seções oficiais do 1º turno (referência), enquanto o cadastro de seções do 2º turno não estiver acessível. Confira a situação de votação do 2º turno no TSE.","warn");
}
function renderPins(){
 const layer=$("pins");layer.replaceChildren();
 const ns="http://www.w3.org/2000/svg";
 for(const item of state.eligible.values()){
   if(state.countryFeatures.has(item.iso3))continue;
   const xy=GEO_CENTERS[item.iso2];
   if(!xy)continue;
   const center=point(...xy);
   const circle=document.createElementNS(ns,"circle");
   circle.setAttribute("cx",center[0]);circle.setAttribute("cy",center[1]);circle.setAttribute("r",4.5);
   circle.setAttribute("stroke","#def5dd");circle.setAttribute("stroke-width","1");
   circle.setAttribute("class","pin eligible");circle.dataset.iso=item.iso2;
   bindSelection(circle,item.iso2);layer.appendChild(circle);
 }
}
function bindSelection(el,iso){
 el.setAttribute("role","button");
 el.setAttribute("tabindex","0");
 el.setAttribute("aria-label","Selecionar "+state.countryIndex.get(iso)?.name);
 el.addEventListener("click",()=>choose(iso));
 el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(iso)}});
 el.addEventListener("pointermove",e=>showTooltip(iso,e));
 el.addEventListener("pointerleave",hideTooltip);
 el.addEventListener("focus",()=>showTooltip(iso,null));
 el.addEventListener("blur",hideTooltip);
}
function repaintEligible(){
 for(const [id,obj] of state.countryFeatures){
   const row=state.crosswalk.find(c=>c.iso3===id);
   const isEligible=row&&state.eligible.has(row.iso2);
   obj.path.classList.toggle("eligible",!!isEligible);
   obj.path.classList.toggle("selected",!!(isEligible&&state.selected===row.iso2));
   obj.path.style.pointerEvents=isEligible?"auto":"none";
   obj.path.setAttribute("fill",isEligible?heat(state.roundResults.get(row.iso2)):"#0c1c14");
   obj.path.setAttribute("stroke",isEligible?"#a5c9ae":"#28432f");
   if(isEligible&&!obj.path.dataset.bound){
     obj.path.dataset.bound="1";bindSelection(obj.path,row.iso2);
   }
 }
 for(const el of $("pins").children){
   el.setAttribute("fill",heat(state.roundResults.get(el.dataset.iso)));
   el.classList.toggle("selected",state.selected===el.dataset.iso);
 }
}
function paint(){repaintEligible();renderSelected();renderList()}
function countryVotes(iso){return state.roundResults.get(iso)}
function infoTooltip(iso){
 const country=state.eligible.get(iso),v=countryVotes(iso);
 if(!country)return "";
 return "<b>"+esc(country.name)+"</b><small>"+country.cities.length+" local(is) com seção eleitoral</small>"+
    (v&&v.valid?
      "<div>Lula <strong style='color:#f04a56'>"+percent(votePercent(v))+"</strong></div>"+
      "<div>Flávio Bolsonaro <strong style='color:#16d077'>"+percent(otherPercent(v))+"</strong></div>"+
      "<small>Votos válidos de "+(v.received||0)+"/"+country.cities.length+" locais recebidos</small>"
      :"<small>Sem votos oficiais disponíveis no turno selecionado</small>");
}
function showTooltip(iso,event){
 const tooltip=$("tooltip");tooltip.innerHTML=infoTooltip(iso);tooltip.classList.add("show");
 const r=$("mapbox").getBoundingClientRect();
 const x=event?event.clientX-r.left:16,y=event?event.clientY-r.top:16;
 tooltip.style.left=Math.max(5,Math.min(r.width-220,x+12))+"px";
 tooltip.style.top=Math.max(5,Math.min(r.height-140,y+11))+"px";
}
function hideTooltip(){$("tooltip").classList.remove("show")}
function updateDetail(v,title,description){
 $("detailTitle").textContent=title;
 $("detailMeta").textContent=description;
 $("lulaPct").textContent=v&&v.available?percent(votePercent(v)):"—";
 $("bolsoPct").textContent=v&&v.available?percent(otherPercent(v)):"—";
 $("lulaVotes").textContent=v&&v.available?count(v.lula)+" votos":"— votos";
 $("bolsoVotes").textContent=v&&v.available?count(v.bolso)+" votos":"— votos";
 $("lulaBar").style.width=v&&v.available?Math.min(100,votePercent(v))+"%":"0";
 $("bolsoBar").style.width=v&&v.available?Math.min(100,otherPercent(v))+"%":"0";
 $("totalValid").textContent=v&&v.available?count(v.valid):"—";
 $("difference").textContent=v&&v.available?percent(Math.abs(margin(v)))+" p.p.":"—";
 $("leader").textContent=v&&v.available?
   (margin(v)>0?"Lula":margin(v)<0?"Flávio Bolsonaro":"Empate entre os dois"):"Sem votos";
}
function renderSelected(){
 const item=state.selected?state.eligible.get(state.selected):null;
 if(!item){
   updateDetail(state.zz,"Exterior · total TSE",
     state.zz&&state.zz.available?"Total oficial ZZ · "+state.zz.at:"Aguardando dados oficiais do TSE no exterior");
   $("cityList").innerHTML="<p class='muted'>Selecione um país para ver os locais de votação.</p>";
   $("detailScope").textContent="EXTERIOR / GERAL";
   return;
 }
 const v=countryVotes(item.iso2);
 const received=v?.received||0;
 updateDetail(v,item.name,
   received+"/"+item.cities.length+" localidades com votos disponíveis · "+count(item.sections)+" seções principais cadastradas");
 $("detailScope").textContent="EXTERIOR / "+item.iso2;
 const parts=item.cities.map(city=>{
   const row=state.cityRows.get(city.code);
   let info=row&&row.available?
     count(row.lula)+" Lula · "+count(row.bolso)+" Flávio":"Aguardando votos";
   return "<div class='cityrow'><span>"+esc(city.name)+"</span><small>"+info+"</small></div>";
 });
 $("cityList").innerHTML=parts.join("")||"<p class='muted'>Nenhuma cidade cadastrada.</p>";
}
function choose(iso){
 if(!state.eligible.has(iso))return;
 state.selected=iso;
 $("searchCountry").value=state.eligible.get(iso).name;
 $("mapLabel").textContent=state.eligible.get(iso).name+" · votação presidencial brasileira";
 const feature=state.countryFeatures.get(state.eligible.get(iso).iso3);
 const p=GEO_CENTERS[iso];
 if(feature)zoomTo(boxAt(feature.bounds,1.3));
 else if(p){const [x,y]=point(...p);zoomTo([x-35,y-19,70,38])}
 paint();
}
function reset(){
 stopTour();state.selected=null;$("searchCountry").value="";
 $("mapLabel").textContent="MUNDO · LOCAIS DE VOTAÇÃO BRASILEIROS";
 zoomTo([0,0,MAP.w,MAP.h]);paint();hideTooltip();
}
function renderList(){
 const q=norm($("searchCountry").value);
 const eligible=[...state.eligible.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
 $("countryOptions").innerHTML=eligible.map(item=>"<option value='"+esc(item.name)+"'></option>").join("");
 const listed=eligible.filter(item=>!q||norm(item.name).includes(q)).slice(0,140);
 $("countriesList").innerHTML=listed.map(item=>{
   const v=countryVotes(item.iso2),valid=!!(v&&v.available);
   const detail=valid?percent(Math.abs(margin(v)))+" p.p.":"Sem votos";
   return '<button class="countryrow '+(state.selected===item.iso2?"current":"")+'" data-iso="'+item.iso2+'" type="button">'+
     '<span><i class="dot" style="background:'+heat(v)+'"></i>'+esc(item.name)+'</span>'+
     '<small>'+detail+'</small></button>'
 }).join("")||'<p class="muted">Nenhum país encontrado no cadastro ativo.</p>';
 $("countriesList").querySelectorAll("button[data-iso]").forEach(el=>el.addEventListener("click",()=>choose(el.dataset.iso)));
}
async function fetchZZ(turn,token){
 try{
   const v=parseVotes(await get(overseasUrl(turn),21000));
   if(token!==state.revision)return;
   state.zz=v;
   $("overseasProgress").textContent=percent(v.progress);
   $("lulaWorld").textContent=v.available?percent(votePercent(v)):"—";
   $("bolsoWorld").textContent=v.available?percent(otherPercent(v)):"—";
 }catch(e){
   if(token!==state.revision)return;
   state.zz=null;
   $("overseasProgress").textContent="—";$("lulaWorld").textContent="—";$("bolsoWorld").textContent="—";
 }
 renderSelected();
}
async function fetchCountryResults(force){
 if(state.loading&&!force)return;
 if(!state.eligible.size){notice("Aguardando cadastro oficial de países com seções eleitorais ativas.","warn");return}
 const token=++state.revision,turn=state.turn;
 state.loading=true;state.roundResults.clear();state.cityRows.clear();state.cityStatus.clear();
 $("refresh").disabled=true;
 setStatus("Consultando locais do TSE…");
 let done=0,success=0,failed=0,index=0;
 const cities=[...state.eligible.values()].flatMap(country=>country.cities.map(city=>({...city,iso:country.iso2})));
 const byCountry=new Map();
 for(const country of state.eligible.values())byCountry.set(country.iso2,{lula:0,bolso:0,valid:0,received:0,expected:country.cities.length,available:false});
 const zzPromise=fetchZZ(turn,token);
 async function worker(){
   while(index<cities.length&&token===state.revision){
     const city=cities[index++];
     try{
       const votes=parseVotes(await get(resultUrl(city.code,turn),19000));
       if(token!==state.revision)return;
       state.cityRows.set(city.code,votes);
       if(votes.available){
         const agg=byCountry.get(city.iso);
         agg.lula+=votes.lula;agg.bolso+=votes.bolso;agg.valid+=votes.valid;
         agg.received++;agg.available=true;success++;
         state.roundResults.set(city.iso,{...agg});
       }
     }catch(e){failed++}
     done++;
     if(done%4===0||done===cities.length){
       $("progressBar").style.width=(done/cities.length*100)+"%";
       $("requests").textContent=done+"/"+cities.length+" localidades consultadas";
       $("withVotes").textContent=count([...state.roundResults.values()].filter(x=>x.available).length);
       paint();
     }
   }
 }
 await Promise.all(Array.from({length:6},worker));
 await zzPromise;
 if(token!==state.revision)return;
 state.loading=false;$("refresh").disabled=false;
 setStatus(success?"TSE · "+success+" localidades com votos":"Aguardando votos oficiais",success?"ok":"warn");
 $("lastUpdate").textContent="Última consulta: "+new Date().toLocaleTimeString("pt-BR");
 if(failed)notice(failed+" consultas de localidades falharam. Totais por país podem estar incompletos; veja quantos locais tiveram votos recebidos.","warn");
 else if(!success)notice("As localidades estão confirmadas no cadastro de seções, mas ainda não há votos oficiais disponíveis para colorir o mapa.");
 else if(state.activeSource?.referenceTurn===2)notice("");
 paint();
}
async function chooseTurn(turn){
 if(state.turn===turn)return;
 state.turn=turn;state.revision++;state.loading=false;state.zz=null;
 $("firstTurn").classList.toggle("active",turn===1);
 $("secondTurn").classList.toggle("active",turn===2);
 $("turnTitle").textContent=turn===1?"1º TURNO · 04/10/2026":"2º TURNO · 25/10/2026";
 $("lulaWorld").textContent="—";$("bolsoWorld").textContent="—";$("overseasProgress").textContent="—";
 await fetchCountryResults(true);
}
function stopTour(){
 if(state.tour)clearInterval(state.tour);state.tour=null;
 $("tour").textContent="▶ TOUR PELOS PAÍSES";$("tour").classList.remove("active");
}
function toggleTour(){
 if(state.tour){stopTour();return}
 const items=[...state.eligible.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
 if(!items.length)return;
 $("tour").textContent="■ PARAR TOUR";$("tour").classList.add("active");
 state.tourIndex=0;
 const tick=()=>choose(items[state.tourIndex++%items.length].iso2);
 tick();state.tour=setInterval(tick,4300);
}
function setup(){
 $("secondTurn").addEventListener("click",()=>chooseTurn(2));
 $("firstTurn").addEventListener("click",()=>chooseTurn(1));
 $("refresh").addEventListener("click",()=>fetchCountryResults(true));
 $("searchBtn").addEventListener("click",doSearch);
 $("reset").addEventListener("click",reset);
 $("tour").addEventListener("click",toggleTour);
 $("searchCountry").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doSearch()}});
 $("searchCountry").addEventListener("change",doSearch);
 $("searchCountry").addEventListener("input",renderList);
 $("obs").addEventListener("click",()=>{
  document.body.classList.toggle("obs");$("obs").textContent=document.body.classList.contains("obs")?"SAIR DO OBS":"MODO OBS";
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){hideTooltip();if(document.body.classList.contains("obs")){$("obs").click()}}});
 state.refreshTimer=setInterval(()=>{if(!state.loading&&state.eligible.size)fetchCountryResults(false)},180000);
}
function doSearch(){
 const query=norm($("searchCountry").value);
 if(!query)return reset();
 const matches=[...state.eligible.values()].filter(c=>norm(c.name)===query);
 const match=matches[0]||[...state.eligible.values()].find(c=>norm(c.name).startsWith(query));
 if(match)choose(match.iso2);
 else notice("País não encontrado entre aqueles com seções brasileiras confirmadas no cadastro consultado.","warn");
}
(async()=>{
 setup();
 try{
   await loadGeography();
   const active=await fetchActiveSections();
   applyEligibility(active);
   $("landNotice").textContent="Cadastros confirmados: "+state.eligible.size+" países com "+state.activeCityCount+" localidades de votação. Países sem seções ficam neutros.";
   await fetchCountryResults(false);
 }catch(e){
   setStatus("Erro no cadastro eleitoral","warn");
   notice("Não foi possível confirmar os locais de votação pelo TSE: "+e.message+". Nenhum país será colorido sem essa verificação.","warn");
   $("landNotice").textContent="Falha na verificação de locais habilitados. Atualize a página para tentar novamente.";
 }
})();
