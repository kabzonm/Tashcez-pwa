(() => {
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileCam = $('#fileInputCamera'), fileGal = $('#fileInputGallery'), fullResChk = $('#fullRes');
  const statusEl = $('#status'), toast = $('#toast'), statsEl = $('#stats'), metaEl = $('#meta'), cvBadge = $('#cvBadge'), logoVer = $('#logoVer');
  const detectBtn = $('#detectGridBtn'), hardRefreshBtn = $('#hardRefreshBtn');
  const ctx = imageCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');

  let overlayVisible = true;
  let srcImg = null;   // full-res ImageBitmap
  let viewMat = null;  // warped cv.Mat for processing
  let gridX = [], gridY = [];
  let cvReady = false;

  // Expose small state for optional patches
  window.__tash = { overlayVisible, gridX, gridY, viewMat, cvReady };

  const showToast = m => { toast.textContent = m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1600); };
  const setStatus = m => statusEl.textContent = m;

  // Show server version in logo
  fetch('version.txt?ts='+Date.now()).then(r=>r.text()).then(t=>{ logoVer.textContent = (t.split('\\n')[0]||'ת').trim(); }).catch(()=>{});

  // Hard refresh: unregister SW + clear caches + reload
  async function hardRefresh(){
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
    const ts = Date.now();
    location.replace(location.pathname + '?v=' + ts);
  }
  hardRefreshBtn?.addEventListener('click', hardRefresh);

  // CV readiness
  function checkCV(){
    if (window.cv && cv.Mat){
      cvReady = true;
      detectBtn.disabled = false;
      cvBadge.classList.remove('wait'); cvBadge.classList.add('ok');
      cvBadge.textContent = 'OpenCV: מוכן';
      window.__tash.cvReady = true;
      return true;
    }
    return false;
  }
  const cvInterval = setInterval(()=>{ if(checkCV()) clearInterval(cvInterval); }, 1000);
  window.addEventListener('load', checkCV);

  // Resize/display helpers
  function resizeCanvases(){
    const size = Math.round(wrap.getBoundingClientRect().width);
    [imageCanvas, overlayCanvas].forEach(c => { c.width=size; c.height=size; c.getContext('2d').clearRect(0,0,size,size); });
    drawView();
    overlayCanvas.style.opacity = overlayVisible ? 1 : 0;
    drawOverlays();
  }
  new ResizeObserver(resizeCanvases).observe(wrap);

  function drawView(){
    ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
    if(!viewMat) return;
    // draw gray Mat into canvas
    const w = viewMat.cols, h = viewMat.rows;
    const imgData = new ImageData(w, h);
    for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ const v = viewMat.ucharPtr(y,x)[0]; const idx=(y*w+x)*4; imgData.data[idx]=v; imgData.data[idx+1]=v; imgData.data[idx+2]=v; imgData.data[idx+3]=255; } }
    const tmp = document.createElement('canvas'); tmp.width=w; tmp.height=h; tmp.getContext('2d').putImageData(imgData,0,0);
    const cw=imageCanvas.width, ch=imageCanvas.height, ar=w/h, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    ctx.imageSmoothingQuality='high'; ctx.drawImage(tmp,dx,dy,dw,dh);
  }

  function drawOverlays(){
    const w=overlayCanvas.width, h=overlayCanvas.height;
    octx.clearRect(0,0,w,h);
    if(!gridX.length && !gridY.length) return;
    // vertical = green, horizontal = orange
    octx.lineWidth = 1.5;
    octx.strokeStyle = 'rgba(6,214,160,.95)';
    gridX.forEach(x=>{ octx.beginPath(); octx.moveTo(x+0.5,0); octx.lineTo(x+0.5,h); octx.stroke(); });
    octx.strokeStyle = 'rgba(239,158,54,.95)';
    gridY.forEach(y=>{ octx.beginPath(); octx.moveTo(0,y+0.5); octx.lineTo(w,y+0.5); octx.stroke(); });
  }

  // File loading (full-res if requested) + perspective warp
  async function onFile(file){
    if(!file){ setStatus('לא נבחרה תמונה'); return; }
    const blob = file.slice(0, file.size, file.type);
    srcImg = await createImageBitmap(blob);
    metaEl.textContent = `תמונה נטענה (${srcImg.width}×${srcImg.height})`;

    const maxSide = fullResChk.checked ? Math.max(srcImg.width, srcImg.height) : 1600;
    const scale = Math.min(1, maxSide / Math.max(srcImg.width, srcImg.height));
    const tw = Math.max(1, Math.round(srcImg.width * scale));
    const th = Math.max(1, Math.round(srcImg.height * scale));
    const tmp = document.createElement('canvas'); tmp.width=tw; tmp.height=th;
    tmp.getContext('2d').drawImage(srcImg,0,0,tw,th);
    const tctx = tmp.getContext('2d');

    let src = new cv.Mat(th, tw, cv.CV_8UC4);
    src.data.set(tctx.getImageData(0,0,tw,th).data);
    let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    let clahe = new cv.Mat(); cv.equalizeHist(gray, clahe);
    let bin = new cv.Mat(); cv.threshold(clahe, bin, 0, 255, cv.THRESH_BINARY_INV+cv.THRESH_OTSU);

    let cnts = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(bin, cnts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let bestIdx=-1, bestArea=0;
    for(let i=0;i<cnts.size();i++){ const a=cv.contourArea(cnts.get(i)); if(a>bestArea){ bestArea=a; bestIdx=i; } }
    let warped = new cv.Mat(); const baseSize=1024;
    if(bestIdx>=0){
      let cnt = cnts.get(bestIdx); let peri=cv.arcLength(cnt,true); let approx=new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02*peri, true);
      if(approx.rows===4){
        const pts=[]; for(let i=0;i<4;i++){ const p=approx.intPtr(i,0); pts.push({x:p[0],y:p[1]}); }
        pts.sort((a,b)=>a.y-b.y); const top=[pts[0],pts[1]].sort((a,b)=>a.x-b.x), bot=[pts[2],pts[3]].sort((a,b)=>a.x-b.x);
        const srcTri=cv.matFromArray(4,1,cv.CV_32FC2,[top[0].x,top[0].y, top[1].x,top[1].y, bot[1].x,bot[1].y, bot[0].x,bot[0].y]);
        const dstTri=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,  baseSize,0,  baseSize,baseSize,  0,baseSize]);
        const M=cv.getPerspectiveTransform(srcTri,dstTri);
        cv.warpPerspective(clahe, warped, M, new cv.Size(baseSize,baseSize), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
        srcTri.delete(); dstTri.delete(); M.delete();
      } else { warped = clahe.clone(); }
      approx.delete(); cnt.delete();
    } else { warped = clahe.clone(); }
    if(viewMat) try{ viewMat.delete(); }catch(e){}
    viewMat = warped;
    window.__tash.viewMat = viewMat;

    [src,gray,clahe,bin,cnts,hier].forEach(m=>{ try{ m.delete(); }catch(e){} });

    gridX=[]; gridY=[];
    window.__tash.gridX = gridX; window.__tash.gridY = gridY;
    resizeCanvases();
    setStatus('תמונה נטענה ומיושרת. לחץ "גלה גריד".');
  }

  // Hough-only detection with merging; no spacing fitting
  function detectGrid(){
    if(!cvReady){ showToast('OpenCV עדיין נטען...'); return; }
    if(!viewMat){ showToast('טען תמונה קודם'); return; }
    gridX=[]; gridY=[]; drawOverlays();

    let img = viewMat.clone();
    cv.GaussianBlur(img, img, new cv.Size(3,3), 0);
    let bin = new cv.Mat(); cv.adaptiveThreshold(img, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 31, 7);

    // Remove small components (likely text)
    let cnts = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(bin, cnts, hier, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    const areaThr = bin.rows*bin.cols*0.0008;
    for(let i=0;i<cnts.size();i++){
      const r = cv.boundingRect(cnts.get(i));
      if(r.width*r.height < areaThr){
        cv.rectangle(bin, new cv.Point(r.x, r.y), new cv.Point(r.x+r.width, r.y+r.height), new cv.Scalar(0), -1);
      }
    }

    let edges = new cv.Mat(); cv.Canny(bin, edges, 60, 180);
    let lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI/180, 120, 0.85*Math.max(edges.cols, edges.rows), 8);

    const W=edges.cols, H=edges.rows;
    let xRaw=[], yRaw=[];
    for(let i=0;i<lines.rows;i++){
      const p = lines.intPtr(i,0);
      const x1=p[0], y1=p[1], x2=p[2], y2=p[3];
      const dx = x2-x1, dy=y2-y1;
      const len = Math.hypot(dx,dy);
      if (Math.abs(dy) < 2 && len >= 0.85*W) yRaw.push((y1+y2)/2);
      else if (Math.abs(dx) < 2 && len >= 0.85*H) xRaw.push((x1+x2)/2);
    }

    function merge(vals, tol){
      vals.sort((a,b)=>a-b);
      const out=[];
      for(const v of vals){
        if(!out.length || Math.abs(out[out.length-1]-v)>tol) out.push(v);
        else out[out.length-1]=(out[out.length-1]+v)/2;
      }
      return out;
    }
    const xM = merge(xRaw, W*0.01);
    const yM = merge(yRaw, H*0.01);

    // map to overlay canvas
    const cw=overlayCanvas.width, ch=overlayCanvas.height;
    const ar=viewMat.cols/viewMat.rows, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    const sx = dw / viewMat.cols, sy = dh / viewMat.rows;
    gridX = xM.map(x => Math.round(dx + x*sx));
    gridY = yM.map(y => Math.round(dy + y*sy));

    window.__tash.gridX = gridX; window.__tash.gridY = gridY;

    drawOverlays();
    statsEl.textContent = `Hough: אנכיים=${xM.length}, אופקיים=${yM.length}`;

    [img,bin,cnts,hier,edges,lines].forEach(m=>{ try{ m.delete(); }catch(e){} });
  }

  function fallbackProjection(){
    if(!viewMat){ showToast('טען תמונה קודם'); return; }
    let img = viewMat.clone();
    let bin = new cv.Mat(); cv.adaptiveThreshold(img, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 31, 5);
    const W = bin.cols, H = bin.rows;
    const sumCols = new Float32Array(W), sumRows = new Float32Array(H);
    for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ sumRows[y]+=bin.ucharPtr(y,x)[0]; } }
    for(let x=0;x<W;x++){ for(let y=0;y<H;y++){ sumCols[x]+=bin.ucharPtr(y,x)[0]; } }
    const smooth = (arr, k=25) => { const out=new Float32Array(arr.length), half=(k>>1);
      for(let i=0;i<arr.length;i++){ let s=0,c=0; for(let j=-half;j<=half;j++){ const t=i+j; if(t>=0&&t<arr.length){s+=arr[t];c++;}} out[i]=s/c; } return out; };
    const rS=smooth(sumRows,25), cS=smooth(sumCols,25);
    function peaks(a,minDist,thrFrac=0.6){ const out=[]; let last=-1e9; const thr=thrFrac*Math.max(...a);
      for(let i=1;i<a.length-1;i++){ if(a[i]>a[i-1]&&a[i]>a[i+1]&&a[i]>thr){ if(i-last>minDist){ out.push(i); last=i; } } } return out; }
    const minDy=Math.round(H/20), minDx=Math.round(W/20);
    const ys=[0,...peaks(rS,minDy),H], xs=[0,...peaks(cS,minDx),W];
    const cw=overlayCanvas.width, ch=overlayCanvas.height, ar=viewMat.cols/viewMat.rows, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    const sx = dw / viewMat.cols, sy = dh / viewMat.rows;
    gridX = xs.map(x => Math.round(dx + x*sx));
    gridY = ys.map(y => Math.round(dy + y*sy));
    window.__tash.gridX = gridX; window.__tash.gridY = gridY;
    drawOverlays();
    [img,bin].forEach(m=>{ try{ m.delete(); }catch(e){} });
  }

  function exportGrid(){
    const cols = Math.max(1, gridX.length - 1);
    const rows = Math.max(1, gridY.length - 1);
    const payload = { version:"v4.2.2", rows, cols, created_at:new Date().toISOString(), cells:[], words:[] };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
  }

  function clearAll(){
    try{ if(viewMat) viewMat.delete(); }catch(e){}
    viewMat = null; srcImg = null; gridX=[]; gridY=[];
    window.__tash.viewMat = null; window.__tash.gridX = []; window.__tash.gridY = [];
    ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
    octx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    setStatus('נוקה.');
    metaEl.textContent=''; statsEl.textContent='';
    // reset inputs
    const cam=$('#fileInputCamera'), gal=$('#fileInputGallery'); if(cam) cam.value=''; if(gal) gal.value='';
  }

  $('#detectGridBtn').addEventListener('click', detectGrid);
  $('#fallbackBtn').addEventListener('click', fallbackProjection);
  $('#exportGridBtn').addEventListener('click', exportGrid);
  $('#toggleOverlayBtn').addEventListener('click', ()=>{ overlayVisible=!overlayVisible; overlayCanvas.style.opacity=overlayVisible?1:0; });
  $('#clearBtn').addEventListener('click', clearAll);
  fileCam.addEventListener('change', e => onFile(e.target.files[0]));
  fileGal.addEventListener('change', e => onFile(e.target.files[0]));

  resizeCanvases();
  setStatus('מוכן. טען/י תמונה, ואז "גלה גריד".');
})();