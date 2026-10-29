let activities=[], trips={}, mhData=[], cycleData=[], activitiesReady=false, mhReady=false;
let currentMypageMember="w";
let currentCardFilter="all"; // "all", "got", or "not"
let currentParticipation="full"; // "full", "partial", or "all"
let currentCatFilter="all";

// ===== ルーティング =====
function applyPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const el=document.getElementById(page);
  if(!el) return;
  el.classList.add("active");
  const lbl={top:"トップ",mypage:"マイページ",activities:"実績",progress:"進捗",manhole:"旅程",michinoeki:"道の駅",cycle:"自転車",rules:"規程",detail:"実績"};
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
  {cls:"b-mh",name:"マンホールカード"},{cls:"b-jiro",name:"二郎"},
  {cls:"b-road",name:"ロード"},{cls:"b-autumn",name:"秋季例大祭"},
  {cls:"b-meal",name:"食事"},{cls:"b-wedding",name:"結婚式"},
  {cls:"b-fishing",name:"釣り"},{cls:"b-marathon",name:"マラソン"},
  {cls:"b-travel",name:"旅行"},
  {cls:"b-o1"},{cls:"b-o2"},{cls:"b-o3"},{cls:"b-o4"}
];
let categoryClassMap={};
function hslColorForIndex(i){
  const hue=(i*137.508)%360;
  return {bg:`hsl(${hue.toFixed(0)},75%,94%)`,fg:`hsl(${hue.toFixed(0)},60%,34%)`};
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
    {name:"西川",distKey:"distW",joinKey:"joinedW",mhKey:"w",col:"var(--c-w)"},
    {name:"森角",distKey:"distM",joinKey:"joinedM",mhKey:"m",col:"var(--c-m)"},
    {name:"小林",distKey:"distK",joinKey:"joinedK",mhKey:"k",col:"var(--c-k)"}
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

    return `<div class="kpi-member-card" style="--mc:${mem.col}">
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
let openYears=null; // 開いている年（初回は最新年だけ開く）
function actYear(a){ const d=parseDate(a.date); return d?String(d.getFullYear()):"日付不明"; }
function toggleYear(y){
  if(openYears.has(y)) openYears.delete(y); else openYears.add(y);
  renderActTable();
}
function renderActTable(){
  const pastActs=activities.filter(a=>!isFutureDate(a.date));
  let list=filterByParticipation(pastActs,currentParticipation);
  if(currentCatFilter!=="all") list=list.filter(a=>a.cat===currentCatFilter);
  const sorted=[...list].reverse();

  // 年ごとにグループ化（新しい年が先）
  const groups=[];
  sorted.forEach(a=>{
    const y=actYear(a);
    let g=groups.find(x=>x.year===y);
    if(!g){ g={year:y,items:[]}; groups.push(g); }
    g.items.push(a);
  });
  if(openYears===null){
    const latest=pastActs.map(actYear).filter(y=>y!=="日付不明").sort().pop();
    openYears=new Set(latest?[latest]:[]);
  }
  const yearLabel=y=>y==="日付不明"?y:`${y}年`;

  document.getElementById("act-tbody").innerHTML=groups.map(g=>{
    const open=openYears.has(g.year);
    const head=`<tr class="year-row${open?' open':''}" onclick="toggleYear('${g.year}')">
      <td colspan="5"><span class="year-caret">›</span>${yearLabel(g.year)}<span class="year-count">${g.items.length}件</span></td></tr>`;
    if(!open) return head;
    return head+g.items.map(a=>`
    <tr>
      <td style="color:var(--text3);font-size:11px">${a.no}</td>
      <td style="font-size:11px;color:var(--text2);white-space:nowrap">${a.date}</td>
      <td class="badge-cell">${mkBadge(a.cat)}</td>
      <td class="title-cell">${a.title} ${mkParticipantPills(a)}</td>
      <td><button class="det-btn" onclick="showDetail(${a.no})">詳細</button></td>
    </tr>`).join("");
  }).join("")||"<tr><td colspan=\"5\" style=\"padding:20px;color:var(--text3);text-align:center\">該当なし</td></tr>";

  const card=a=>{
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
  };
  document.getElementById("act-list").innerHTML=groups.map(g=>{
    const open=openYears.has(g.year);
    return `<div class="year-head${open?' open':''}" onclick="toggleYear('${g.year}')"><span class="year-caret">›</span>${yearLabel(g.year)}<span class="year-count">${g.items.length}件</span></div>`
      +(open?g.items.map(card).join(""):"");
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
    if(!res[name]) res[name]={days:[],walica:"",date:parseDate(o["旅行日"]),sheetHidden:false};
    if(o["非表示"]&&o["非表示"].trim()) res[name].sheetHidden=true;
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
  sel.onchange=()=>{ renderTrip(sel.value); maybeScrollTripDone(); };
  renderTripSelector();
  maybeScrollTripDone();
}

// ===== 旅程: 年タブ（シートの「非表示」列に値がある旅行は出さない） =====
let currentTripYear=null;
function tripYear(name){ const d=trips[name]&&trips[name].date; return d?String(d.getFullYear()):"その他"; }
// 新しい旅行が先（日付がないものは最後）
function tripNamesSorted(){
  return Object.keys(trips).sort((a,b)=>{
    const da=trips[a].date, db=trips[b].date;
    if(da&&db) return db-da; if(da) return -1; if(db) return 1; return 0;
  });
}
function visibleTripNames(){
  return tripNamesSorted().filter(n=>!trips[n].sheetHidden);
}
function renderTripSelector(){
  const sel=document.getElementById("trip-sel");
  const names=visibleTripNames();
  const years=[...new Set(names.map(tripYear))];
  if(!years.length){
    document.getElementById("trip-year-tabs").innerHTML="";
    sel.innerHTML=`<option>表示できる旅行がありません</option>`; sel.disabled=true;
    document.getElementById("trip-stats").innerHTML="";
    document.getElementById("trip-day-tabs").innerHTML="";
    document.getElementById("trip-days").innerHTML=`<div class="loading" style="animation:none">表示できる旅行がありません</div>`;
    currentTripName=null; return;
  }
  sel.disabled=false;
  if(currentTripName&&names.includes(currentTripName)) currentTripYear=tripYear(currentTripName);
  if(!years.includes(currentTripYear)) currentTripYear=years[0];
  document.getElementById("trip-year-tabs").innerHTML=years.map(y=>{
    const n=names.filter(x=>tripYear(x)===y).length;
    return `<button type="button" class="trip-year-tab${y===currentTripYear?' active':''}" onclick="selectTripYear('${y}')">${y==="その他"?y:y+"年"}<span class="tab-frac">${n}</span></button>`;
  }).join("");
  const inYear=names.filter(n=>tripYear(n)===currentTripYear);
  sel.innerHTML=inYear.map(n=>`<option value="${n}">${n}</option>`).join("");
  const target=inYear.includes(currentTripName)?currentTripName:inYear[0];
  sel.value=target;
  renderTrip(target);
}
function selectTripYear(y){
  currentTripYear=y;
  const names=visibleTripNames().filter(n=>tripYear(n)===y);
  currentTripName=null;
  if(names.length) renderTripSelector();
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
    ${data.walica?`<a class="stat-chip" href="${data.walica}" target="_blank" > Walica URL</a>`:''}`;

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
            <td style="font-size:12px;font-weight:600">${i.url?`<a href="${i.url}" target="_blank" style="color:var(--link);font-weight:700">${i.title}</a>`:i.title}</td>
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
function isSpot(i){ return !EXCLUDE.includes(i.city); }
function findTripFrontierDay(data){
  const idx=data.days.findIndex(day=>day.some(i=>isSpot(i)&&!i.done));
  return idx>=0?idx:0; // すべて済なら1日目
}
// 途中まで済の旅行だけ true（全部済・未着手は false）
function tripInProgress(data){
  let spots=0,done=0;
  data.days.forEach(day=>day.forEach(i=>{ if(isSpot(i)){spots++; if(i.done) done++;} }));
  return done>0&&done<spots;
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
  const data=currentTripName&&trips[currentTripName];
  if(!data||!tripInProgress(data)) return;
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

// ===== MICHINOEKI (道の駅切符) =====
let michinoekiData=[];
async function loadMichinoeki(){
  let r;
  try{ r=await fetchCSV(URL_MICHINOEKI); }
  catch(e){ document.getElementById("michinoeki-body").innerHTML=`<div class="loading">道の駅データの読み込みに失敗しました</div>`; return; }
  michinoekiData=r.data.filter(d=>d["道の駅名"]&&d["道の駅名"].trim()).map((d,i)=>({
    no:i+1,pref:d["都道府県"]||"",city:d["市区町村"]||"",name:d["道の駅名"]||"",
    got:!!(d["取得日"]&&d["取得日"].trim())
  }));
  renderMichinoeki();
}
function renderMichinoeki(){
  const total=michinoekiData.length;
  const gotCount=michinoekiData.filter(d=>d.got).length;
  const stats=`<div class="trip-stats">
    <div class="stat-chip">取得枚数 <strong>${gotCount}枚</strong></div>
  </div>`;

  const prefGroups={};
  michinoekiData.forEach(d=>{
    const name=normalizePrefName(d.pref)||"その他";
    if(!prefGroups[name]) prefGroups[name]=[];
    prefGroups[name].push(d);
  });
  const prefNames=Object.keys(prefGroups).sort((a,b)=>(PREF_CODE[a]||99)-(PREF_CODE[b]||99));

  const groupsHtml=prefNames.map(name=>{
    const all=prefGroups[name];
    const t=all.length;
    const g=all.filter(d=>d.got).length;
    const rows=all.map(d=>`<div class="mne-row${d.got?' got':''}">
        <div class="mne-info">
          <div class="mne-name">${d.name}</div>
          <div class="mne-city">${d.city||""}</div>
        </div>
        <span class="mh-card-status ${d.got?'st-got':'st-not'}">${d.got?'済':'未'}</span>
      </div>`).join("");
    return `<details class="mh-pref-group">
      <summary class="mh-pref-group-title">${name}<span class="mh-pref-group-frac">${t}枚</span></summary>
      <div class="mne-row-list">${rows}</div>
    </details>`;
  }).join("");

  document.getElementById("michinoeki-body").innerHTML=`${stats}<div id="mne-list">${groupsHtml||'<p style="font-size:12px;color:var(--text3)">道の駅データがありません</p>'}</div>`;
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
const MEMBERS=[{name:"西川",key:"w",col:"var(--c-w)",hex:"#2f6fe4",pillCls:"mpill-w"},{name:"森角",key:"m",col:"var(--c-m)",hex:"#14a463",pillCls:"mpill-m"},{name:"小林",key:"k",col:"var(--c-k)",hex:"#e5493a",pillCls:"mpill-k"}];

// ===== MYPAGE =====
function normalizePrefName(name){ return (name||"").trim().replace(/(都|府|県)$/,""); }
function starPoints(cx,cy,rOuter,rInner){
  const pts=[];
  for(let i=0;i<10;i++){const r=i%2===0?rOuter:rInner;const a=(Math.PI/5)*i-Math.PI/2;pts.push(`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`);}
  return pts.join(" ");
}
// バッジの状態: none(未取得) / progress(途中) / complete(全取得)
function badgeState(obtained,total){
  if(total>0&&obtained>=total) return "complete";
  return obtained>0?"progress":"none";
}
let _badgeUid=0;
// innerSVG内の塗りは currentColor を使うこと（状態に応じて色が変わる）
function badgeSVG(innerSVG,obtained,total,mc){
  const id="bg"+(++_badgeUid);
  const r=25,c=2*Math.PI*r;
  const pct=total>0?Math.max(0,Math.min(1,obtained/total)):0;
  const st=badgeState(obtained,total);
  if(st==="complete"){
    return `<svg viewBox="0 0 56 56" style="color:#4a3200">
      <defs>
        <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6cf"/><stop offset=".45" stop-color="#f7c948"/><stop offset="1" stop-color="#c58c0a"/></linearGradient>
        <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b0"/><stop offset="1" stop-color="#b37c00"/></linearGradient>
      </defs>
      <circle cx="28" cy="28" r="27" fill="url(#${id}r)"/>
      <circle cx="28" cy="28" r="23.5" fill="url(#${id}f)" stroke="#fff3c4" stroke-opacity=".7" stroke-width="1"/>
      <circle cx="28" cy="28" r="19.5" fill="none" stroke="#8a5f00" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="1.5 2"/>
      ${innerSVG}
    </svg>`;
  }
  const ring=st==="none"?"var(--text3)":(mc||"var(--accent)");
  const fg=st==="none"?"var(--text3)":"var(--text)";
  return `<svg viewBox="0 0 56 56" style="color:${fg}">
    <circle cx="28" cy="28" r="${r}" fill="var(--bg3)"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="3"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="${ring}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(pct*c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/>
    ${innerSVG}
  </svg>`;
}
const CROWN_SVG=`<svg class="badge-crown" viewBox="0 0 24 16" aria-hidden="true"><defs><linearGradient id="crownG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#e0a614"/></linearGradient></defs><path d="M2 14 L1 4 L7 8.5 L12 1.5 L17 8.5 L23 4 L22 14 Z" fill="url(#crownG)" stroke="#7a5200" stroke-width="1" stroke-linejoin="round"/><circle cx="12" cy="10" r="1.6" fill="#ff5f2e"/></svg>`;
const CROWN_MINI=`<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14 L1 4 L7 8.5 L12 1.5 L17 8.5 L23 4 L22 14 Z" fill="currentColor"/></svg>`;

function badgeItemHtml(innerSVG,label,g,mc,opts){
  opts=opts||{};
  const st=badgeState(g.obtained,g.total);
  const tag=opts.tag||"div";
  const attrs=opts.onclick?` type="button" onclick="${opts.onclick}" aria-label="${label} ${g.obtained}/${g.total}${st==='complete'?' コンプリート':''}"`:"";
  const foot=st==="complete"
    ?`<span class="comp-tag">COMPLETE</span>`
    :`<p class="badge-frac">${g.obtained}/${g.total}</p>`;
  return `<${tag} class="badge-item ${st}"${attrs}><div class="badge-circle">${st==="complete"?CROWN_SVG:""}${badgeSVG(innerSVG,g.obtained,g.total,mc)}</div><p class="badge-name">${label}</p>${foot}</${tag}>`;
}
function renderMypagePills(){
  const bar=document.getElementById("mypage-pills");
  if(!bar) return;
  bar.innerHTML=MEMBERS.map(mem=>`<button class="member-pill${mem.key===currentMypageMember?" active":""}" style="--mc:${mem.col}" onclick="selectMypageMember('${mem.key}')">${mem.name}</button>`).join("");
}
function selectMypageMember(key){ currentMypageMember=key; renderMyPage(); }
function setCardFilter(mode){ currentCardFilter=mode; renderMyPage(); }
function fmtRoundLabel(r){ return /^\d+$/.test(r)?`第${r}弾`:r; }
// 都道府県バッジをタップ → カード一覧の該当県を開いてスクロール
function jumpToPref(name){
  if(currentCardFilter!=="all"){ currentCardFilter="all"; renderMyPage(); }
  const el=document.querySelector(`.mh-pref-group[data-pref="${CSS.escape(name)}"]`);
  if(!el) return;
  el.open=true;
  el.scrollIntoView({behavior:prefersReduced()?"auto":"smooth",block:"start"});
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
function buildCardListHtml(key,mc){
  const filterDefs=[{mode:"all",label:"すべて"},{mode:"got",label:"取得済み"},{mode:"not",label:"未取得"}];
  const filterBar=`<div class="filter-bar">${filterDefs.map(f=>
    `<button class="filter-btn${currentCardFilter===f.mode?" active":""}" onclick="setCardFilter('${f.mode}')">${f.label}</button>`
  ).join("")}</div>`;

  const prefGroups={};
  mhData.forEach(d=>{
    const name=normalizePrefName(d.pref)||"その他";
    if(!prefGroups[name]) prefGroups[name]=[];
    prefGroups[name].push(d);
  });
  const prefNames=Object.keys(prefGroups).sort((a,b)=>(PREF_CODE[a]||99)-(PREF_CODE[b]||99));

  const groupsHtml=prefNames.map(name=>{
    const all=prefGroups[name];
    const total=all.length;
    const gotCount=all.filter(d=>d[key]).length;
    const comp=total>0&&gotCount>=total;
    const list=all.filter(d=>{
      if(currentCardFilter==="got") return d[key];
      if(currentCardFilter==="not") return !d[key];
      return true;
    });
    if(list.length===0) return "";
    const rows=list.map(d=>{
      const got=!!d[key];
      const thumb=d.imgUrl?`<img src="${d.imgUrl}" alt="" loading="lazy">`:'<div class="mh-card-thumb-ph">🕳️</div>';
      const roundLbl=d.round?`<span class="mh-card-round">${fmtRoundLabel(d.round)}</span>`:"";
      const codeLbl=d.code?`<span class="mh-card-code">${d.code}</span>`:"";
      return `<div class="mh-card-row${got?' got':''}">
        <div class="mh-card-thumb">${thumb}</div>
        <div class="mh-card-info">
          <div class="mh-card-city">${d.city||d.pref}</div>
          <div class="mh-card-meta">${codeLbl}${roundLbl}</div>
        </div>
        <span class="mh-card-status ${got?'st-got':'st-not'}">${got?'済':'未'}</span>
      </div>`;
    }).join("");
    const pct=total>0?Math.round(gotCount/total*100):0;
    return `<details class="mh-pref-group${comp?' complete':''}" data-pref="${name}">
      <summary class="mh-pref-group-title">${name}${comp?'<span class="comp-tag">COMPLETE</span>':''}<span class="mh-pref-mini"><i style="width:${pct}%"></i></span><span class="mh-pref-group-frac">${gotCount}/${total}</span></summary>
      <div class="mh-card-row-list">${rows}</div>
    </details>`;
  }).join("");

  return `<div class="badge-section"><div class="badge-section-head"><div class="sec-label">カード一覧</div></div>${filterBar}<div id="mh-card-list">${groupsHtml||'<p style="font-size:12px;color:var(--text3)">該当するカードがありません</p>'}</div></div>`;
}
function compCounterHtml(done,total){
  return `<span class="comp-counter">${CROWN_MINI}COMPLETE ${done}<span style="opacity:.6"> / ${total}</span></span>`;
}
function renderMyPage(){
  renderMypagePills();
  if(!mhReady) return;
  _badgeUid=0;
  const key=currentMypageMember;
  const mem=MEMBERS.find(m=>m.key===key)||MEMBERS[0];
  const mc=mem.col;
  const totalObtained=mhData.filter(d=>d[key]).length;
  const totalAll=mhData.length;

  // 都道府県
  const prefGroups={};
  mhData.forEach(d=>{if(!d.pref) return;const name=normalizePrefName(d.pref);if(!prefGroups[name]) prefGroups[name]={total:0,obtained:0};prefGroups[name].total++;if(d[key]) prefGroups[name].obtained++;});
  const prefNames=Object.keys(prefGroups).sort((a,b)=>(PREF_CODE[a]||99)-(PREF_CODE[b]||99));
  const prefComp=prefNames.filter(n=>badgeState(prefGroups[n].obtained,prefGroups[n].total)==="complete").length;
  const prefBadges=prefNames.map(name=>{
    const g=prefGroups[name];const shape=PREF_SHAPES[name];
    const shapeSvg=shape?`<svg x="15" y="15" width="26" height="26" viewBox="${shape.vb}" preserveAspectRatio="xMidYMid meet"><polygon points="${shape.p}" fill="currentColor"></polygon></svg>`:`<text x="28" y="32" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor">${name.slice(0,2)}</text>`;
    return badgeItemHtml(shapeSvg,name,g,mc,{tag:"button",onclick:`jumpToPref('${name}')`});
  }).join("");

  // 弾数
  const roundGroups={};
  mhData.forEach(d=>{const r=d.round;if(!r) return;if(!roundGroups[r]) roundGroups[r]={total:0,obtained:0};roundGroups[r].total++;if(d[key]) roundGroups[r].obtained++;});
  const roundKeys=Object.keys(roundGroups).sort((a,b)=>{const an=parseFloat(a),bn=parseFloat(b);if(!isNaN(an)&&!isNaN(bn)) return an-bn;return a.localeCompare(b,"ja");});
  const roundComp=roundKeys.filter(r=>badgeState(roundGroups[r].obtained,roundGroups[r].total)==="complete").length;
  const roundBadges=roundKeys.map(r=>{
    const g=roundGroups[r];
    const fs=r.length>=3?12:r.length===2?16:18;
    const numSvg=`<text x="28" y="${28+fs*0.36}" text-anchor="middle" font-family="Outfit,sans-serif" font-size="${fs}" font-weight="800" fill="currentColor">${r}</text>`;
    return badgeItemHtml(numSvg,fmtRoundLabel(r),g,mc);
  }).join("");

  // ヒーロー（総取得リング）
  const R=52,C=2*Math.PI*R,pct=totalAll>0?totalObtained/totalAll:0;
  const allComp=totalAll>0&&totalObtained>=totalAll;
  const ringCol=allComp?"var(--gold)":mc;
  const heroHtml=`<div class="mp-hero" style="--mc:${mc}">
    <div class="mp-ring">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--bg3)" stroke-width="9"/>
      <circle cx="60" cy="60" r="${R}" fill="none" stroke="${ringCol}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(pct*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)" style="filter:drop-shadow(0 0 6px ${mem.hex}88)"/></svg>
      <div class="mp-ring-center"><span class="mp-ring-num">${totalObtained}</span><span class="mp-ring-pct">${(pct*100).toFixed(1)}%</span></div>
    </div>
    <div>
      <div class="mp-name">${mem.name}<small>COLLECTOR</small></div>
      <div class="mp-sub">マンホールカード ${totalObtained} / ${totalAll} 枚 取得</div>
      <div class="mp-stats">
        <div class="mp-stat"><div class="mp-stat-label">取得枚数</div><div class="mp-stat-val">${totalObtained}<span class="unit">/${totalAll}</span></div></div>
        <div class="mp-stat gold"><div class="mp-stat-label">👑 県コンプ</div><div class="mp-stat-val">${prefComp}<span class="unit">/${prefNames.length}</span></div></div>
        <div class="mp-stat gold"><div class="mp-stat-label">👑 弾コンプ</div><div class="mp-stat-val">${roundComp}<span class="unit">/${roundKeys.length}</span></div></div>
      </div>
    </div>
  </div>`;

  const empty=t=>`<p style="font-size:12px;color:var(--text3)">${t}</p>`;
  const body=document.getElementById("mypage-body");
  body.style.setProperty("--mc",mc);
  body.innerHTML=`${heroHtml}
    <div class="badge-section"><div class="badge-section-head"><div class="sec-label">都道府県バッジ</div>${compCounterHtml(prefComp,prefNames.length)}</div><div class="badge-grid">${prefBadges||empty("データがありません")}</div></div>
    <div class="badge-section"><div class="badge-section-head"><div class="sec-label">弾数バッジ</div>${compCounterHtml(roundComp,roundKeys.length)}</div><div class="badge-grid">${roundBadges||empty("弾数データがありません")}</div></div>
    ${buildCardListHtml(key,mc)}`;
}

// ===== PROGRESS =====
let currentTab="area", currentSort="name";
function setSort(mode,btn){
  currentSort=mode;
  document.querySelectorAll(".sort-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); renderTab(currentTab);
}
function memberBarsHtml(members){
  const sorted=[...members].sort((a,b)=>b.cnt-a.cnt);
  return sorted.map(({name,cnt,col,pillCls,groupTotal})=>{
    const full=groupTotal>0&&cnt>=groupTotal;
    const w=groupTotal>0?Math.round(cnt/groupTotal*100):0;
    return `<div class="prog-row"><span class="mpill ${pillCls}">${name}</span><div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${w}%;background:${full?'linear-gradient(90deg,#fff1b8,var(--gold))':col}"></div></div><span class="prog-cnt">${cnt}</span><span class="rank-sub">/ ${groupTotal}</span>${full?'<span class="prog-full">COMP</span>':''}</div>`;
  }).join("");
}
function progBlockHtml(i,name,sub,total,members){
  return `<div class="prog-block"><div class="prog-head"><span class="prog-rank">${String(i+1).padStart(2,"0")}</span><span class="prog-name">${name}</span>${sub?`<span class="prog-area">${sub}</span>`:''}<span class="prog-total">全${total}枚</span></div>${memberBarsHtml(members)}</div>`;
}
function renderProgress(){
  renderTab(currentTab);
}
function renderTab(tab){ if(tab==="area") renderArea(); else renderPref(); }
function renderArea(){
  const areaData=AREAS.map(area=>{const sub=mhData.filter(d=>d.area===area);const n=sub.length;const members=MEMBERS.map(mem=>({...mem,cnt:sub.filter(d=>d[mem.key]).length,groupTotal:n}));return{name:area,total:n,members,sum:members.reduce((s,m)=>s+m.cnt,0)};});
  const sorted=currentSort==="name"?[...areaData]:currentSort==="asc"?[...areaData].sort((a,b)=>a.sum-b.sum):[...areaData].sort((a,b)=>b.sum-a.sum);
  document.getElementById("tab-area").innerHTML=sorted.map((a,i)=>progBlockHtml(i,a.name,"",a.total,a.members)).join("");
}
function renderPref(){
  const prefMap={};
  mhData.forEach(d=>{if(!d.pref) return;if(!prefMap[d.pref]) prefMap[d.pref]={pref:d.pref,area:d.area,total:0,w:0,m:0,k:0};prefMap[d.pref].total++;if(d.w) prefMap[d.pref].w++;if(d.m) prefMap[d.pref].m++;if(d.k) prefMap[d.pref].k++;});
  const prefData=Object.values(prefMap).map(p=>{const members=MEMBERS.map(mem=>({...mem,cnt:p[mem.key],groupTotal:p.total}));return{...p,members,sum:members.reduce((s,m)=>s+m.cnt,0)};});
  const sorted=currentSort==="name"?[...prefData].sort((a,b)=>{const ac=PREF_CODE[normalizePrefName(a.pref)]||99,bc=PREF_CODE[normalizePrefName(b.pref)]||99;return ac-bc;}):currentSort==="asc"?[...prefData].sort((a,b)=>a.sum-b.sum):[...prefData].sort((a,b)=>b.sum-a.sum);
  document.getElementById("tab-pref").innerHTML=sorted.map((p,i)=>progBlockHtml(i,p.pref,p.area,p.total,p.members)).join("");
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
loadTrip(); loadMH(); loadCycle(); loadMichinoeki();
renderMypagePills();
