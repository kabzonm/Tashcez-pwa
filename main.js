(()=>{
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileCam = $('#fileInputCamera'), fileGal = $('#fileInputGallery');
  const detectCanvasBtn = $('#detectCanvasBtn'), toggleBtn = $('#toggleOverlayBtn'), exportBtn = $('#exportGridBtn');
  const statusEl = $('#status'), gridSizeOutput = $('#gridSizeOutput'), extraInfo = $('#extraInfo'), logEl = $('#log');

  const iCtx = imageCanvas.getContext('2d');
  const oCtx = overlayCanvas.getContext('2d');

  let srcImg = null;
  let overlayVisible = true;
  let gridX = [], gridY = []; // filtered full-cells lines

  const DARK_PIXEL_THRESHOLD = 128 * 3;
  const LINE_DETECTION_SENSITIVITY = 0.75;

  const log = (...a)=>{ const line=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); logEl.textContent+=line+'\n'; logEl.scrollTop=logEl.scrollHeight; console.log(...a); };
  const setStatus = t => statusEl.textContent = t;

  // Version in logo
  fetch('version.txt?ts='+Date.now()).then(r=>r.text()).then(t=>{ const el=document.getElementById('logoVer'); if(el) el.textContent=(t.split('\n')[0]||'ת').trim(); }).catch(()=>{});

  // Resize canvases to holder
  function resizeCanvases(){
    const size = Math.round(wrap.getBoundingClientRect().width);
    imageCanvas.width = overlayCanvas.width = size;
    imageCanvas.height = overlayCanvas.height = size;
    redraw();
  }
  new ResizeObserver(resizeCanvases).observe(wrap);

  function redraw(){
    if(!srcImg) return;
    const cw=imageCanvas.width, ch=imageCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = srcImg.width; tmp.height = srcImg.height;
    tmp.getContext('2d').drawImage(srcImg,0,0);
    const ar = srcImg.width/srcImg.height, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    iCtx.clearRect(0,0,cw,ch);
    iCtx.imageSmoothingQuality='high';
    iCtx.drawImage(tmp,0,0,srcImg.width,srcImg.height, dx,dy,dw,dh);
    drawOverlay();
  }

  function drawOverlay(){
    oCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    overlayCanvas.style.opacity = overlayVisible ? 1 : 0;
    if(!gridX.length || !gridY.length) return;
    const bounds = {
      left: gridX[0],
      right: gridX[gridX.length-1],
      top: gridY[0],
      bottom: gridY[gridY.length-1]
    };
    oCtx.lineWidth = 2;
    // אופקי - אדום
    oCtx.strokeStyle = 'rgba(255,0,0,0.85)';
    gridY.forEach(y=>{
      oCtx.beginPath();
      oCtx.moveTo(bounds.left, y+0.5);
      oCtx.lineTo(bounds.right, y+0.5);
      oCtx.stroke();
    });
    // אנכי - כחול
    oCtx.strokeStyle = 'rgba(0,128,255,0.85)';
    gridX.forEach(x=>{
      oCtx.beginPath();
      oCtx.moveTo(x+0.5, bounds.top);
      oCtx.lineTo(x+0.5, bounds.bottom);
      oCtx.stroke();
    });
  }

  // File loaders
  async function onFile(file){
    if(!file){ setStatus('לא נבחרה תמונה'); return; }
    const blob = file.slice(0, file.size, file.type);
    const img = await createImageBitmap(blob);
    srcImg = img; setStatus('תמונה נטענה'); gridX=[]; gridY=[];
    detectCanvasBtn.disabled=false;
    resizeCanvases();
    // Auto-run analysis
    analyzeGrid();
  }
  fileGal?.addEventListener('change', e => onFile(e.target.files[0]));
  fileCam?.addEventListener('change', e => onFile(e.target.files[0]));

  // --- Helpers for full-cells filtering ---
  function typicalStepAndTol(deltas) {
    if (!deltas.length) return { step: 0, tol: 0 };
    const sorted = deltas.slice().sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
    const absDev = sorted.map(v => Math.abs(v - median)).sort((a,b)=>a-b);
    const mad = absDev.length ? absDev[Math.floor(absDev.length/2)] : 0;
    const baseTol = 0.15; // 15%
    const extraTol = Math.min(0.15, (mad / Math.max(1, median)));
    return { step: median, tol: baseTol + extraTol };
  }
  function longestFullRun(lines) {
    if (lines.length < 2) return lines.slice();
    const deltas = [];
    for (let i=0; i<lines.length-1; i++) deltas.push(lines[i+1]-lines[i]);
    const { step, tol } = typicalStepAndTol(deltas);
    if (step <= 0) return lines.slice();
    const lo = step * (1 - tol);
    const hi = step * (1 + tol);
    const ok = deltas.map(d => d >= lo && d <= hi);
    let best = { len:0, s:-1, e:-1 }, cur = { len:0, s:-1 };
    for (let i=0; i<ok.length; i++) {
      if (ok[i]) {
        if (cur.len === 0) cur.s = i;
        cur.len++;
        if (cur.len > best.len) best = { len: cur.len, s: cur.s, e: i };
      } else {
        cur = { len:0, s:-1 };
      }
    }
    if (best.len <= 0) return lines.slice();
    return lines.slice(best.s, best.e + 2);
  }

  // Gemini-style analyzer + full-cells filter
  function analyzeGrid(){
    const width = imageCanvas.width|0;
    const height = imageCanvas.height|0;
    if(width===0||height===0){ return; }

    const data = iCtx.getImageData(0,0,width,height).data;
    const horizontalProjection = new Array(height).fill(0);
    const verticalProjection   = new Array(width).fill(0);

    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const i=(y*width + x)*4;
        if (data[i] + data[i+1] + data[i+2] < DARK_PIXEL_THRESHOLD) {
          horizontalProjection[y]++;
          verticalProjection[x]++;
        }
      }
    }
    const maxH = Math.max(...horizontalProjection);
    const maxV = Math.max(...verticalProjection);
    const hThr = maxH * LINE_DETECTION_SENSITIVITY;
    const vThr = maxV * LINE_DETECTION_SENSITIVITY;

    const hLines = findLineCoordinates(horizontalProjection, hThr);
    const vLines = findLineCoordinates(verticalProjection, vThr);

    if (hLines.length < 2 || vLines.length < 2) {
      gridSizeOutput.textContent = "לא זוהתה רשת תקינה.";
      gridX=[]; gridY=[]; drawOverlay(); return;
    }

    // --- Full-cells filtering ---
    const fullY = longestFullRun(hLines);
    const fullX = longestFullRun(vLines);

    if (fullY.length < 2 || fullX.length < 2) {
      gridSizeOutput.textContent = "הרשת זוהתה אך לא נמצאו תאים מלאים עקביים.";
      extraInfo.textContent = `(ללא סינון: ${vLines.length-1}×${hLines.length-1})`;
      gridX=[]; gridY=[]; drawOverlay(); return;
    }

    gridY = fullY;
    gridX = fullX;

    const naiveRows = hLines.length - 1;
    const naiveCols = vLines.length - 1;
    const rows = fullY.length - 1;
    const cols = fullX.length - 1;
    gridSizeOutput.textContent = `גודל רשת (מלא): ${cols} עמודות × ${rows} שורות`;
    extraInfo.textContent = `(ללא סינון: ${naiveCols}×${naiveRows})`;

    drawOverlay();
    log(`מלא: ${rows}×${cols} | ללא סינון: ${naiveRows}×${naiveCols}`);
  }

  function findLineCoordinates(projection, threshold){
    const lines=[]; let inLine=false, lineStart=0;
    for(let i=0;i<projection.length;i++){
      if(projection[i] > threshold && !inLine){
        inLine = true; lineStart = i;
      } else if (projection[i] < threshold && inLine){
        inLine = false; const lineEnd = i-1;
        lines.push(Math.round(lineStart + (lineEnd - lineStart)/2));
      }
    }
    if (inLine){ const lineEnd = projection.length - 1;
      lines.push(Math.round(lineStart + (lineEnd - lineStart)/2));
    }
    return lines;
  }

  // Manual button (optional)
  detectCanvasBtn?.addEventListener('click', analyzeGrid);
  toggleBtn?.addEventListener('click', ()=>{ overlayVisible=!overlayVisible; drawOverlay(); });
  exportBtn?.addEventListener('click', ()=>{
    const cols = Math.max(0, gridX.length-1);
    const rows = Math.max(0, gridY.length-1);
    const cells = [];
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x0=gridX[c], x1=gridX[c+1], y0=gridY[r], y1=gridY[r+1];
        cells.push({ r, c, bbox:[x0,y0,x1-x0,y1-y0] });
      }
    }
    const payload = { version:'v4.4.2-canvas-full', rows, cols, gridX, gridY, cells, created_at:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
  });

  // clear
  $('#clearBtn')?.addEventListener('click', ()=>{
    gridX=[]; gridY=[]; srcImg=null; iCtx.clearRect(0,0,imageCanvas.width,imageCanvas.height); oCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    gridSizeOutput.textContent=''; extraInfo.textContent=''; setStatus('נוקה.'); logEl.textContent='';
    detectCanvasBtn.disabled=true;
    if(fileGal) fileGal.value=''; if(fileCam) fileCam.value='';
  });

  // Hard refresh
  $('#hardRefreshBtn')?.addEventListener('click', async ()=>{
    try{
      if('serviceWorker' in navigator){ const regs=await navigator.serviceWorker.getRegistrations(); for(const r of regs) await r.unregister(); }
      if(window.caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
    } catch(e){}
    location.replace(location.pathname + '?v=' + Date.now());
  });

})();