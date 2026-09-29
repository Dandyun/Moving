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
    dragging: false,
    hasUserPanned: false,
    introPlayed: false,
    pulseAnimations: []
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

    requestAnimationFrame(() => {
      centerMap();
      playMapIntro();
    });

    window.addEventListener("resize", () => {
      if(!state.hasUserPanned) centerMap();
      if(!locationView.hidden && state.nodes[state.selectedIndex]){
        drawPhotoGrid(state.nodes[state.selectedIndex].rows);
      }
    });

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
    const countries = state.nodes.filter(n=>n.type==="country");
    const spacing = 720;
    const width = Math.max(2500, 900 + Math.max(0,countries.length-1)*spacing);
    const height = 760;
    const centerX = width/2;
    const countryStartX = centerX - ((countries.length-1)*spacing)/2;

    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    svg.style.width=`${width}px`;

    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const defs=document.createElementNS(NS,"defs");
    svg.appendChild(defs);

    const rainbowStops=[
      ["0%","#ff2d2d"],
      ["14%","#ff7a00"],
      ["28%","#ffd400"],
      ["43%","#45d65b"],
      ["58%","#22c7ff"],
      ["72%","#3567ff"],
      ["86%","#9a4dff"],
      ["100%","#ff4bb2"]
    ];

    function prepareRainbowStroke(line,x1,y1,x2,y2,id){
      const gradient=document.createElementNS(NS,"linearGradient");
      gradient.setAttribute("id",id);
      gradient.setAttribute("gradientUnits","userSpaceOnUse");
      gradient.setAttribute("x1",x1);
      gradient.setAttribute("y1",y1);
      gradient.setAttribute("x2",x2);
      gradient.setAttribute("y2",y2);

      rainbowStops.forEach(([offset,color])=>{
        const stop=document.createElementNS(NS,"stop");
        stop.setAttribute("offset",offset);
        stop.setAttribute("stop-color",color);
        gradient.appendChild(stop);
      });

      defs.appendChild(gradient);

      // Store the rainbow for the entrance only.
      // The resting map remains the original gray.
      line.dataset.rainbowStroke=`url(#${id})`;
    }

    const countryX = new Map();
    countries.forEach((country,i)=>{
      countryX.set(country.name, countryStartX + i*spacing);
    });

    // 01 — the horizontal country line is drawn first.
    if(countries.length>1){
      const line = document.createElementNS(NS,"line");
      const x1 = countryX.get(countries[0].name);
      const x2 = countryX.get(countries[countries.length-1].name);
      line.setAttribute("x1",x1);
      line.setAttribute("y1","380");
      line.setAttribute("x2",x2);
      line.setAttribute("y2","380");
      line.setAttribute("class","map-link main-country-link rainbow-map-link");
      line.dataset.length=String(Math.abs(x2-x1));
      prepareRainbowStroke(line,x1,380,x2,380,"rainbow-main-country");
      svg.appendChild(line);
    }

    // Build city branches first so country nodes remain visually on top.
    countries.forEach((country,cIndex)=>{
      const x=countryX.get(country.name);
      const children=state.nodes.filter(n=>n.type==="city"&&n.country===country.name);
      const positions = cityPositions(children.length,x);

      children.forEach((city,i)=>{
        const p=positions[i];
        const link=document.createElementNS(NS,"line");
        link.setAttribute("x1",x);
        link.setAttribute("y1","380");
        link.setAttribute("x2",p.x);
        link.setAttribute("y2",p.y);
        link.setAttribute("class","map-link city-link rainbow-map-link");
        link.dataset.countryIndex=String(cIndex);
        link.dataset.cityIndex=String(i);
        link.dataset.length=String(Math.hypot(p.x-x,p.y-380));
        prepareRainbowStroke(
          link,
          x,
          380,
          p.x,
          p.y,
          `rainbow-city-${cIndex}-${i}`
        );
        svg.appendChild(link);

        appendNode(city,p.x,p.y,{
          introType:"city",
          countryIndex:cIndex,
          cityIndex:i
        });
      });
    });

    countries.forEach((country,cIndex)=>{
      appendNode(country,countryX.get(country.name),380,{
        introType:"country",
        countryIndex:cIndex,
        cityIndex:-1
      });
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

    function appendNode(node,x,y,intro){
      const g=document.createElementNS(NS,"g");
      g.setAttribute("class",`node-group ${node.type}-node`);
      g.dataset.id=node.id;
      g.dataset.introType=intro.introType;
      g.dataset.countryIndex=String(intro.countryIndex);
      g.dataset.cityIndex=String(intro.cityIndex);

      const maxCount=Math.max(...state.nodes.map(n=>n.count));
      const r=node.type==="country"
        ? 42+Math.sqrt(node.count/maxCount)*50
        : 20+Math.sqrt(node.count/maxCount)*28;

      // Only the circle/pie "breathes"; labels stay stable.
      const visual=document.createElementNS(NS,"g");
      visual.setAttribute("class","node-visual");
      visual.style.transformBox="fill-box";
      visual.style.transformOrigin="center";
      visual.style.opacity="0";
      visual.style.transform="scale(0)";

      const circle=document.createElementNS(NS,"circle");
      circle.setAttribute("cx",x);
      circle.setAttribute("cy",y);
      circle.setAttribute("r",r);
      visual.appendChild(circle);
      g.appendChild(visual);

      const label=document.createElementNS(NS,"text");
      label.setAttribute("x",x);
      label.setAttribute("y",y+r+24);
      label.setAttribute("class","node-label");
      label.textContent=node.name;
      label.style.opacity="0";
      g.appendChild(label);

      const count=document.createElementNS(NS,"text");
      count.setAttribute("x",x);
      count.setAttribute("y",y+r+39);
      count.setAttribute("class","node-count");
      count.textContent=`${node.count} photos`;
      count.style.opacity="0";
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
    const visual=group.querySelector(".node-visual");
    if(!visual) return;

    visual.querySelectorAll(".node-pie-slice").forEach(el=>el.remove());
    const base=visual.querySelector("circle");
    if(base) base.style.opacity="0";

    const counts=countEmotions(node.rows).filter(d=>d.count>0);
    const total=Math.max(1,counts.reduce((sum,d)=>sum+d.count,0));
    let angle=-Math.PI/2;

    counts.forEach(d=>{
      const next=angle+(d.count/total)*Math.PI*2;
      const path=document.createElementNS(NS,"path");
      path.setAttribute("class","node-pie-slice");
      path.setAttribute("fill",d.color);
      path.setAttribute("d",arcPath(cx,cy,r,angle,next));
      visual.insertBefore(path,base);
      angle=next;
    });
  }

  function restoreNodeCircle(group,node,cx,cy,r){
    const visual=group.querySelector(".node-visual");
    if(!visual) return;
    visual.querySelectorAll(".node-pie-slice").forEach(el=>el.remove());
    const base=visual.querySelector("circle");
    if(base) base.style.opacity="1";
  }

  function bindMapDrag(){
    mapWrap.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      if(e.target.closest && e.target.closest(".node-group")) return;
      state.hasUserPanned=true;
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
      state.hasUserPanned=true;
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

  function centerMap(){
    const stageWidth=svg.getBoundingClientRect().width;
    const visible=mapWrap.clientWidth;
    const centered=(visible-stageWidth)/2;
    setMapPan(centered);
  }

  function playMapIntro(){
    if(state.introPlayed) return;
    state.introPlayed=true;

    const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const mainLine=svg.querySelector(".main-country-link");
    const countryNodes=[...svg.querySelectorAll('.node-group[data-intro-type="country"]')];
    const cityNodes=[...svg.querySelectorAll('.node-group[data-intro-type="city"]')];
    const cityLinks=[...svg.querySelectorAll(".city-link")];

    if(reduceMotion){
      [...svg.querySelectorAll(".map-link")].forEach(line=>{
        line.style.strokeDasharray="none";
        line.style.strokeDashoffset="0";
      });
      [...svg.querySelectorAll(".node-visual")].forEach(v=>{
        v.style.opacity="1";
        v.style.transform="scale(1)";
      });
      [...svg.querySelectorAll(".node-label,.node-count")].forEach(t=>t.style.opacity="1");
      return;
    }

    // 01 — main horizontal line.
    if(mainLine){
      animateLine(mainLine,0,1050);
    }

    // 02 — Korea / Japan / USA appear together.
    countryNodes.forEach(node=>{
      revealNode(node,980,760);
    });

    // 03 — city branch lines extend outward, then the city circles grow in.
    cityLinks.forEach((line,index)=>{
      const countryIndex=Number(line.dataset.countryIndex)||0;
      const cityIndex=Number(line.dataset.cityIndex)||0;
      const delay=1640 + countryIndex*145 + cityIndex*115;
      animateLine(line,delay,650);
    });

    cityNodes.forEach(node=>{
      const countryIndex=Number(node.dataset.countryIndex)||0;
      const cityIndex=Number(node.dataset.cityIndex)||0;
      const delay=2050 + countryIndex*145 + cityIndex*115;
      revealNode(node,delay,650);
    });

    // After the entrance settles, every circle gets its own subtle random breathing rhythm.
    window.setTimeout(startRandomNodePulse,3150);
  }

  function animateLine(line,delay,duration){
    const length=Math.max(1,Number(line.dataset.length)||1);
    line.style.strokeDasharray=`${length}`;
    line.style.strokeDashoffset=`${length}`;

    // Rainbow is shown only while the line is drawing.
    if(line.dataset.rainbowStroke){
      line.style.setProperty("stroke",line.dataset.rainbowStroke,"important");
    }

    const animation=line.animate(
      [
        {strokeDashoffset:length},
        {strokeDashoffset:0}
      ],
      {
        duration,
        delay,
        easing:"cubic-bezier(.22,.8,.28,1)",
        fill:"forwards"
      }
    );

    animation.onfinish=()=>{
      line.style.strokeDashoffset="0";
      line.style.strokeDasharray="none";

      // After the draw finishes, restore the original gray connector.
      line.style.removeProperty("stroke");
    };
  }

  function revealNode(node,delay,duration){
    const visual=node.querySelector(".node-visual");
    const label=node.querySelector(".node-label");
    const count=node.querySelector(".node-count");
    if(!visual) return;

    visual.animate(
      [
        {opacity:0,transform:"scale(0)"},
        {opacity:1,transform:"scale(1.08)",offset:.72},
        {opacity:1,transform:"scale(1)"}
      ],
      {
        duration,
        delay,
        easing:"cubic-bezier(.18,.82,.25,1)",
        fill:"forwards"
      }
    ).onfinish=()=>{
      visual.style.opacity="1";
      visual.style.transform="scale(1)";
    };

    [label,count].forEach((el,index)=>{
      if(!el) return;
      el.animate(
        [
          {opacity:0,transform:"translateY(5px)"},
          {opacity:1,transform:"translateY(0)"}
        ],
        {
          duration:320,
          delay:delay+Math.max(180,duration*.48)+(index*35),
          easing:"ease-out",
          fill:"forwards"
        }
      ).onfinish=()=>{ el.style.opacity="1"; };
    });
  }

  function startRandomNodePulse(){
    state.pulseAnimations.forEach(animation=>animation.cancel());
    state.pulseAnimations=[];

    const visuals=[...svg.querySelectorAll(".node-visual")];
    visuals.forEach((visual,index)=>{
      // More visible than before, while still feeling soft/random.
      const grow=.09 + Math.random()*.07;     // +9% to +16%
      const shrink=.035 + Math.random()*.035; // -3.5% to -7%
      const duration=2200 + Math.random()*2200;
      const delay=Math.random()*1400;
      const growPoint=.28 + Math.random()*.12;
      const shrinkPoint=.68 + Math.random()*.10;

      const animation=visual.animate(
        [
          {transform:"scale(1)"},
          {transform:`scale(${1+grow})`,offset:growPoint},
          {transform:`scale(${1-shrink})`,offset:shrinkPoint},
          {transform:"scale(1)"}
        ],
        {
          duration,
          delay,
          iterations:Infinity,
          easing:"ease-in-out"
        }
      );

      state.pulseAnimations.push(animation);
    });
  }

  function openLocation(index){
    state.selectedIndex=(index+state.nodes.length)%state.nodes.length;
    document.querySelector(".move-page")?.classList.add("detail-open");
    mapView.hidden=true;
    locationView.hidden=false;
    renderLocation(state.nodes[state.selectedIndex]);
  }

  function closeLocation(){
    hidePhotoPreview();
    document.querySelector(".move-page")?.classList.remove("detail-open");
    locationView.hidden=true;
    mapView.hidden=false;
  }

  function stepLocation(delta){
    hidePhotoPreview();
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

    const allEmotionCounts=EMOTIONS.map(emotion=>({
      name:emotion.name,
      count:node.rows.filter(row=>row.emotion===emotion.name).length
    }));

    const prefix=node.type==="country"
      ? `${cityCount} cities`
      : node.country;

    document.querySelector("#location-sub").textContent=
      `${prefix} · `+
      allEmotionCounts.map(d=>`${d.name} ${d.count}`).join(" · ");

    drawPie(node.rows);
    drawPhotoGrid(node.rows);
  }

  function countEmotions(rows){
    return EMOTIONS.map(e=>({
      ...e,
      count:rows.filter(r=>r.emotion===e.name).length
    })).sort((a,b)=>b.count-a.count);
  }

  function drawPie(rows){
    const pieSvg=document.querySelector("#emotion-pie");
    const NS="http://www.w3.org/2000/svg";
    pieSvg.innerHTML="";
    pieSvg.setAttribute("viewBox","0 0 400 400");

    const counts=countEmotions(rows).filter(d=>d.count>0);
    const total=Math.max(1,counts.reduce((s,d)=>s+d.count,0));

    let angle=-Math.PI/2;
    counts.forEach(d=>{
      const ratio=d.count/total;
      const a2=angle+ratio*Math.PI*2;

      const path=document.createElementNS(NS,"path");
      path.setAttribute("class","pie-slice");
      path.setAttribute("fill",d.color);
      path.setAttribute("d",arcPath(200,200,170,angle,a2));
      pieSvg.appendChild(path);

      // Keep the pie visually clean: only percentage values, no emotion names.
      if(ratio>.045){
        const mid=(angle+a2)/2;
        const radius=ratio>.16 ? 108 : 116;
        const tx=200+Math.cos(mid)*radius;
        const ty=200+Math.sin(mid)*radius;

        const percent=document.createElementNS(NS,"text");
        percent.setAttribute("x",tx);
        percent.setAttribute("y",ty+4);
        percent.setAttribute("class","pie-percent-only");
        percent.textContent=`${Math.round(ratio*100)}%`;
        pieSvg.appendChild(percent);
      }

      angle=a2;
    });

    renderEmotionLegend();
  }

  function renderEmotionLegend(){
    const container=document.querySelector("#emotion-legend-items");
    if(!container) return;

    container.innerHTML="";
    EMOTIONS.forEach(emotion=>{
      const item=document.createElement("span");
      item.className="emotion-legend-item";

      const dot=document.createElement("i");
      dot.style.setProperty("--legend-color",emotion.color);

      const label=document.createElement("span");
      label.textContent=emotion.name;

      item.appendChild(dot);
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  function arcPath(cx,cy,r,a1,a2){
    const x1=cx+Math.cos(a1)*r,y1=cy+Math.sin(a1)*r;
    const x2=cx+Math.cos(a2)*r,y2=cy+Math.sin(a2)*r;
    const large=a2-a1>Math.PI?1:0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  function drawPhotoGrid(rows){
    const grid=document.querySelector("#photo-grid");
    const panel=document.querySelector(".photo-grid-panel");
    if(!grid) return;
    grid.innerHTML="";

    // Same ranking as the pie: largest emotion group first.
    const rankedEmotions=countEmotions(rows).filter(d=>d.count>0);
    const rank=new Map(rankedEmotions.map((d,i)=>[d.name,i]));

    const sortedRows=rows
      .map((row,index)=>({row,index}))
      .sort((a,b)=>{
        const ar=rank.has(a.row.emotion) ? rank.get(a.row.emotion) : 999;
        const br=rank.has(b.row.emotion) ? rank.get(b.row.emotion) : 999;
        return ar-br || a.index-b.index;
      })
      .map(item=>item.row);

    const count=Math.max(1,sortedRows.length);
    const panelWidth=panel?.clientWidth || window.innerWidth*.55;
    const panelHeight=panel?.clientHeight || window.innerHeight*.82;
    const aspect=Math.max(.8,Math.min(2.2,panelWidth/panelHeight));
    const cols=Math.max(1,Math.round(Math.sqrt(count*aspect)));
    const rowCount=Math.max(1,Math.ceil(count/cols));

    grid.style.setProperty("--grid-cols",String(cols));
    grid.style.setProperty("--grid-rows",String(rowCount));

    const pendingImages=[];

    sortedRows.forEach((row,index)=>{
      const tile=document.createElement("figure");
      tile.className="location-photo-tile";
      tile.dataset.emotion=row.emotion || "";

      const emotion=EMOTIONS.find(e=>e.name===row.emotion);

      // The color layer appears immediately, before the image loads.
      const overlay=document.createElement("span");
      overlay.className="emotion-photo-overlay";
      overlay.style.setProperty("--emotion-overlay",emotion?.color || "#888888");

      const img=document.createElement("img");
      img.alt=`${row.city || row.country || "Location"} photograph ${index+1}`;
      img.decoding="async";
      img.loading="lazy";
      img.className="progressive-photo";
      img.dataset.src=imagePath(row.filename);

      if(index<48){
        img.fetchPriority="high";
        img.loading="eager";
      }else{
        img.fetchPriority="auto";
        img.loading="lazy";
      }

      img.addEventListener("load",()=>{
        tile.classList.add("is-loaded");
      });

      img.addEventListener("error",()=>{
        tile.classList.add("image-missing");
        img.remove();
      });

      tile.appendChild(img);
      tile.appendChild(overlay);

      tile.addEventListener("mouseenter",(event)=>{
        showPhotoPreview(event,row,img);
      });
      tile.addEventListener("mousemove",(event)=>{
        movePhotoPreview(event);
      });
      tile.addEventListener("mouseleave",()=>{
        hidePhotoPreview();
      });

      grid.appendChild(tile);
      pendingImages.push(img);
    });

    // Faster progressive loading:
    // show the color mosaic instantly, then start many image requests quickly.
    // This removes the old idle-callback throttling that made large locations
    // such as USA feel unnecessarily slow.
    const BATCH_SIZE=48;
    let cursor=0;

    const loadBatch=()=>{
      const end=Math.min(cursor+BATCH_SIZE,pendingImages.length);

      for(let i=cursor;i<end;i++){
        const img=pendingImages[i];
        if(img && !img.src){
          img.src=img.dataset.src;
          img.removeAttribute("data-src");
        }
      }

      cursor=end;

      if(cursor<pendingImages.length){
        window.setTimeout(loadBatch,18);
      }
    };

    // First batch starts on the very next paint so the page itself opens first.
    window.requestAnimationFrame(loadBatch);
  }

  function showPhotoPreview(event,row,tileImage){
    const preview=document.querySelector("#photo-hover-preview");
    const previewImage=document.querySelector("#photo-hover-image");
    const id=document.querySelector("#photo-hover-id");
    const date=document.querySelector("#photo-hover-date");
    const emotion=document.querySelector("#photo-hover-emotion");
    const score=document.querySelector("#photo-hover-score");

    if(!preview || !previewImage) return;

    const src=tileImage?.currentSrc || tileImage?.src || tileImage?.dataset?.src || imagePath(row.filename);
    previewImage.src=src;
    previewImage.alt=`Preview of photograph ${row.photo_id}`;

    id.textContent=row.photo_id || "—";
    date.textContent=formatPhotoDate(row.datetime);
    emotion.textContent=row.emotion || "—";

    const numericScore=Number(row.emotion_score);
    score.textContent=Number.isFinite(numericScore)
      ? `${numericScore>0 ? "+" : ""}${numericScore}`
      : "—";

    preview.hidden=false;
    preview.setAttribute("aria-hidden","false");
    movePhotoPreview(event);
  }

  function movePhotoPreview(event){
    const preview=document.querySelector("#photo-hover-preview");
    if(!preview || preview.hidden) return;

    const gap=18;
    const margin=12;
    const rect=preview.getBoundingClientRect();

    let left=event.clientX+gap;
    let top=event.clientY+gap;

    if(left+rect.width>window.innerWidth-margin){
      left=event.clientX-rect.width-gap;
    }

    if(top+rect.height>window.innerHeight-margin){
      top=window.innerHeight-rect.height-margin;
    }

    preview.style.left=`${Math.max(margin,left)}px`;
    preview.style.top=`${Math.max(margin,top)}px`;
  }

  function hidePhotoPreview(){
    const preview=document.querySelector("#photo-hover-preview");
    if(!preview) return;
    preview.hidden=true;
    preview.setAttribute("aria-hidden","true");
  }

  function formatPhotoDate(value){
    if(!value) return "—";
    const normalized=String(value).includes(" ") && !String(value).includes("T")
      ? String(value).replace(" ","T")
      : String(value);
    const parsed=new Date(normalized);
    if(Number.isNaN(parsed.getTime())) return String(value);

    return parsed.toLocaleDateString("en-US",{
      year:"numeric",
      month:"short",
      day:"numeric"
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

    const counts=countEmotions(rows).filter(d=>d.count>0);

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
