(() => {
"use strict";

const FILTERS = [
  {key:"country", id:"country-filter", label:"All countries"},
  {key:"city", id:"city-filter", label:"All cities"},
  {key:"place_type", id:"place-filter", label:"All place types"},
  {key:"with_group", id:"group-filter", label:"All groups"},
  {key:"subject_type", id:"subject-filter", label:"All subjects"},
  {key:"people_visible", id:"people-filter", label:"All people"}
];

const EMOTION_COLORS = {
  joy:"var(--emotion-joy)",
  trust:"var(--emotion-trust)",
  fear:"var(--emotion-fear)",
  surprise:"var(--emotion-surprise)",
  sadness:"var(--emotion-sadness)",
  disgust:"var(--emotion-disgust)",
  anger:"var(--emotion-anger)",
  anticipation:"var(--emotion-anticipation)"
};

const state = {
  data: [],
  filters: Object.fromEntries(FILTERS.map(f => [f.key,"all"])),
  cards: [],
  panX: 0,
  panY: 0,
  dragging: false,
  moved: false,
  suppressClick: false,
  pressedCard: null,
  pressedRow: null,
  startX: 0,
  startY: 0,
  startPanX: 0,
  startPanY: 0
};

const viewport = document.querySelector("#collage-viewport");
const world = document.querySelector("#collage-world");
const filterButton = document.querySelector("#filter-button");
const filterDrawer = document.querySelector("#filter-drawer");
const closeFilter = document.querySelector("#close-filter");
const resetFilters = document.querySelector("#reset-filters");
const filterCount = document.querySelector("#filter-count");
const status = document.querySelector("#status");
const backdrop = document.querySelector("#modal-backdrop");
const closeModal = document.querySelector("#close-modal");
const detailImage = document.querySelector("#detail-image");
const detailFallback = document.querySelector("#detail-image-fallback");
const modalImageWrap = document.querySelector(".modal-image-wrap");

FILTERS.forEach(f => f.el = document.querySelector("#"+f.id));

function init(){
  const raw = Array.isArray(window.PHOTO_DATA) ? window.PHOTO_DATA : [];
  state.data = raw.map(cleanRow).filter(Boolean);
  bindEvents();
  refreshDependentFilters();
  rebuildCollage();
  console.log("MOVE Photos v8:", state.data.length, "usable photographs");
}

function cleanRow(raw){
  const row = Object.fromEntries(Object.entries(raw||{}).map(([k,v]) => [String(k).trim(), typeof v==="string" ? v.trim() : v]));
  const photo_id = text(row.photo_id ?? row.Photo_id);
  const filename = text(row.filename ?? row.Filename);
  const datetime = parseDate(row.datetime ?? row.Datetime);
  if(!photo_id || !filename || !datetime) return null;
  return {
    photo_id, filename, datetime,
    country: normalizeCountry(text(row.country ?? row.Country,"Unspecified")),
    city: text(row.city ?? row.City,"Unspecified"),
    place_type: text(row.place_type ?? row["Place Type"],"Unspecified"),
    with_group: text(row.with_group ?? row["With Group"],"Unspecified"),
    subject_type: text(row.subject_type ?? row["Subject Type"],"Unspecified"),
    people_visible: text(row.people_visible ?? row["People Visible"],"Unspecified"),
    emotion: text(row.emotion ?? row.Emotion,"Unspecified"),
    emotion_score: parseScore(row.emotion_score ?? row.Value)
  };
}

function text(v,f=""){ if(v===null||v===undefined) return f; const s=String(v).trim(); return s||f; }
function parseDate(v){ const s=text(v); if(!s) return null; const d=new Date(s.includes(" ")&&!s.includes("T")?s.replace(" ","T"):s); return Number.isNaN(d.getTime())?null:d; }
function parseScore(v){ const s=text(v); if(!s) return null; const n=Number(s); return Number.isFinite(n)?Math.max(-5,Math.min(5,n)):null; }
function normalizeCountry(v){ if(/^(us|usa|united states|united states of america)$/i.test(v)) return "USA"; if(/^(south korea|republic of korea)$/i.test(v)) return "Korea"; return v; }

function bindEvents(){
  filterButton.addEventListener("click",()=>setFilterOpen(true));
  closeFilter.addEventListener("click",()=>setFilterOpen(false));

  resetFilters.addEventListener("click",()=>{
    FILTERS.forEach(f => state.filters[f.key]="all");
    refreshDependentFilters();
    rebuildCollage();
  });

  FILTERS.forEach(f=>{
    f.el.addEventListener("change",e=>{
      state.filters[f.key]=e.target.value;
      if(f.key==="country"){
        const allowed = new Set(state.data.filter(d=>state.filters.country==="all" || d.country===state.filters.country).map(d=>d.city));
        if(state.filters.city!=="all" && !allowed.has(state.filters.city)) state.filters.city="all";
      }
      refreshDependentFilters();
      rebuildCollage();
    });
  });

  viewport.addEventListener("pointerdown",e=>{
    if(e.button!==0 || filterDrawer.classList.contains("is-open") || !backdrop.hidden) return;

    const card = e.target.closest(".collage-photo");

    state.dragging=true;
    state.moved=false;
    state.suppressClick=false;
    state.pressedCard=card || null;
    state.pressedRow=card?._photoRow || null;

    state.startX=e.clientX;
    state.startY=e.clientY;
    state.startPanX=state.panX;
    state.startPanY=state.panY;

    viewport.classList.add("is-dragging");
    viewport.setPointerCapture?.(e.pointerId);
  });

  window.addEventListener("pointermove",e=>{
    if(!state.dragging) return;

    const dx=e.clientX-state.startX;
    const dy=e.clientY-state.startY;

    if(Math.hypot(dx,dy)>7){
      state.moved=true;
      state.suppressClick=true;
    }

    state.panX=state.startPanX+dx;
    state.panY=state.startPanY+dy;
    renderCards();
  });

  window.addEventListener("pointerup",e=>{
    if(!state.dragging) return;

    const wasClick = !state.moved && state.pressedCard && state.pressedRow;
    const selectedRow = state.pressedRow;

    state.dragging=false;
    viewport.classList.remove("is-dragging");
    viewport.releasePointerCapture?.(e.pointerId);

    state.pressedCard=null;
    state.pressedRow=null;

    if(wasClick){
      /*
        Open the photo here instead of relying on the browser's synthetic
        click event. Pointer capture is useful for dragging, but it can swallow
        the later click event in Chrome. This guarantees a normal mouse click
        opens the selected photograph while real drags still pan the collage.
      */
      openDetail(selectedRow);
    }

    state.suppressClick=false;
    state.moved=false;
  });

  viewport.addEventListener("wheel",e=>{
    if(filterDrawer.classList.contains("is-open") || !backdrop.hidden) return;
    e.preventDefault();
    state.panX -= Math.abs(e.deltaX)>1 ? e.deltaX : e.deltaY*.45;
    state.panY -= e.deltaY*.35;
    renderCards();
  },{passive:false});

  closeModal.addEventListener("click",closeDetail);
  backdrop.addEventListener("click",e=>{ if(e.target===backdrop) closeDetail(); });
  window.addEventListener("resize",renderCards);
  window.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      if(!backdrop.hidden) closeDetail();
      else if(filterDrawer.classList.contains("is-open")) setFilterOpen(false);
    }
  });
}

