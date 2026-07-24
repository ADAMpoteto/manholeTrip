let activities=[], trips={}, mhData=[], cycleData=[], activitiesReady=false, mhReady=false;
let currentMypageMember="w";
let currentParticipation="full"; // "full", "partial", or "all"
let currentCatFilter="all";

// ===== ルーティング =====
function applyPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const el=document.getElementById(page);
  if(!el) return;
  el.classList.add("active");
  const lbl={top:"トップ",mypage:"マイページ",activities:"実績",progress:"進捗",manhole:"旅程",cycle:"自転車",rules:"規程",detail:"実績"};
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.textContent.trim()===lbl[page]));
  window.scrollTo(0,0);
  if(page==="manhole"){
    if(currentTripName&&trips[currentTripName]) renderTrip(currentTripName,{resetDay:true});
    maybeScrollTripDone();
  }
}
function goto(page,push=true){
  applyPage(page);
  if(push){
    const hash="#"+page;
    if(location.hash!==hash) history.pushState({page},"",hash);
  }
}
function parseHash(){
  const h=(location.hash||"").replace(/^#/,"");
  if(!h) return {page:"top"};
  const m=h.match(/^detail-(\d+)$/);
  if(m) return {page:"detail",no:Number(m[1])};
  return {page:h};
}
window.addEventListener("popstate",e=>{
  const st=e.state||parseHash();
  if(st.page==="detail"&&st.no){
    if(activitiesReady) showDetail(st.no,false); else applyPage("detail");
  } else { applyPage(st.page||"top"); }
});
window.addEventListener("scroll",()=>{
  document.querySelector("nav").classList.toggle("scrolled",window.scrollY>4);
},{passive:true});

// ===== 日付ヘルパー =====
const TODAY=(()=>{const d=new Date();d.setHours(0,0,0,0);return d;})();
function parseDate(s){
  if(!s) return null;
  const m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(!m) return null;
  return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
}
function isFutureDate(d){
  const dt=parseDate(d); return dt&&dt>=TODAY;
}

// ===== バッジ色 =====
const BADGE_PALETTE=[
  {cls:"b-jiro",name:"二郎"},{cls:"b-mh",name:"マンホールカード"},
  {cls:"b-road",name:"ロード"},{cls:"b-meal",name:"食事"},
  {cls:"b-wedding",name:"結婚式"},
  {cls:"b-c6"},{cls:"b-c7"},{cls:"b-c8"},{cls:"b-c9"},{cls:"b-c10"},
  {cls:"b-c11"},{cls:"b-c12"},{cls:"b-c13"},{cls:"b-c14"}
];
let categoryClassMap={};
function hslColorForIndex(i){
  const hue=(i*137.508)%360;
  return {bg:`hsl(${hue.toFixed(0)},70%,93%)`,fg:`hsl(${hue.toFixed(0)},55%,33%)`};
}
function assignCategoryColors(cats){
  categoryClassMap={};
  const usedCls=new Set();
  cats.forEach(cat=>{const known=BADGE_PALETTE.find(p=>p.name===cat);if(known){categoryClassMap[cat]={cls:known.cls};usedCls.add(known.cls);}});
  let pi=0,overflowIdx=0;
  cats.forEach(cat=>{
    if(categoryClassMap[cat]) return;
    while(pi<BADGE_PALETTE.length&&usedCls.has(BADGE_PALETTE[pi].cls)) pi++;
    if(pi<BADGE_PALETTE.length){categoryClassMap[cat]={cls:BADGE_PALETTE[pi].cls};usedCls.add(BADGE_PALETTE[pi].cls);pi++;}
    else{categoryClassMap[cat]={style:hslColorForIndex(overflowIdx)};overflowIdx++;}
  });
}
function mkBadge(c){
  const m=categoryClassMap[c];
  if(m&&m.cls) return `<span class="badge ${m.cls}">${c}</span>`;
  if(m&&m.style) return `<span class="badge" style="background:${m.style.bg};color:${m.style.fg}">${c}</span>`;
  return `<span class="badge b-other">${c}</span>`;
}

// ===== 参加者ピル =====
function mkParticipantPills(a){
  const ms=[{name:"西川",j:a.joinedW},{name:"森角",j:a.joinedM},{name:"小林",j:a.joinedK}];
  return `<span class="p-pills">${ms.map(m=>
    `<span class="p-pill ${m.j?'p-in':'p-out'}">${m.name}</span>`
  ).join("")}</span>`;
}

// ===== CSV =====
async function fetchCSV(url){
  const res=await fetch(url);
  const text=await res.text();
  return new Promise(resolve=>Papa.parse(text,{header:true,skipEmptyLines:true,complete:resolve}));
}

// ===== ACTIVITY =====
async function loadActivity(){
  let r;
  try{ r=await fetchCSV(URL_ACT); }
  catch(e){ document.getElementById("kpi-section").innerHTML=`<div class="loading">活動データの読み込みに失敗しました</div>`; return; }
  activities=r.data.filter(d=>d.No&&/^\d+$/.test(d.No.trim())).map(d=>{
    const rawW=(d["西川"]||"").trim();
    const rawM=(d["森角"]||"").trim();
    const rawK=(d["小林"]||"").trim();
    const joinedW=rawW!=="×";
    const joinedM=rawM!=="×";
    const joinedK=rawK!=="×";
    const distW=joinedW&&rawW!==""&&!isNaN(parseFloat(rawW))?rawW:"";
    const distM=joinedM&&rawM!==""&&!isNaN(parseFloat(rawM))?rawM:"";
    const distK=joinedK&&rawK!==""&&!isNaN(parseFloat(rawK))?rawK:"";
    return {
      no:Number(d.No),date:d["日付"]||"",cat:d["分類"]||"",
      title:d["活動内容"]||"",
      distW,distM,distK,
      distBike:d["自転車"]||"",
      comment:d["コメント"]||"",
      joinedW,joinedM,joinedK,
      joinedCount:(joinedW?1:0)+(joinedM?1:0)+(joinedK?1:0),
      allJoined:joinedW&&joinedM&&joinedK
    };
  });

  const cats=[...new Set(activities.map(a=>a.cat).filter(Boolean))];
  assignCategoryColors(cats);
  const bar=document.getElementById("filter-bar");
  cats.forEach(cat=>{
    const btn=document.createElement("button");
    btn.className="filter-btn";
    btn.textContent=cat;
    btn.onclick=function(){filterAct(cat,this);};
    bar.appendChild(btn);
  });
  renderTopKPIs();
  renderTop();
  renderActTable();
}

// ===== KPIセクション描画 =====
function buildKPIHtml(acts,mode){
  const MKEYS=[
    {name:"西川",distKey:"distW",joinKey:"joinedW",mhKey:"w"},
    {name:"森角",distKey:"distM",joinKey:"joinedM",mhKey:"m"},
    {name:"小林",distKey:"distK",joinKey:"joinedK",mhKey:"k"}
  ];
  const actCount=acts.length;
  const actCard=`<div class="kpi-act-card"><div class="kpi-label">活動回数</div><div class="kpi-val">${actCount}<span class="kpi-unit"> 回</span></div></div>`;

  const memberCards=MKEYS.map(mem=>{
    const joinCount=acts.filter(a=>a[mem.joinKey]).length;
    const driven=acts.filter(a=>a[mem.distKey]&&a[mem.distKey].trim()!=="");
    const totalDist=driven.reduce((s,a)=>{const v=parseFloat(a[mem.distKey]);return s+(isNaN(v)?0:v);},0);
    const mhCount=mhReady?mhData.filter(d=>d[mem.mhKey]).length:"—";

    // 全員参加モードでは参加=100%が自明なので省略
    const joinRow=mode==="full"?"":
      `<div class="kpi-member-section-label">参加</div>
      <div class="kpi-member-val">${joinCount}<span class="unit"> / ${actCount}回</span></div>
      <hr class="kpi-member-divider">`;

    return `<div class="kpi-member-card">
      <div class="kpi-member-name">${mem.name}</div>
      <div class="kpi-member-section-label">取得</div>
      <div class="kpi-member-val">${mhCount}<span class="unit">枚</span></div>
      <hr class="kpi-member-divider">
      ${joinRow}
      <div class="kpi-member-section-label">運転</div>
      <div class="kpi-member-val">${driven.length}<span class="unit">回</span></div>
      <div class="kpi-member-val">${totalDist.toFixed(1)}<span class="unit">km</span></div>
    </div>`;
  }).join("");

  return actCard+`<div class="kpi-members">${memberCards}</div>`;
}

let currentKPIMode="full"; // "all" or "full"

function filterByParticipation(acts,mode){
  if(mode==="full") return acts.filter(a=>a.allJoined);
  if(mode==="partial") return acts.filter(a=>a.joinedCount===2);
  return acts;
}

function toggleKPI(mode,btn){
  currentKPIMode=mode;
  document.querySelectorAll("#kpi-toggle .filter-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderTopKPIs();
}

function renderTopKPIs(){
  if(!activities.length) return;
  const pastAll=activities.filter(a=>!isFutureDate(a.date));
  const acts=filterByParticipation(pastAll,currentKPIMode);
  document.getElementById("kpi-section").innerHTML=buildKPIHtml(acts,currentKPIMode);
}

// ===== TOP ページ =====
function renderTop(){
  const upcoming=activities.filter(a=>isFutureDate(a.date))
    .sort((a,b)=>parseDate(a.date)-parseDate(b.date)).slice(0,5);
  if(upcoming.length){
    document.getElementById("top-upcoming").innerHTML=upcoming.map(a=>`
      <div class="upcoming-row">
        <span class="upcoming-date">${a.date}</span>
        <div class="rec-badge">${mkBadge(a.cat)}</div>
        <span class="upcoming-title">${a.title}</span>
      </div>`).join("");
  } else {
    document.getElementById("top-upcoming").innerHTML=`<div class="upcoming-empty">予定はありません</div>`;
  }

  const recent=activities.filter(a=>!isFutureDate(a.date)).reverse().slice(0,5);
  document.getElementById("top-recent").innerHTML=recent.map(a=>{
    const subParts=[];
    if(a.distW) subParts.push(`西川：${a.distW}km`);
    if(a.distM) subParts.push(`森角：${a.distM}km`);
    if(a.distK) subParts.push(`小林：${a.distK}km`);
    if(a.distBike) subParts.push(`自転車：${a.distBike}km`);
    return `
    <div class="act-card" onclick="showDetail(${a.no})">
      <div class="act-card-left">
        <div class="act-card-meta">
          <span class="act-card-no">No.${a.no}</span>
          <span class="act-card-date">${a.date}</span>
          ${mkBadge(a.cat)}
          ${mkParticipantPills(a)}
        </div>
        <div class="act-card-title">${a.title}</div>
        ${subParts.length?`<div class="act-card-sub">${subParts.join('　')}</div>`:''}
      </div>
      <div class="act-card-arrow">›</div>
    </div>`;
  }).join("");
}

// ===== 実績ページ =====
function filterParticipation(mode,btn){
  currentParticipation=mode;
  document.querySelectorAll("#participation-bar .filter-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderActTable();
}
function filterAct(cat,btn){
  currentCatFilter=cat;
  document.querySelectorAll("#filter-bar .filter-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderActTable();
}
function renderActTable(){
  const pastActs=activities.filter(a=>!isFutureDate(a.date));
  let list=filterByParticipation(pastActs,currentParticipation);
  if(currentCatFilter!=="all") list=list.filter(a=>a.cat===currentCatFilter);
  const sorted=[...list].reverse();

  document.getElementById("act-tbody").innerHTML=sorted.map(a=>`
    <tr>
      <td style="color:var(--text3);font-size:11px">${a.no}</td>
      <td style="font-size:11px;color:var(--text2);white-space:nowrap">${a.date}</td>
      <td class="badge-cell">${mkBadge(a.cat)}</td>
      <td class="title-cell">${a.title} ${mkParticipantPills(a)}</td>
      <td><button class="det-btn" onclick="showDetail(${a.no})">詳細</button></td>
    </tr>`).join("")||"<tr><td colspan=\"5\" style=\"padding:20px;color:var(--text3);text-align:center\">該当なし</td></tr>";

  document.getElementById("act-list").innerHTML=sorted.map(a=>{
    const subParts=[];
    if(a.distW) subParts.push(`西川：${a.distW}km`);
    if(a.distM) subParts.push(`森角：${a.distM}km`);
    if(a.distK) subParts.push(`小林：${a.distK}km`);
    if(a.distBike) subParts.push(`自転車：${a.distBike}km`);
    return `
    <div class="act-card" onclick="showDetail(${a.no})">
      <div class="act-card-left">
        <div class="act-card-meta">
          <span class="act-card-no">No.${a.no}</span>
          <span class="act-card-date">${a.date}</span>
          ${mkBadge(a.cat)}
          ${mkParticipantPills(a)}
        </div>
        <div class="act-card-title">${a.title}</div>
        ${subParts.length?`<div class="act-card-sub">${subParts.join('　')}</div>`:''}
      </div>
      <div class="act-card-arrow">›</div>
    </div>`;
  }).join("")||"<div style=\"padding:20px;color:var(--text3);text-align:center\">該当なし</div>";
}

// ===== 詳細ページ =====
function goBackFromDetail(){
  if(history.state&&history.state.page==="detail"&&history.length>1){ history.back(); }
  else { goto("activities"); }
}
function showDetail(no,push=true){
  const a=activities.find(x=>x.no===no); if(!a) return;
  document.getElementById("det-title").textContent=a.title;
  document.getElementById("det-date").textContent=a.date;
  document.getElementById("det-badge").innerHTML=mkBadge(a.cat);

  // 参加者
  const ms=[{name:"西川",j:a.joinedW},{name:"森角",j:a.joinedM},{name:"小林",j:a.joinedK}];
  document.getElementById("det-participants").innerHTML=`
    <div class="det-participants">
      <div class="det-info-label">参加者</div>
      <div class="p-pills">${ms.map(m=>
        `<span class="p-pill ${m.j?'p-in':'p-out'}" style="font-size:12px;padding:4px 10px">${m.name}${m.j?'':'　×'}</span>`
      ).join("")}</div>
    </div>`;

  // 距離
  const infoItems=[];
  if(a.distW) infoItems.push(`<div class="det-info-item"><div class="det-info-label">西川</div><div class="det-info-val">${a.distW} km</div></div>`);
  if(a.distM) infoItems.push(`<div class="det-info-item"><div class="det-info-label">森角</div><div class="det-info-val">${a.distM} km</div></div>`);
  if(a.distK) infoItems.push(`<div class="det-info-item"><div class="det-info-label">小林</div><div class="det-info-val">${a.distK} km</div></div>`);
  if(a.distBike) infoItems.push(`<div class="det-info-item"><div class="det-info-label">自転車</div><div class="det-info-val">${a.distBike} km</div></div>`);
  const grid=document.getElementById("det-info-grid");
  grid.innerHTML=infoItems.join("");
  grid.style.display=infoItems.length?"grid":"none";

  const commentEl=document.getElementById("det-comment");
  const raw=a.comment||"（コメントは後で追加予定）";
  let first=true;
  commentEl.innerHTML=raw.replace(/#/g,()=>{if(first){first=false;return '#';}return '<br>#';});
  applyPage("detail");
  if(push){
    const hash="#detail-"+no;
    if(location.hash!==hash) history.pushState({page:"detail",no},"",hash);
  }
}

// ===== TRIP =====
const EXCLUDE=["徒歩","電車","新幹線","朝食","昼食","夕食","ホテル","観光","ー"];
let currentTripName=null, currentTripDay=0;
async function loadTrip(){
  let r;
  try{ r=await fetchCSV(URL_TRIP); }
  catch(e){ document.getElementById("trip-days").innerHTML=`<div class="loading">旅程データの読み込みに失敗しました</div>`; return; }
  const res={};
  r.data.forEach(o=>{
    if(!o["旅行日"]||!o["旅行日"].trim()) return;
    const name=`${o["旅行日"]} ${o["旅行タイトル"]}`;
    const day=Number(o["何日目"]);
    if(!res[name]) res[name]={days:[],walica:""};
    if(!res[name].walica && o["Walica"] && o["Walica"].trim()) res[name].walica=o["Walica"].trim();
    while(res[name].days.length<day) res[name].days.push([]);
    res[name].days[day-1].push({
      departure:o["出発時刻"]||"",arrival:o["到着時刻"]||"",
      distance:o["距離(km)"]||"",city:o["市区町村"]||"",
      title:o["訪問先名"]||"",time:o["営業時間"]||"",
      address:o["訪問先住所"]||"",url:o["URL"]||"",
      mhUrl:o["マンホールURL"]||"",done:o["収集済"]==="済"
    });
  });
  trips=res;
  const sel=document.getElementById("trip-sel");
  sel.innerHTML=Object.keys(trips).map(n=>`<option value="${n}">${n}</option>`).join("");
  sel.onchange=()=>{ renderTrip(sel.value); maybeScrollTripDone(); };
  if(sel.options.length) renderTrip(sel.value);
  maybeScrollTripDone();
}
function renderTrip(name, opts){
  opts=opts||{};
  const data=trips[name]; if(!data) return;
  const isNewTrip = name!==currentTripName;
  currentTripName=name;
  if(opts.day!=null){currentTripDay=opts.day;}
  else if(isNewTrip||opts.resetDay){const f=findTripFrontierDay(data);currentTripDay=(f!=null)?f:0;}
  if(currentTripDay<0) currentTripDay=0;
  if(currentTripDay>data.days.length-1) currentTripDay=data.days.length-1;

  let dist=0,spots=0,done=0;
  data.days.forEach(day=>day.forEach(i=>{
    const d=parseFloat(i.distance); if(!isNaN(d)) dist+=d;
    if(!EXCLUDE.includes(i.city)){spots++; if(i.done) done++;}
  }));
  document.getElementById("trip-stats").innerHTML=`
    <div class="stat-chip">総距離 <strong>${dist.toFixed(1)} km</strong></div>
    <div class="stat-chip">訪問予定 <strong>${spots} 件</strong></div>
    <div class="stat-chip">収集済 <strong>${done} 枚</strong></div>
    ${data.walica?`<a class="stat-chip" href="${data.walica}" target="_blank" style="color:#1a4db0;font-weight:700;text-decoration:none"> Walica URL</a>`:''}`;

  document.getElementById("trip-day-tabs").innerHTML=data.days.map((day,idx)=>{
    let ds=0,dd=0;
    day.forEach(i=>{ if(!EXCLUDE.includes(i.city)){ds++; if(i.done) dd++;} });
    const frac=ds>0?`<span class="tab-frac">${dd}/${ds}</span>`:'';
    const dot=dd>0?`<span class="tab-dot"></span>`:'';
    return `<button class="trip-day-tab${idx===currentTripDay?' active':''}" onclick="selectTripDay(${idx})">${idx+1}日目${frac}${dot}</button>`;
  }).join("");

  document.getElementById("trip-days").innerHTML=data.days.map((day,idx)=>{
    let lastDone=-1;
    day.forEach((i,i2)=>{ if(i.done) lastDone=i2; });
    return `
    <div class="day-block${idx===currentTripDay?'':' hidden'}" data-day="${idx}">
      <div class="day-label">${idx+1}日目</div>
      <div class="tbl-wrap"><table class="trip-tbl">
        <thead><tr><th>No</th><th>済</th><th>出発</th><th>到着</th><th>距離</th><th>市区町村</th><th>目的地</th><th>営業時間</th><th>住所</th><th>GKP</th></tr></thead>
        <tbody>${day.map((i,i2)=>`
          <tr class="${i.done?'done':''}${i2===lastDone?' done-last':''}">
            <td style="color:var(--text3);font-size:11px">${i2+1}</td>
            <td>${i.done?'<span class="done-pill">済</span>':''}</td>
            <td style="font-size:12px;color:var(--text2);white-space:nowrap">${i.departure}</td>
            <td style="font-size:12px;color:var(--text2);white-space:nowrap">${i.arrival}</td>
            <td style="font-size:12px;color:var(--text2)">${i.distance}</td>
            <td style="font-size:12px">${i.city}</td>
            <td style="font-size:12px;font-weight:600">${i.url?`<a href="${i.url}" target="_blank" style="color:#1a4db0;font-weight:600">${i.title}</a>`:i.title}</td>
            <td style="font-size:11px;color:var(--text2);white-space:nowrap">${i.time}</td>
            <td style="font-size:11px"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.address)}" target="_blank" class="addr-link">${i.address}</a></td>
            <td>${i.mhUrl?`<a href="${i.mhUrl}" target="_blank" class="ext-link">↗</a>`:''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="trip-cards">${day.map((i,i2)=>{
        const timeRow=(i.departure||i.arrival||i.distance)?`${i.departure||''}～${i.arrival||''}${i.distance?`（${i.distance}km）`:''}`:'';
        const rows=[
          i.city?`<div class="trip-card-row"><span class="trip-card-label">市区町村</span><span class="trip-card-val muted">${i.city}</span></div>`:'',
          i.time?`<div class="trip-card-row"><span class="trip-card-label">営業時間</span><span class="trip-card-val muted">${i.time}</span></div>`:'',
          timeRow?`<div class="trip-card-row"><span class="trip-card-label">所要時間</span><span class="trip-card-val muted">${timeRow}</span></div>`:'',
          i.address?`<div class="trip-card-row"><span class="trip-card-label">住所</span><span class="trip-card-val"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.address)}" target="_blank">${i.address}</a></span></div>`:'',
          i.mhUrl?`<div class="trip-card-row"><span class="trip-card-label">GKP</span><span class="trip-card-val"><a href="${i.mhUrl}" target="_blank">↗ カード</a></span></div>`:'',
        ].filter(Boolean).join('');
        return`<div class="trip-card${i.done?' done':''}${i2===lastDone?' done-last':''}">
          <div class="trip-card-head">
            <span class="trip-card-no">${i2+1}</span>
            <span class="trip-card-title">${i.url?`<a href="${i.url}" target="_blank">${i.title}</a>`:i.title}</span>
            ${i.done?'<span class="trip-card-done">済</span>':''}
          </div>
          ${rows?`<div class="trip-card-body">${rows}</div>`:''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join("");
}
function findTripFrontierDay(data){
  let last=null;
  data.days.forEach((day,di)=>{ day.forEach(it=>{ if(it.done) last=di; }); });
  return last;
}
function selectTripDay(idx){
  if(!currentTripName) return;
  renderTrip(currentTripName,{day:idx});
  scrollTripToTop();
}
function prefersReduced(){
  return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function scrollTripToTop(){
  const anchor=document.getElementById("trip-day-tabs");
  if(!anchor) return;
  const nav=document.querySelector("nav");
  const navH=nav?nav.offsetHeight:0;
  const y=window.scrollY+anchor.getBoundingClientRect().top-navH-8;
  window.scrollTo({top:Math.max(0,y),behavior:prefersReduced()?"auto":"smooth"});
}
function scrollTripToDone(){
  const container=document.getElementById("trip-days");
  if(!container) return;
  const block=container.querySelector(".day-block:not(.hidden)");
  if(!block) return;
  let el=null;
  block.querySelectorAll(".done-last").forEach(m=>{ if(m.getClientRects().length) el=m; });
  if(!el) return;
  const nav=document.querySelector("nav");
  const navH=nav?nav.offsetHeight:0;
  const y=window.scrollY+el.getBoundingClientRect().top-navH-14;
  window.scrollTo({top:Math.max(0,y),behavior:prefersReduced()?"auto":"smooth"});
  el.classList.remove("trip-flash"); void el.offsetWidth; el.classList.add("trip-flash");
  setTimeout(()=>el.classList.remove("trip-flash"),1700);
}
function maybeScrollTripDone(){
  requestAnimationFrame(()=>requestAnimationFrame(scrollTripToDone));
}

// ===== CYCLE =====
async function loadCycle(){
  let r;
  try{ r=await fetchCSV(URL_CYCLE); }
  catch(e){ document.getElementById("cycle-body").innerHTML=`<div class="loading">読み込みに失敗しました</div>`; return; }
  const rows=r.data.map(o=>{
    const dest=(o["目的地"]||"").trim();
    const dist=(o["距離(km)"]||o["距離"]||"").trim();
    const dur=(o["所要時間(分)"]||o["所要時間"]||"").trim();
    let arrive=(o["到着時刻"]||o["時刻"]||o["到着"]||"").trim();
    if(!arrive){for(const k in o){if(["目的地","距離(km)","距離","所要時間(分)","所要時間"].includes(k)) continue;const v=(o[k]||"").trim();if(v){arrive=v;break;}}}
    return {dest,dist,dur,arrive};
  }).filter(x=>x.dest);
  cycleData=rows;
  const sel=document.getElementById("cycle-sel");
  sel.innerHTML=`<option value="all">姫路市立中学校 全校めぐり</option>`;
  sel.onchange=()=>renderCycle();
  renderCycle();
}
function fmtArrive(s){
  if(!s) return "";
  const m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if(!m) return s;
  return `${Number(m[1])}:${m[2]}`;
}
function subtractMinutes(timeStr,minStr){
  const m=(timeStr||"").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const mins=parseInt(minStr,10);
  if(!m||isNaN(mins)) return timeStr||"";
  let total=Number(m[1])*60+Number(m[2])-mins;
  if(total<0) total+=24*60;
  const h=Math.floor(total/60),mm=total%60;
  return `${h}:${String(mm).padStart(2,"0")}`;
}
function renderCycle(){
  const rows=cycleData;
  if(!rows.length){document.getElementById("cycle-body").innerHTML=`<div class="loading">データがありません</div>`;document.getElementById("cycle-hero").innerHTML="";return;}
  let totalDist=0,lunchCount=0;
  rows.forEach(i=>{const d=parseFloat(i.dist);if(!isNaN(d)) totalDist+=d;if(i.dest.includes("昼食")) lunchCount++;});
  const spots=rows.length-lunchCount;
  const lastArrive=fmtArrive(rows[rows.length-1].arrive);
  const startTime=fmtArrive(subtractMinutes(rows[0].arrive,rows[0].dur));
  document.getElementById("cycle-hero").innerHTML=`
    <div class="cycle-stat"><div class="cs-label">訪問先</div><div class="cs-val">${spots}<span class="cs-unit">校</span></div></div>
    <div class="cycle-stat"><div class="cs-label">総走行距離</div><div class="cs-val">${totalDist.toFixed(1)}<span class="cs-unit">km</span></div></div>
    <div class="cycle-stat"><div class="cs-label">行程</div><div class="cs-val" style="font-size:18px">${startTime}<span class="cs-unit" style="margin:0 4px">→</span>${lastArrive}</div></div>`;
  const tbl=`<div class="tbl-wrap"><table class="cycle-tbl">
    <thead><tr><th style="width:36px">No</th><th>目的地</th><th style="width:90px;text-align:right">距離(km)</th><th style="width:96px;text-align:right">所要時間</th><th style="width:90px;text-align:right">到着時刻</th></tr></thead>
    <tbody>${rows.map((i,idx)=>{const isLunch=i.dest.includes("昼食");return `<tr class="${isLunch?'lunch':''}"><td style="color:var(--text3);font-size:11px">${idx+1}</td><td class="dest-cell">${i.dest}${isLunch?'<span class="cc-lunch-tag">昼食</span>':''}</td><td class="num">${i.dist||'—'}</td><td class="num">${i.dur?i.dur+' 分':'—'}</td><td class="arrive-cell num">${fmtArrive(i.arrive)||'—'}</td></tr>`;}).join('')}</tbody></table></div>`;
  const cards=`<div class="cycle-cards">${rows.map((i,idx)=>{const isLunch=i.dest.includes("昼食");const isLast=idx===rows.length-1;return `<div class="cycle-card${isLunch?' lunch':''}"><div class="cc-time"><span class="cc-arrive">${fmtArrive(i.arrive)||'—'}</span><span class="cc-arrive-lbl">着</span></div><div class="cc-line"><span class="cc-dot${isLunch?' lunch':''}"></span>${isLast?'':'<span class="cc-bar"></span>'}</div><div class="cc-body"><span class="cc-no">No.${idx+1}</span><div class="cc-dest">${i.dest}${isLunch?'<span class="cc-lunch-tag">昼食</span>':''}</div><div class="cc-meta">${i.dist?`<span>距離 <b>${i.dist}km</b></span>`:''}${i.dur?`<span>所要 <b>${i.dur}分</b></span>`:''}</div></div></div>`;}).join('')}</div>`;
  document.getElementById("cycle-body").innerHTML=tbl+cards;
}

// ===== MH DATA =====
async function loadMH(){
  let r;
  try{ r=await fetchCSV(URL_MH); }
  catch(e){ document.getElementById("mypage-body").innerHTML=`<div class="loading">マンホールカードデータの読み込みに失敗しました</div>`; return; }
  mhData=r.data.filter(d=>d.No&&/^\d+$/.test(d.No.trim())).map(d=>({
    no:Number(d.No),area:d["エリア"]||"",pref:d["都道府県"]||"",city:d["市区町村"]||"",
    imgUrl:d["画像URL"]||"",code:d["コード"]||"",round:(d["弾数"]||"").trim(),
    w:!!(d["取得日"]&&d["取得日"].trim()),
    m:d["森角"]==="済",
    k:(d["小林"]||"").replace(/\r/,"").trim()==="済"
  }));
  renderProgress();
  mhReady=true;
  // KPIの取得枚数を更新
  renderTopKPIs();
  renderMyPage();
}

const AREAS=["北海道","東北","関東","中部","北陸","近畿","中国","四国","九州"];
const PREF_CODE={"北海道":1,"青森":2,"岩手":3,"宮城":4,"秋田":5,"山形":6,"福島":7,"茨城":8,"栃木":9,"群馬":10,"埼玉":11,"千葉":12,"東京":13,"神奈川":14,"新潟":15,"富山":16,"石川":17,"福井":18,"山梨":19,"長野":20,"岐阜":21,"静岡":22,"愛知":23,"三重":24,"滋賀":25,"京都":26,"大阪":27,"兵庫":28,"奈良":29,"和歌山":30,"鳥取":31,"島根":32,"岡山":33,"広島":34,"山口":35,"徳島":36,"香川":37,"愛媛":38,"高知":39,"福岡":40,"佐賀":41,"長崎":42,"熊本":43,"大分":44,"宮崎":45,"鹿児島":46,"沖縄":47};
const MEMBERS=[{name:"西川",key:"w",col:"#1a4db0",pillCls:"mpill-w"},{name:"森角",key:"m",col:"#1a7a1a",pillCls:"mpill-m"},{name:"小林",key:"k",col:"#b03a1a",pillCls:"mpill-k"}];

// ===== MYPAGE =====
function normalizePrefName(name){ return (name||"").trim().replace(/(都|府|県)$/,""); }
function starPoints(cx,cy,rOuter,rInner){
  const pts=[];
  for(let i=0;i<10;i++){const r=i%2===0?rOuter:rInner;const a=(Math.PI/5)*i-Math.PI/2;pts.push(`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`);}
  return pts.join(" ");
}
function badgeSVG(innerSVG,obtained,total){
  const r=25,c=2*Math.PI*r;
  const pct=total>0?Math.max(0,Math.min(1,obtained/total)):0;
  const dash=(pct*c).toFixed(1);
  const earned=obtained>0;
  const color=earned?"var(--text)":"var(--text3)";
  return `<svg viewBox="0 0 56 56" style="color:${color}"><circle cx="28" cy="28" r="${r}" fill="var(--bg2)"></circle><circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.5"></circle><circle cx="28" cy="28" r="${r}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${dash} ${c.toFixed(1)}" transform="rotate(-90 28 28)"></circle>${innerSVG}</svg>`;
}
function renderMypagePills(){
  const bar=document.getElementById("mypage-pills");
  if(!bar) return;
  bar.innerHTML=MEMBERS.map(mem=>`<button class="member-pill${mem.key===currentMypageMember?" active":""}" onclick="selectMypageMember('${mem.key}')">${mem.name}</button>`).join("");
}
function selectMypageMember(key){ currentMypageMember=key; renderMyPage(); }
function renderMyPage(){
  renderMypagePills();
  if(!mhReady) return;
  const key=currentMypageMember;
  const totalObtained=mhData.filter(d=>d[key]).length;
  const totalAll=mhData.length;
  const starSvg=`<polygon points="${starPoints(28,28,12,5)}" fill="currentColor"></polygon>`;
  const totalHtml=`<div class="mypage-total"><div class="badge-circle">${badgeSVG(starSvg,totalObtained,totalAll)}</div><div><div class="mypage-total-label">総取得枚数バッジ</div><div class="mypage-total-val">${totalObtained}<span class="unit"> / ${totalAll}枚</span></div></div></div>`;
  const prefGroups={};
  mhData.forEach(d=>{if(!d.pref) return;const name=normalizePrefName(d.pref);if(!prefGroups[name]) prefGroups[name]={total:0,obtained:0};prefGroups[name].total++;if(d[key]) prefGroups[name].obtained++;});
  const prefNames=Object.keys(prefGroups).sort((a,b)=>(PREF_CODE[a]||99)-(PREF_CODE[b]||99));
  const prefBadges=prefNames.map(name=>{
    const g=prefGroups[name];const earned=g.obtained>0;const shape=PREF_SHAPES[name];
    const shapeSvg=shape?`<svg x="14" y="14" width="28" height="28" viewBox="${shape.vb}"><polygon points="${shape.p}" fill="currentColor"></polygon></svg>`:"";
    return `<div class="badge-item${earned?" earned":""}"><div class="badge-circle">${badgeSVG(shapeSvg,g.obtained,g.total)}</div><p class="badge-name">${name}</p><p class="badge-frac">${g.obtained}/${g.total}</p></div>`;
  }).join("");
  const roundGroups={};
  mhData.forEach(d=>{const r=d.round;if(!r) return;if(!roundGroups[r]) roundGroups[r]={total:0,obtained:0};roundGroups[r].total++;if(d[key]) roundGroups[r].obtained++;});
  const roundKeys=Object.keys(roundGroups).sort((a,b)=>{const an=parseFloat(a),bn=parseFloat(b);if(!isNaN(an)&&!isNaN(bn)) return an-bn;return a.localeCompare(b,"ja");});
  const roundBadges=roundKeys.map(r=>{
    const g=roundGroups[r];const earned=g.obtained>0;const label=/^\d+$/.test(r)?`第${r}弾`:r;
    const numSvg=`<text x="28" y="33" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">${r}</text>`;
    return `<div class="badge-item${earned?" earned":""}"><div class="badge-circle">${badgeSVG(numSvg,g.obtained,g.total)}</div><p class="badge-name">${label}</p><p class="badge-frac">${g.obtained}/${g.total}</p></div>`;
  }).join("");
  document.getElementById("mypage-body").innerHTML=`${totalHtml}<div class="badge-section"><div class="badge-section-label">都道府県バッジ</div><div class="badge-grid">${prefBadges||'<p style="font-size:12px;color:var(--text3)">データがありません</p>'}</div></div><div class="badge-section"><div class="badge-section-label">弾数バッジ</div><div class="badge-grid">${roundBadges||'<p style="font-size:12px;color:var(--text3)">弾数データがありません</p>'}</div></div>`;
}

// ===== PROGRESS =====
let currentTab="area", currentSort="sum";
function setSort(mode,btn){
  currentSort=mode;
  document.querySelectorAll(".sort-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); renderTab(currentTab);
}
function memberBarsHtml(members){
  const sorted=[...members].sort((a,b)=>b.cnt-a.cnt);
  return sorted.map(({name,cnt,col,pillCls,groupTotal})=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:.5px solid var(--border);"><span class="mpill ${pillCls}" style="min-width:36px;text-align:center">${name}</span><div class="rank-bar-bg" style="flex:1;min-width:40px"><div class="rank-bar-fill" style="width:${groupTotal>0?Math.round(cnt/groupTotal*100):0}%;background:${col}"></div></div><span style="font-size:12px;font-weight:700;min-width:28px;text-align:right">${cnt}</span><span class="rank-sub">/ ${groupTotal}</span></div>`).join("");
}
function renderProgress(){
  const total=mhData.length;
  const wAll=mhData.filter(d=>d.w).length,mAll=mhData.filter(d=>d.m).length,kAll=mhData.filter(d=>d.k).length;
  document.getElementById("prog-stats").innerHTML=`<div class="stat-chip">総カード数 <strong>${total} 枚</strong></div><div class="stat-chip">西川 <strong>${wAll} 枚</strong></div><div class="stat-chip">森角 <strong>${mAll} 枚</strong></div><div class="stat-chip">小林 <strong>${kAll} 枚</strong></div>`;
  renderTab(currentTab);
}
function renderTab(tab){ if(tab==="area") renderArea(); else renderPref(); }
function renderArea(){
  const areaData=AREAS.map(area=>{const sub=mhData.filter(d=>d.area===area);const n=sub.length;const members=MEMBERS.map(mem=>({...mem,cnt:sub.filter(d=>d[mem.key]).length,groupTotal:n}));return{name:area,total:n,members,sum:members.reduce((s,m)=>s+m.cnt,0)};});
  const sorted=currentSort==="name"?[...areaData]:[...areaData].sort((a,b)=>b.sum-a.sum);
  document.getElementById("tab-area").innerHTML=sorted.map((a,i)=>`<div style="margin-bottom:20px;"><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;padding-bottom:6px;border-bottom:.5px solid var(--border);"><span style="font-size:11px;color:var(--text3);min-width:20px">${i+1}</span><span style="font-size:15px;font-weight:700">${a.name}</span></div><div style="padding-left:30px">${memberBarsHtml(a.members)}</div></div>`).join("");
}
function renderPref(){
  const prefMap={};
  mhData.forEach(d=>{if(!d.pref) return;if(!prefMap[d.pref]) prefMap[d.pref]={pref:d.pref,area:d.area,total:0,w:0,m:0,k:0};prefMap[d.pref].total++;if(d.w) prefMap[d.pref].w++;if(d.m) prefMap[d.pref].m++;if(d.k) prefMap[d.pref].k++;});
  const prefData=Object.values(prefMap).map(p=>{const members=MEMBERS.map(mem=>({...mem,cnt:p[mem.key],groupTotal:p.total}));return{...p,members,sum:members.reduce((s,m)=>s+m.cnt,0)};});
  const sorted=currentSort==="name"?[...prefData].sort((a,b)=>{const ac=PREF_CODE[normalizePrefName(a.pref)]||99,bc=PREF_CODE[normalizePrefName(b.pref)]||99;return ac-bc;}):[...prefData].sort((a,b)=>b.sum-a.sum);
  document.getElementById("tab-pref").innerHTML=sorted.map((p,i)=>`<div style="margin-bottom:20px;"><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;padding-bottom:6px;border-bottom:.5px solid var(--border);"><span style="font-size:11px;color:var(--text3);min-width:20px">${i+1}</span><span style="font-size:15px;font-weight:700">${p.pref}</span><span style="font-size:11px;color:var(--text3)">${p.area}</span></div><div style="padding-left:30px">${memberBarsHtml(p.members)}</div></div>`).join("");
}
function switchTab(tab,btn){
  currentTab=tab;
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  ["area","pref"].forEach(t=>{ document.getElementById(`tab-${t}`).style.display=t===tab?"block":"none"; });
  renderTab(tab);
}

// ===== 初期化 =====
(function initRouting(){
  const st=parseHash();
  history.replaceState({page:st.page,no:st.no},"",location.hash||"#top");
  if(st.page&&st.page!=="top"&&st.page!=="detail"){ applyPage(st.page); }
})();
loadActivity().then(()=>{
  activitiesReady=true;
  const st=parseHash();
  if(st.page==="detail"&&st.no){ showDetail(st.no,false); }
});
loadTrip(); loadMH(); loadCycle();
renderMypagePills();
