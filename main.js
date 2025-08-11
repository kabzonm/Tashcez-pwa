(() => {
  // Assumes same globals from v4.2.1 page; this patch focuses on detection & overlay only.
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas');
  const detectBtn = $('#detectGridBtn'), exportBtn = $('#exportGridBtn'), toggleBtn = $('#toggleOverlayBtn'), fallbackBtn = $('#fallbackBtn');
  const ctx = imageCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');
  const stats = $('#stats');

  // if running as patch, create minimal state:
  window.__tash = window.__tash || {};
  const st = window.__tash;
  st.overlayVisible = st.overlayVisible ?? true;
  st.gridX = st.gridX || []; st.gridY = st.gridY || [];
  st.viewMat = st.viewMat || null; // should be set by the host app
  st.cvReady = typeof cv !== 'undefined' && cv.Mat;

  function drawOverlays(){
    const w=overlayCanvas.width, h=overlayCanvas.height;
    octx.clearRect(0,0,w,h);
    if(!st.gridX.length && !st.gridY.length) return;
    // vertical = green, horizontal = orange
    octx.lineWidth = 1.5;
    octx.strokeStyle = 'rgba(6,214,160,.95)';
    st.gridX.forEach(x=>{ octx.beginPath(); octx.moveTo(x+0.5,0); octx.lineTo(x+0.5,h); octx.stroke(); });
    octx.strokeStyle = 'rgba(239,158,54,.95)';
    st.gridY.forEach(y=>{ octx.beginPath(); octx.moveTo(0,y+0.5); octx.lineTo(w,y+0.5); octx.stroke(); });
  }

  function detectGrid(){
    if(!st.cvReady || !st.viewMat){ stats.textContent='אין תמונה / OpenCV לא מוכן'; return; }
    const img = st.viewMat.clone();
    // Pre-clean: blur + adaptive threshold
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

    // Edges and Hough
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
      const ang = Math.abs(Math.atan2(dy,dx))*180/Math.PI;
      if(Math.abs(dy) < 2 && len >= 0.85*W){ yRaw.push((y1+y2)/2); }
      else if(Math.abs(dx) < 2 && len >= 0.85*H){ xRaw.push((x1+x2)/2); }
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

    // Map to overlay canvas assuming same scaling used by host
    const cw=overlayCanvas.width, ch=overlayCanvas.height;
    // Estimate drawn region (center-fit assumption as ב-v4.2.1)
    const ar = st.viewMat.cols/st.viewMat.rows, arC = cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    const sx = dw / st.viewMat.cols, sy = dh / st.viewMat.rows;

    st.gridX = xM.map(x => Math.round(dx + x*sx));
    st.gridY = yM.map(y => Math.round(dy + y*sy));

    drawOverlays();
    stats.textContent = `Hough: אנכיים=${xM.length}, אופקיים=${yM.length}`;

    [img,bin,cnts,hier,edges,lines].forEach(m=>{ try{ m.delete(); }catch(e){} });
  }

  detectBtn.addEventListener('click', detectGrid);
  exportBtn.addEventListener('click', ()=>{
    const cols = Math.max(1, st.gridX.length-1), rows = Math.max(1, st.gridY.length-1);
    const payload = {version:'v4.2.2', rows, cols, created_at:new Date().toISOString(), cells:[], words:[]};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  toggleBtn.addEventListener('click', ()=>{ st.overlayVisible=!st.overlayVisible; overlayCanvas.style.opacity = st.overlayVisible?1:0; });

  // expose patch API
  window.__tashPatch = { detectGrid, drawOverlays };
})();