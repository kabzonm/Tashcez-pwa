(()=>{
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileCam = $('#fileInputCamera'), fileGal = $('#fileInputGallery'), fullResChk = $('#fullRes');
  const statusEl = $('#status'), toast = $('#toast'), warnEl = $('#warnings'), metaEl = $('#meta'), logoVer = $('#logoVer');
  const detectCanvasBtn = $('#detectCanvasBtn'), detectApiBtn = $('#detectApiBtn'), exportBtn = $('#exportGridBtn'), toggleBtn = $('#toggleOverlayBtn'), modelSel = $('#modelSelect');
  const logEl = $('#log');
  const ctx = imageCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');

  let overlayVisible = true;
  let srcImg = null;   // ImageBitmap
  let gridX = [], gridY = [], warnings = [];

  const log = (...a)=>{ const line=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '); logEl.textContent+=line+'\n'; logEl.scrollTop=logEl.scrollHeight; console.log(...a); };
  const showToast = m => { toast.textContent = m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1600); };
  const setStatus = m => statusEl.textContent = m;

  // Server version in logo
  fetch('version.txt?ts='+Date.now()).then(r=>r.text()).then(t=>{ logoVer.textContent = (t.split('\n')[0]||'ת').trim(); }).catch(()=>{});

  // Hard refresh (clear SW + caches)
  $('#hardRefreshBtn')?.addEventListener('click', async ()=>{
    try{
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    }catch(e){ console.warn(e); }
    location.replace(location.pathname + '?v=' + Date.now());
  });

  // Resize to container
  function resizeCanvases(){
    const size = Math.round(wrap.getBoundingClientRect().width);
    [imageCanvas, overlayCanvas].forEach(c => { c.width=size; c.height=size; c.getContext('2d').clearRect(0,0,size,size); });
    redraw();
  }
  new ResizeObserver(resizeCanvases).observe(wrap);

  function redraw(){
    if(!srcImg) return;
    const cw=imageCanvas.width, ch=imageCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = srcImg.width; tmp.height = srcImg.height;
    tmp.getContext('2d').drawImage(srcImg,0,0);
    const ar = srcImg.width/srcImg.height, arC = cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    ctx.clearRect(0,0,cw,ch);
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(tmp,0,0,srcImg.width,srcImg.height, dx,dy,dw,dh);
    drawOverlay();
  }
  function drawOverlay(){
    const w=overlayCanvas.width, h=overlayCanvas.height;
    const o=overlayVisible?1:0; overlayCanvas.style.opacity=o;
    octx.clearRect(0,0,w,h);
    if(!gridX.length && !gridY.length) return;
    octx.lineWidth = 2;
    octx.strokeStyle = 'rgba(0,128,255,.85)'; // vertical blue
    gridX.forEach(x=>{ octx.beginPath(); octx.moveTo(x+0.5,0); octx.lineTo(x+0.5,h); octx.stroke(); });
    octx.strokeStyle = 'rgba(255,0,0,.85)'; // horizontal red
    gridY.forEach(y=>{ octx.beginPath(); octx.moveTo(0,y+0.5); octx.lineTo(w,y+0.5); octx.stroke(); });
  }

  // File load
  async function onFile(file){
    if(!file){ setStatus('לא נבחרה תמונה'); return; }
    const blob = file.slice(0, file.size, file.type);
    const img = await createImageBitmap(blob);
    srcImg = img;
    metaEl.textContent = `תמונה נטענה (${img.width}×${img.height})`;
    setStatus('תמונה נטענה. בחר "Canvas" או "API".');
    gridX=[]; gridY=[]; warnings=[];
    resizeCanvases();
  }

  // Canvas-only detection (projections)
  function detectGridCanvas(opts={}){
    if(!srcImg){ showToast('טען תמונה קודם'); return; }
    const W=imageCanvas.width|0, H=imageCanvas.height|0;
    const data = ctx.getImageData(0,0,W,H).data;
    const p = {
      darkPixelThreshold: opts.darkPixelThreshold ?? 384,
      lineThresholdFrac:  opts.lineThresholdFrac  ?? 0.75,
      smoothK:            opts.smoothK            ?? 25,
      mergeTolFrac:       opts.mergeTolFrac       ?? 0.01,
      minRun:             opts.minRun             ?? 2,
      invert:             !!opts.invert
    };
    const hProj = new Float32Array(H), vProj = new Float32Array(W);
    for(let y=0;y<H;y++){
      let cnt=0;
      for(let x=0;x<W;x++){
        const i=(y*W+x)*4; const s=data[i]+data[i+1]+data[i+2];
        const dark = p.invert ? (s>p.darkPixelThreshold) : (s<p.darkPixelThreshold);
        if(dark) cnt++;
      }
      hProj[y]=cnt;
    }
    for(let x=0;x<W;x++){
      let cnt=0;
      for(let y=0;y<H;y++){
        const i=(y*W+x)*4; const s=data[i]+data[i+1]+data[i+2];
        const dark = p.invert ? (s>p.darkPixelThreshold) : (s<p.darkPixelThreshold);
        if(dark) cnt++;
      }
      vProj[x]=cnt;
    }
    const smooth = (arr,k)=>{
      const out=new Float32Array(arr.length); const half=Math.max(1,(k|0)>>1);
      for(let i=0;i<arr.length;i++){ let s=0,c=0; for(let j=-half;j<=half;j++){ const t=i+j; if(t>=0 && t<arr.length){ s+=arr[t]; c++; } } out[i]=s/c; } return out;
    };
    const merge = (vals,tol)=>{
      vals=vals.slice().sort((a,b)=>a-b); const out=[];
      for(const v of vals){ if(!out.length || Math.abs(out[out.length-1]-v)>tol) out.push(v); else out[out.length-1]=(out[out.length-1]+v)/2; }
      return out;
    };
    const runs=(proj,thr,minRun)=>{
      const lines=[]; let inRun=false,s=0;
      for(let i=0;i<proj.length;i++){
        if(proj[i]>=thr){ if(!inRun){ inRun=true; s=i; } }
        else if(inRun){ const e=i-1; if(e-s+1>=minRun) lines.push(Math.round(s+(e-s)/2)); inRun=false; }
      }
      if(inRun){ const e=proj.length-1; if(e-s+1>=minRun) lines.push(Math.round(s+(e-s)/2)); }
      return lines;
    };
    const hS=smooth(hProj,p.smoothK), vS=smooth(vProj,p.smoothK);
    let yLines=runs(hS, W*p.lineThresholdFrac, p.minRun);
    let xLines=runs(vS, H*p.lineThresholdFrac, p.minRun);
    xLines=merge(xLines, Math.max(1, Math.round(W*p.mergeTolFrac)));
    yLines=merge(yLines, Math.max(1, Math.round(H*p.mergeTolFrac)));
    gridX=xLines; gridY=yLines;
    warnEl.textContent = `Canvas: אנכיים=${gridX.length}, אופקיים=${gridY.length}`;
    drawOverlay();
  }

  // API detection
  async function detectGridAPI(){
    if(!srcImg){ showToast('טען תמונה קודם'); return; }
    setStatus('שולח ל-API...');
    // Re-encode original to JPEG base64
    const tmp = document.createElement('canvas'); tmp.width=srcImg.width; tmp.height=srcImg.height;
    tmp.getContext('2d').drawImage(srcImg,0,0);
    const blob = await new Promise(r=> tmp.toBlob(r,'image/jpeg',0.95));
    const b64 = await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result.split(',')[1]); fr.onerror=reject; fr.readAsDataURL(blob); });
    const model = modelSel?.value || 'gpt-4o';
    const resp = await fetch('/.netlify/functions/solve-grid', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ imageBase64: b64, model })
    });
    const data = await resp.json();
    log('[api]', data);
    // Expect gridX/gridY as pixels in the same image space. We scale to canvas dims.
    const cw=overlayCanvas.width, ch=overlayCanvas.height;
    const iw=srcImg.width, ih=srcImg.height;
    // Map preserving aspect fit used in redraw():
    const ar = iw/ih, arC = cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    gridX = (data.gridX||[]).map(x=>Math.round(dx + (x/iw)*dw));
    gridY = (data.gridY||[]).map(y=>Math.round(dy + (y/ih)*dh));
    warnEl.textContent = `API(${data.modelUsed||model}): rows=${data.rows??'?'}, cols=${data.cols??'?'}`;
    setStatus('ה‑API החזיר תוצאה');
    drawOverlay();
  }

  // Export grid.json (from current gridX/gridY)
  function exportGrid(){
    const cols = Math.max(0, gridX.length-1);
    const rows = Math.max(0, gridY.length-1);
    const cells = [];
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x0 = gridX[c], x1 = gridX[c+1];
        const y0 = gridY[r], y1 = gridY[r+1];
        cells.push({ r, c, bbox: [x0,y0,x1-x0,y1-y0] });
      }
    }
    const payload = { version:"v4.4.0", rows, cols, created_at:new Date().toISOString(), warnings, gridX, gridY, cells };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
    showToast('grid.json נוצר');
  }

  function clearAll(){
    gridX=[]; gridY=[]; warnings=[];
    ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
    octx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    statusEl.textContent='נוקה.'; metaEl.textContent=''; warnEl.textContent=''; logEl.textContent='';
    srcImg=null; (fileCam||{}).value=''; (fileGal||{}).value='';
    detectCanvasBtn.disabled = true;
  }

  // UI binds
  toggleBtn?.addEventListener('click', ()=>{ overlayVisible=!overlayVisible; drawOverlay(); });
  exportBtn?.addEventListener('click', exportGrid);
  detectCanvasBtn?.addEventListener('click', ()=>detectGridCanvas());
  detectApiBtn?.addEventListener('click', detectGridAPI);
  $('#clearBtn')?.addEventListener('click', clearAll);
  fileCam?.addEventListener('change', e => { onFile(e.target.files[0]); detectCanvasBtn.disabled=false; });
  fileGal?.addEventListener('change', e => { onFile(e.target.files[0]); detectCanvasBtn.disabled=false; });

  // initial
  fetch('version.txt?ts='+Date.now()).then(r=>r.text()).then(t=>{ logoVer.textContent=(t.split('\n')[0]||'ת').trim(); });
  setStatus('מוכן. טען/י תמונה, ואז "Canvas" או "API".');
})();