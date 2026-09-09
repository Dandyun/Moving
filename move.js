(() => {
  "use strict";

  const EMOTIONS = [
    { name:"Joy", color:"#f6c744" },
    { name:"Trust", color:"#6dbb4b" },
    { name:"Fear", color:"#1c9d50" },
    { name:"Surprise", color:"#39b7df" },
    { name:"Sadness", color:"#2d5daa" },
    { name:"Disgust", color:"#9b5aa5" },
    { name:"Anger", color:"#ed2f32" },
    { name:"Anticipation", color:"#f36f3f" }
  ];

  const raw = Array.isArray(window.PHOTO_DATA) ? window.PHOTO_DATA : [];
  const data = raw.map(cleanRow).filter(Boolean);

  const mapView = document.querySelector("#map-view");
  const locationView = document.querySelector("#location-view");
  const mapWrap = document.querySelector(".map-stage-wrap");
  const svg = document.querySelector("#movement-map");
  const tooltip = document.querySelector("#tooltip");
  const hoverPie = document.querySelector("#hover-pie");
  const hoverPieSvg = document.querySelector("#hover-pie-svg");
  const hoverPieTitle = document.querySelector("#hover-pie-title");
  const hoverPieSub = document.querySelector("#hover-pie-sub");

  const state = {
    nodes: [],
    selectedIndex: 0,
    panX: 0,
    startX: 0,
    startPanX: 0,
    dragging: false
  };

  init();

  function cleanRow(raw){
    const row = Object.fromEntries(Object.entries(raw||{}).map(([k,v])=>[String(k).trim(), typeof v==="string" ? v.trim() : v]));
    const photo_id = text(row.Photo_id ?? row.photo_id);
    const filename = text(row.Filename ?? row.filename);
    if(!photo_id || !filename) return null;
    return {
      photo_id,
      filename,
      datetime:text(row.Datetime ?? row.datetime),
      country:normalizeCountry(text(row.Country ?? row.country,"Unknown")),
      city:text(row.City ?? row.city,"Unknown"),
      place_type:text(row["Place Type"] ?? row.place_type,"Unknown"),
      with_group:text(row["With Group"] ?? row.with_group,"Unknown"),
      subject_type:text(row["Subject Type"] ?? row.subject_type,"Unknown"),
      people_visible:text(row["People Visible"] ?? row.people_visible,"Unknown"),
      emotion:text(row.Emotion ?? row.emotion,"Unknown"),
      emotion_score:Number(row.Value ?? row.emotion_score)
    };
  }

  function text(v,f=""){ if(v===null||v===undefined) return f; const s=String(v).trim(); return s||f; }
  function normalizeCountry(v){ if(/^(us|usa|united states|united states of america)$/i.test(v)) return "USA"; return v; }

  function init(){
    buildNodes();
    drawMap();
    bindMapDrag();

    document.querySelector("#back-to-map").addEventListener("click", closeLocation);
    document.querySelector("#next-location").addEventListener("click", ()=>stepLocation(1));
  }

  function buildNodes(){
    const countries = [...new Set(data.map(d=>d.country))];

    const countryOrder = ["Korea","Japan","USA", ...countries.filter(c=>!["Korea","Japan","USA"].includes(c))];
    const orderedCountries = countryOrder.filter(c=>countries.includes(c));

    state.nodes = [];

    orderedCountries.forEach(country=>{
      const rows = data.filter(d=>d.country===country);
      state.nodes.push({
        id:`country:${country}`,
        type:"country",
        name:country,
        country,
        rows,
        count:rows.length
      });

      const cities = [...new Set(rows.map(d=>d.city))];
      cities.forEach(city=>{
        const cityRows = rows.filter(d=>d.city===city);
        state.nodes.push({
          id:`city:${country}:${city}`,
          type:"city",
          name:city,
          country,
          rows:cityRows,
          count:cityRows.length
        });
      });
    });
  }

  function drawMap(){
    const NS="http://www.w3.org/2000/svg";
    const width = Math.max(2500, 620 + state.nodes.filter(n=>n.type==="country").length*660);
    const height = 760;
    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    svg.style.width=`${width}px`;

    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const countries = state.nodes.filter(n=>n.type==="country");
    const countryX = new Map();

    countries.forEach((country,i)=>{
      countryX.set(country.name, 380 + i*720);
    });

    // Main country connector
    if(countries.length>1){
      const line = document.createElementNS(NS,"line");
      line.setAttribute("x1",countryX.get(countries[0].name));
      line.setAttribute("y1","380");
      line.setAttribute("x2",countryX.get(countries[countries.length-1].name));
      line.setAttribute("y2","380");
      line.setAttribute("class","map-link");
      svg.appendChild(line);
    }

    countries.forEach((country,cIndex)=>{
      const x=countryX.get(country.name);
      const children=state.nodes.filter(n=>n.type==="city"&&n.country===country.name);
      const positions = cityPositions(children.length,x);

      children.forEach((city,i)=>{
        const p=positions[i];
        const link=document.createElementNS(NS,"line");
        link.setAttribute("x1",x);link.setAttribute("y1","380");
        link.setAttribute("x2",p.x);link.setAttribute("y2",p.y);
        link.setAttribute("class","map-link");
        svg.appendChild(link);
        appendNode(city,p.x,p.y);
      });

      appendNode(country,x,380);
    });

    function cityPositions(count,cx){
      const presets=[
        {x:cx-235,y:215},
        {x:cx+15,y:105},
        {x:cx-85,y:625},
        {x:cx+235,y:570},
        {x:cx+260,y:205}
      ];
      if(count<=presets.length) return presets.slice(0,count);

      return Array.from({length:count},(_,i)=>{
        const angle=-Math.PI*.82+i*(Math.PI*1.64/(count-1));
        return {x:cx+Math.cos(angle)*270,y:380+Math.sin(angle)*245};
      });
    }

    function appendNode(node,x,y){
      const g=document.createElementNS(NS,"g");
      g.setAttribute("class",`node-group ${node.type}-node`);
      g.dataset.id=node.id;

      const maxCount=Math.max(...state.nodes.map(n=>n.count));
      const r=node.type==="country"
        ? 42+Math.sqrt(node.count/maxCount)*50
        : 20+Math.sqrt(node.count/maxCount)*28;

      const circle=document.createElementNS(NS,"circle");
      circle.setAttribute("cx",x);circle.setAttribute("cy",y);circle.setAttribute("r",r);
      g.appendChild(circle);

      const label=document.createElementNS(NS,"text");
      label.setAttribute("x",x);label.setAttribute("y",y+r+24);label.setAttribute("class","node-label");
      label.textContent=node.name;
      g.appendChild(label);

      const count=document.createElementNS(NS,"text");
      count.setAttribute("x",x);count.setAttribute("y",y+r+39);count.setAttribute("class","node-count");
      count.textContent=`${node.count} photos`;
      g.appendChild(count);

      g.addEventListener("mouseenter",()=>{
        renderNodePie(g,node,x,y,r);
      });

      g.addEventListener("mouseleave",()=>{
        restoreNodeCircle(g,node,x,y,r);
      });

      g.addEventListener("click",e=>{
        e.stopPropagation();
        const index=state.nodes.findIndex(n=>n.id===node.id);
        openLocation(index);
      });

      svg.appendChild(g);
    }
  }


  function renderNodePie(group,node,cx,cy,r){
    const NS="http://www.w3.org/2000/svg";

    group.querySelectorAll(".node-pie-slice").forEach(el=>el.remove());
    const base=group.querySelector("circle");
    if(base) base.style.opacity="0";

    const counts=EMOTIONS.map(e=>({
      ...e,
      count:node.rows.filter(row=>row.emotion===e.name).length
    }));
    const total=Math.max(1,counts.reduce((sum,d)=>sum+d.count,0));
    let angle=-Math.PI/2;

    counts.forEach(d=>{
      if(d.count<=0) return;
      const next=angle+(d.count/total)*Math.PI*2;
      const path=document.createElementNS(NS,"path");
      path.setAttribute("class","node-pie-slice");
      path.setAttribute("fill",d.color);
      path.setAttribute("d",arcPath(cx,cy,r,angle,next));
      group.insertBefore(path,group.firstChild);
      angle=next;
    });
  }

  function restoreNodeCircle(group,node,cx,cy,r){
    group.querySelectorAll(".node-pie-slice").forEach(el=>el.remove());
    const base=group.querySelector("circle");
    if(base) base.style.opacity="1";
  }

  function bindMapDrag(){
    mapWrap.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      if(e.target.closest && e.target.closest(".node-group")) return;
      state.dragging=true;
      state.startX=e.clientX;
      state.startPanX=state.panX;
      mapWrap.classList.add("dragging");
      mapWrap.setPointerCapture?.(e.pointerId);
    });

    window.addEventListener("pointermove",e=>{
      if(!state.dragging) return;
      const dx=e.clientX-state.startX;
      setMapPan(state.startPanX+dx);
    });

    window.addEventListener("pointerup",e=>{
      if(!state.dragging) return;
      state.dragging=false;
      mapWrap.classList.remove("dragging");
      mapWrap.releasePointerCapture?.(e.pointerId);
    });

    mapWrap.addEventListener("wheel",e=>{
      e.preventDefault();
      setMapPan(state.panX-(Math.abs(e.deltaX)>1?e.deltaX:e.deltaY));
    },{passive:false});
  }

  function setMapPan(value){
    const stageWidth=svg.getBoundingClientRect().width;
    const visible=mapWrap.clientWidth;
    const min=Math.min(0,visible-stageWidth);
    state.panX=Math.max(min,Math.min(0,value));
    svg.style.transform=`translate3d(${state.panX}px,0,0)`;
  }

  function openLocation(index){
    state.selectedIndex=(index+state.nodes.length)%state.nodes.length;
    mapView.hidden=true;
    locationView.hidden=false;
    renderLocation(state.nodes[state.selectedIndex]);
  }

  function closeLocation(){
    locationView.hidden=true;
    mapView.hidden=false;
  }

  function stepLocation(delta){
    state.selectedIndex=(state.selectedIndex+delta+state.nodes.length)%state.nodes.length;
    renderLocation(state.nodes[state.selectedIndex]);
  }

  function renderLocation(node){
    document.querySelector("#location-type").textContent=node.type.toUpperCase();
    document.querySelector("#location-name").textContent=node.name;
    document.querySelector("#location-count").textContent=node.count;

    const cityCount=node.type==="country"
      ? new Set(node.rows.map(d=>d.city)).size
      : 1;

    const topEmotions=countEmotions(node.rows).slice(0,3).filter(d=>d.count>0);
    document.querySelector("#location-sub").textContent=
      `${node.type==="country" ? cityCount+" cities · " : node.country+" · "}`+
      topEmotions.map(d=>`${d.name} ${d.count}`).join(" · ");

    const nextNode=state.nodes[(state.selectedIndex+1)%state.nodes.length];
    document.querySelector("#next-label").textContent=nextNode.name.toUpperCase();

    drawPie(node.rows);
    drawPhotoOrbit(node.rows);
  }

  function countEmotions(rows){
    return EMOTIONS.map(e=>({
      ...e,
      count:rows.filter(r=>r.emotion===e.name).length
    })).sort((a,b)=>b.count-a.count);
  }

  function drawPie(rows){
    const svg=document.querySelector("#emotion-pie");
    const NS="http://www.w3.org/2000/svg";
    svg.innerHTML="";
    svg.setAttribute("viewBox","0 0 400 400");

    const counts=EMOTIONS.map(e=>({
      ...e,
      count:rows.filter(r=>r.emotion===e.name).length
    }));
    const total=Math.max(1,counts.reduce((s,d)=>s+d.count,0));

    let angle=-Math.PI/2;
    counts.forEach(d=>{
      if(d.count<=0) return;
      const a2=angle+(d.count/total)*Math.PI*2;

      const path=document.createElementNS(NS,"path");
      path.setAttribute("class","pie-slice");
      path.setAttribute("fill",d.color);
      path.setAttribute("d",arcPath(200,200,170,angle,a2));
      svg.appendChild(path);

      if(d.count/total>.06){
        const mid=(angle+a2)/2;
        const tx=200+Math.cos(mid)*107;
        const ty=200+Math.sin(mid)*107;

        const text=document.createElementNS(NS,"text");
        text.setAttribute("x",tx);
        text.setAttribute("y",ty-5);
        text.setAttribute("class","pie-label");
        text.textContent=d.name;
        svg.appendChild(text);

        const percent=document.createElementNS(NS,"text");
        percent.setAttribute("x",tx);
        percent.setAttribute("y",ty+11);
        percent.setAttribute("class","pie-percent");
        percent.textContent=`${Math.round((d.count/total)*100)}%`;
        svg.appendChild(percent);
      }

      angle=a2;
    });
  }

  function arcPath(cx,cy,r,a1,a2){
    const x1=cx+Math.cos(a1)*r,y1=cy+Math.sin(a1)*r;
    const x2=cx+Math.cos(a2)*r,y2=cy+Math.sin(a2)*r;
    const large=a2-a1>Math.PI?1:0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  function drawPhotoOrbit(rows){
    const orbit=document.querySelector("#photo-orbit");
    orbit.innerHTML="";

    const sample=evenSample(rows,Math.min(18,rows.length));
    const presets=[
      [3,8,16,18],[20,4,13,18],[74,5,14,18],[88,7,11,18],
      [7,34,15,18],[23,25,11,19],[77,28,13,18],[89,38,10,18],
      [4,68,16,18],[24,69,11,18],[72,68,14,18],[87,66,11,18],
      [14,15,10,16],[34,8,9,16],[62,10,10,16],
      [17,52,10,17],[68,50,10,17],[82,52,9,17]
    ];

    sample.forEach((row,i)=>{
      const img=document.createElement("img");
      const [left,top,w,h]=presets[i%presets.length];
      img.className="orbit-photo";
      img.src=imagePath(row.filename);
      img.alt="";
      img.style.left=`${left}%`;
      img.style.top=`${top}%`;
      img.style.width=`${w}vw`;
      img.style.height=`${h}vh`;
      img.onerror=()=>img.remove();
      orbit.appendChild(img);
      bindOrbitDrag(img);
    });
  }


  function bindOrbitDrag(img){
    let dragging=false;
    let startX=0,startY=0;
    let startLeft=0,startTop=0;

    img.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.stopPropagation();
      dragging=true;
      img.classList.add("dragging");
      startX=e.clientX;
      startY=e.clientY;
      startLeft=parseFloat(img.style.left)||0;
      startTop=parseFloat(img.style.top)||0;
      img.setPointerCapture?.(e.pointerId);
    });

    img.addEventListener("pointermove",e=>{
      if(!dragging) return;
      const dx=(e.clientX-startX)/window.innerWidth*100;
      const dy=(e.clientY-startY)/window.innerHeight*100;
      img.style.left=`${Math.max(0,Math.min(92,startLeft+dx))}%`;
      img.style.top=`${Math.max(0,Math.min(88,startTop+dy))}%`;
    });

    img.addEventListener("pointerup",e=>{
      if(!dragging) return;
      dragging=false;
      img.classList.remove("dragging");
      img.releasePointerCapture?.(e.pointerId);
    });

    img.addEventListener("pointercancel",()=>{
      dragging=false;
      img.classList.remove("dragging");
    });
  }

  function evenSample(rows,n){
    if(rows.length<=n) return rows;
    return Array.from({length:n},(_,i)=>rows[Math.floor(i*rows.length/n)]);
  }

  function imagePath(filename){
    return `images/${encodeURIComponent(filename).replaceAll("%2F","/")}`;
  }

  function showHoverPie(e,node){
    if(!hoverPie || !hoverPieSvg) return;

    hoverPie.hidden=false;
    hoverPieTitle.textContent=node.name;
    hoverPieSub.textContent=`${node.count} photographs · click to open`;
    drawMiniPie(node.rows);
    moveHoverPie(e);
  }

  function moveHoverPie(e){
    if(!hoverPie || hoverPie.hidden) return;

    const boxW=180;
    const boxH=220;
    let left=e.clientX+18;
    let top=e.clientY+18;

    if(left+boxW>window.innerWidth-10) left=e.clientX-boxW-18;
    if(top+boxH>window.innerHeight-10) top=window.innerHeight-boxH-10;

    hoverPie.style.left=`${Math.max(10,left)}px`;
    hoverPie.style.top=`${Math.max(10,top)}px`;
  }

  function hideHoverPie(){
    if(hoverPie) hoverPie.hidden=true;
  }

  function drawMiniPie(rows){
    const NS="http://www.w3.org/2000/svg";
    hoverPieSvg.innerHTML="";

    const counts=EMOTIONS.map(e=>({
      ...e,
      count:rows.filter(r=>r.emotion===e.name).length
    }));

    const total=Math.max(1,counts.reduce((sum,d)=>sum+d.count,0));
    let angle=-Math.PI/2;

    counts.forEach(d=>{
      if(d.count<=0) return;
      const next=angle+(d.count/total)*Math.PI*2;

      const path=document.createElementNS(NS,"path");
      path.setAttribute("fill",d.color);
      path.setAttribute("stroke","#fff");
      path.setAttribute("stroke-width","2");
      path.setAttribute("d",arcPath(90,90,82,angle,next));
      hoverPieSvg.appendChild(path);

      angle=next;
    });
  }

  function showTooltip(e,text){
    tooltip.textContent=text;
    tooltip.hidden=false;
    moveTooltip(e);
  }

  function moveTooltip(e){
    tooltip.style.left=`${e.clientX+14}px`;
    tooltip.style.top=`${e.clientY+14}px`;
  }

  function hideTooltip(){tooltip.hidden=true;}
})();