function setFilterOpen(open){
  filterDrawer.classList.toggle("is-open",open);
  filterDrawer.setAttribute("aria-hidden",String(!open));
  filterButton.setAttribute("aria-expanded",String(open));
}

function refreshDependentFilters(){
  FILTERS.forEach(config=>{
    const rows = state.data.filter(row => FILTERS.every(other=>{
      if(other.key===config.key) return true;
      return state.filters[other.key]==="all" || row[other.key]===state.filters[other.key];
    }));

    const values = [...new Set(rows.map(r=>r[config.key]).filter(v=>v&&v!=="Unspecified"))].sort((a,b)=>String(a).localeCompare(String(b)));
    if(state.filters[config.key]!=="all" && !values.includes(state.filters[config.key])) state.filters[config.key]="all";

    config.el.innerHTML="";
    const all=document.createElement("option");
    all.value="all"; all.textContent=config.label;
    config.el.appendChild(all);
    values.forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; config.el.appendChild(o); });
    config.el.value=state.filters[config.key];
  });
}

function filteredRows(){
  return state.data.filter(row => FILTERS.every(f=>state.filters[f.key]==="all" || row[f.key]===state.filters[f.key]));
}

/* WORKING DIRECT-VIEWPORT GRID */
const SAFE_LEFT = 0;
const COLS = 7;
const CELL_W = 220;
const CELL_H = 190;
const GAP = 0;

