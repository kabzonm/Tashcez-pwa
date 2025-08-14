(()=>{
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileCam = $('#fileInputCamera'), fileGal = $('#fileInputGallery');
  const detectCanvasBtn = $('#detectCanvasBtn'), toggleBtn = $('#toggleOverlayBtn'), exportBtn = $('#exportGridBtn');
  const statusEl = $('#status'), gridSizeOutput = $('#gridSizeOutput'), logEl = $('#log');

  const iCtx = imageCanvas.getContext('2d');
  const oCtx = overlayCanvas.getContext('2d');

  let srcImg = null;
  let overlayVisible = true;
  let gridX = [], gridY = [];

  const DARK_PIXEL_THRESHOLD = 128 * 3;
  const LINE_DETECTION_SENSITIVITY = 0.75;

  const log = (...a)=>{ const line=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); logEl.textContent+=line+'\n'; logEl.scrollTop=logEl.scrollHeight; console.log(...a); };

  // Cache bust logo version
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
    // ציור קווי רשת לפי גבולות הגריד
    const bounds = {
      left: gridX[0],
      right: gridX[gridX.length-1],
      top: gridY[0],
      bottom: gridY[gridY.length-1]
    };
    oCtx.lineWidth = 2;
    // אופקי - אדום
    oCtx.strokeStyle = 'rgba(255,0,0,0.8)';
    gridY.forEach(y=>{
      oCtx.beginPath();
      oCtx.moveTo(bounds.left, y+0.5);
      oCtx.lineTo(bounds.right, y+0.5);
      oCtx.stroke();
    });
    // אנכי - כחול
    oCtx.strokeStyle = 'rgba(0,128,255,0.8)';
    gridX.forEach(x=>{
      oCtx.beginPath();
      oCtx.moveTo(x+0.5, bounds.top);
      oCtx.lineTo(x+0.5, bounds.bottom);
      oCtx.stroke();
    });
  }

  // File loaders
  async function onFile(file){
    if(!file){ statusEl.textContent='לא נבחרה תמונה'; return; }
    const blob = file.slice(0, file.size, file.type);
    const img = await createImageBitmap(blob);
    srcImg = img; statusEl.textContent='תמונה נטענה'; gridX=[]; gridY=[];
    detectCanvasBtn.disabled=false;
    resizeCanvases();
    // Run automatically like Gemini flow
    analyzeGrid();
  }
  fileGal?.addEventListener('change', e => onFile(e.target.files[0]));
  fileCam?.addEventListener('change', e => onFile(e.target.files[0]));

  // Gemini-style analyzer adapted to our canvases
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

    // שמור לקנבס העליון
    gridY = hLines;
    gridX = vLines;

    const gridRows = hLines.length - 1;
    const gridCols = vLines.length - 1;
    gridSizeOutput.textContent = `גודל התשבץ שזוהה: ${gridCols} עמודות × ${gridRows} שורות`;

    drawOverlay();
    log(`זוהו ${hLines.length} קווים אופקיים ו-${vLines.length} קווים אנכיים.`);
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
    const payload = { version:'v4.4.1-canvas', rows, cols, gridX, gridY, cells, created_at:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
  });

  // clear
  $('#clearBtn')?.addEventListener('click', ()=>{
    gridX=[]; gridY=[]; srcImg=null; iCtx.clearRect(0,0,imageCanvas.width,imageCanvas.height); oCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    gridSizeOutput.textContent=''; statusEl.textContent='נוקה.'; logEl.textContent='';
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