function rebuildCollage(){
  const rows=filteredRows();
  world.innerHTML="";
  state.cards=[];
  state.panX=0;
  state.panY=0;

  filterCount.textContent=`${rows.length.toLocaleString()} photographs`;
  status.textContent=activeFilterLabel(rows.length);

  if(!rows.length){
    const empty=document.createElement("div");
    empty.className="tile-fallback";
    empty.style.cssText=`position:absolute;left:${SAFE_LEFT+20}px;top:20px;width:260px;height:170px`;
    empty.textContent="No photographs match these filters.";
    world.appendChild(empty);
    return;
  }

  const display = rows.length>84 ? evenlySample(rows,84) : rows;

  display.forEach((row,index)=>{
    const card=createPhotoCard(row);
    const col=index%COLS;
    const r=Math.floor(index/COLS);

    const wide = index%13===0;
    const tall = !wide && index%11===0;

    state.cards.push({
      el:card,
      row,
      baseX:SAFE_LEFT + col*CELL_W,
      baseY:20 + r*CELL_H,
      w:(wide?2:1)*CELL_W,
      h:(tall?2:1)*CELL_H
    });

    world.appendChild(card);
  });

  renderCards();
}

function renderCards(){
  const rowsNeeded=Math.max(1,Math.ceil(state.cards.length/COLS));

  /*
    The repeating collage width includes the full image grid.
    Photos are allowed to move underneath the left navigation mask.
    They only wrap after the ENTIRE card has moved beyond the viewport,
    so there is no abrupt "pop" when an edge crosses the nav area.
  */
  const worldW=COLS*CELL_W;
  const worldH=Math.max(rowsNeeded*CELL_H, window.innerHeight + CELL_H*2);

  state.cards.forEach(item=>{
    const rawX=item.baseX + state.panX;
    let x=mod(rawX + CELL_W, worldW) - CELL_W;
    let y=item.baseY + state.panY;

    // Wrap in both directions as soon as a grid column crosses an edge.
    // This keeps the archive continuous when dragging either left or right.
    if(x + item.w <= 0) x += worldW;

    // Smooth vertical wrapping only after the full card leaves the viewport.
    while(y + item.h < 0) y += worldH;
    while(y > window.innerHeight + worldH) y -= worldH;

    item.el.style.width=`${item.w}px`;
    item.el.style.height=`${item.h}px`;
    item.el.style.transform=`translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  });
}
function createPhotoCard(row){
  const card=document.createElement("button");
  card.type="button";
  card.className="collage-photo";
  card.setAttribute("aria-label",`Open ${row.photo_id}`);
  card._photoRow=row;

  const fallback=document.createElement("div");
  fallback.className="tile-fallback";
  fallback.innerHTML=`<strong>${escapeHtml(row.photo_id)}</strong><span>${escapeHtml(row.filename)}</span><small>image loading…</small>`;
  card.appendChild(fallback);

  const img=document.createElement("img");
  img.alt=row.photo_id;
  img.draggable=false;
  card.appendChild(img);

  loadImageWithFallbacks(
    img,
    row.filename,
    ()=>{
      img.remove();
      const s=fallback.querySelector("small");
      if(s) s.textContent="image not found in images/";
    },
    ()=>fallback.remove()
  );

  /*
    IMPORTANT:
    Handle pointer gestures ON THE CARD ITSELF and stop them from reaching
    the viewport drag handler. This fixes Chrome treating photo clicks only
    as archive drags.

    - press + release within 7px => open detail
    - move more than 7px => drag the whole collage
  */
  let cardDragging=false;
  let cardMoved=false;
  let sx=0, sy=0, startPanX=0, startPanY=0;

  card.addEventListener("pointerdown",e=>{
    if(e.button!==0 || filterDrawer.classList.contains("is-open") || !backdrop.hidden) return;

    e.stopPropagation();
    cardDragging=true;
    cardMoved=false;
    sx=e.clientX;
    sy=e.clientY;
    startPanX=state.panX;
    startPanY=state.panY;

    card.setPointerCapture?.(e.pointerId);
    viewport.classList.add("is-dragging");
  });

  card.addEventListener("pointermove",e=>{
    if(!cardDragging) return;

    e.stopPropagation();

    const dx=e.clientX-sx;
    const dy=e.clientY-sy;

    if(Math.hypot(dx,dy)>7) cardMoved=true;

    if(cardMoved){
      state.panX=startPanX+dx;
      state.panY=startPanY+dy;
      renderCards();
    }
  });

  card.addEventListener("pointerup",e=>{
    if(!cardDragging) return;

    e.stopPropagation();
    cardDragging=false;
    card.releasePointerCapture?.(e.pointerId);
    viewport.classList.remove("is-dragging");

    if(!cardMoved){
      openDetail(row);
    }
  });

  card.addEventListener("pointercancel",e=>{
    if(!cardDragging) return;
    e.stopPropagation();
    cardDragging=false;
    viewport.classList.remove("is-dragging");
  });

  // Keep keyboard access.
  card.addEventListener("keydown",e=>{
    if(e.key==="Enter" || e.key===" "){
      e.preventDefault();
      openDetail(row);
    }
  });

  return card;
}
function imageCandidates(filename){
  const raw=String(filename||"");
  const dot=raw.lastIndexOf(".");
  const base=dot>=0?raw.slice(0,dot):raw;
  const ext=dot>=0?raw.slice(dot+1):"";
  return [...new Set([raw,`${base}.${ext.toLowerCase()}`,`${base}.${ext.toUpperCase()}`,`${base}.jpg`,`${base}.JPG`,`${base}.jpeg`,`${base}.JPEG`].filter(Boolean))];
}

function loadImageWithFallbacks(img,filename,fail,success){
  const list=imageCandidates(filename);
  let i=0;
  function next(){
    if(i>=list.length){ img.onerror=null; fail?.(); return; }
    img.onerror=next;
    img.src=imagePath(list[i++]);
  }
  img.onload=()=>{ img.onerror=null; success?.(); };
  next();
}

function openDetail(row){
  const emotionKey=String(row.emotion||"").trim().toLowerCase();
  modalImageWrap.style.backgroundColor=EMOTION_COLORS[emotionKey]||"#070707";

  document.querySelector("#detail-photo-id").textContent=row.photo_id;
  document.querySelector("#detail-date").textContent=formatDateTime(row.datetime);
  document.querySelector("#detail-location").textContent=[row.city,row.country].filter(Boolean).join(", ");
  document.querySelector("#detail-place").textContent=row.place_type;
  document.querySelector("#detail-group").textContent=row.with_group;
  document.querySelector("#detail-subject").textContent=row.subject_type;
  document.querySelector("#detail-people").textContent=row.people_visible;
  document.querySelector("#detail-emotion").textContent=row.emotion;
  document.querySelector("#detail-score").textContent=formatScore(row.emotion_score);

  detailFallback.hidden=true;
  detailImage.hidden=false;
  detailImage.alt=row.photo_id;

  loadImageWithFallbacks(detailImage,row.filename,
    ()=>{ detailImage.hidden=true; detailFallback.hidden=false; detailFallback.textContent=`Image not found: ${row.filename}`; }
  );

  backdrop.hidden=false;
}

function closeDetail(){
  backdrop.hidden=true;
  detailImage.src="";
  modalImageWrap.style.backgroundColor="#070707";
}
function imagePath(filename){ return `images/${encodeURIComponent(filename).replaceAll("%2F","/")}`; }
function formatDateTime(date){ return new Intl.DateTimeFormat("en",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date); }
function formatScore(value){ if(value===null || value===undefined || !Number.isFinite(value)) return "—"; return value>0?`+${value}`:String(value); }
function activeFilterLabel(count){ const active=FILTERS.map(f=>state.filters[f.key]==="all"?null:state.filters[f.key]).filter(Boolean); return active.length?`${count.toLocaleString()} photographs · ${active.join(" · ")}`:`${count.toLocaleString()} photographs`; }
function evenlySample(rows,n){ if(rows.length<=n) return rows; return Array.from({length:n},(_,i)=>rows[Math.floor(i*rows.length/n)]); }
function mod(v,n){ return ((v%n)+n)%n; }
function escapeHtml(value){ return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }


// Start only after every const used by rebuildCollage has been initialized.
init();

})();
