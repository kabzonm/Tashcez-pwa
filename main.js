(() => {
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileCam = $('#fileInputCamera'), fileGal = $('#fileInputGallery');
  const statusEl = $('#status'), toast = $('#toast'), warnEl = $('#warnings');
  const ctx = imageCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');
  let imageBitmap = null, overlayVisible = true;
  let gridX = [], gridY = [], warnings = [];

  const showToast = m => { toast.textContent = m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1600); };
  const setStatus = m => statusEl.textContent = m;

  function resizeCanvases(){
    const size = Math.round(wrap.getBoundingClientRect().width);
    [imageCanvas, overlayCanvas].forEach(c => { c.width=size; c.height=size; c.getContext('2d').clearRect(0,0,size,size); });
    drawImageFit();
    overlayCanvas.style.opacity = overlayVisible ? 1 : 0;
    drawOverlays();
  }

  async function onFile(file){
    if(!file){ setStatus('לא נבחרה תמונה'); return; }
    const ab = await file.arrayBuffer(); imageBitmap = await createImageBitmap(new Blob([ab]));
    drawImageFit(); setStatus(`תמונה נטענה: ${file.name}`);
    gridX = []; gridY = []; warnings = [];
    drawOverlays();
  }

  function drawImageFit(){
    const cw=imageCanvas.width, ch=imageCanvas.height;
    ctx.clearRect(0,0,cw,ch); if(!imageBitmap) return;
    const iw=imageBitmap.width, ih=imageBitmap.height, ar=iw/ih, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    ctx.imageSmoothingQuality='high'; ctx.drawImage(imageBitmap,dx,dy,dw,dh);
  }

  function drawOverlays(){
    const w=overlayCanvas.width, h=overlayCanvas.height;
    octx.clearRect(0,0,w,h);
    // grid lines
    octx.lineWidth = 1.5;
    octx.strokeStyle = 'rgba(6,214,160,.9)';
    gridX.forEach(x=>{ octx.beginPath(); octx.moveTo(x+0.5, 0); octx.lineTo(x+0.5, h); octx.stroke(); });
    gridY.forEach(y=>{ octx.beginPath(); octx.moveTo(0, y+0.5); octx.lineTo(w, y+0.5); octx.stroke(); });
  }

  function exportGrid(){
    if(!gridX.length || !gridY.length){
      showToast('אין גריד מזוהה – מפיק דמו 14x14');
    }
    const cols = Math.max(1, gridX.length - 1);
    const rows = Math.max(1, gridY.length - 1);
    const cells = [];
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x0 = gridX[c], x1 = gridX[c+1];
        const y0 = gridY[r], y1 = gridY[r+1];
        cells.push({ r, c, type: "unknown", bbox: [x0,y0,x1-x0,y1-y0], stats: {}, ocr: null, meta: {} });
      }
    }
    const payload = {
      version: "v4",
      rows, cols,
      created_at: new Date().toISOString(),
      warnings,
      cells, words: []
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='grid.json'; a.click(); URL.revokeObjectURL(a.href);
    showToast('grid.json נוצר');
  }

  // --- OpenCV helpers ---
  function ensureCVReady(){
    if (typeof cv === 'undefined' || !cv.Mat){
      showToast('OpenCV עדיין נטען... נסה שוב בעוד רגע');
      return false;
    }
    return true;
  }

  function toMatFromCanvas(){
    const w = imageCanvas.width, h = imageCanvas.height;
    const src = new cv.Mat(h, w, cv.CV_8UC4);
    const imgData = ctx.getImageData(0,0,w,h);
    src.data.set(imgData.data);
    return src;
  }

  function detectGrid(){
    if(!ensureCVReady()) return;
    if(!imageBitmap){ showToast('טען תמונה קודם'); return; }
    warnings = [];

    let src = toMatFromCanvas();
    let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    // Light blur & adaptive threshold to emphasize structure
    let blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);
    let bin = new cv.Mat(); cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 33, 5);

    // --- text mask (very small components) ---
    let cnts = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(bin, cnts, hier, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    let textMask = cv.Mat.zeros(bin.rows, bin.cols, cv.CV_8UC1);
    for(let i=0;i<cnts.size();i++){
      const c = cnts.get(i);
      const rect = cv.boundingRect(c);
      const area = rect.width * rect.height;
      if(area < (bin.rows*bin.cols)*0.0004){ // small areas -> likely text strokes
        cv.rectangle(textMask, new cv.Point(rect.x, rect.y), new cv.Point(rect.x+rect.width, rect.y+rect.height), new cv.Scalar(255), -1);
      }
      c.delete();
    }
    // remove text from bin
    let notText = new cv.Mat(); cv.bitwise_not(textMask, notText);
    let binNoText = new cv.Mat(); cv.bitwise_and(bin, notText, binNoText);

    // Canny + Hough on cleaned image
    let edges = new cv.Mat();
    cv.Canny(binNoText, edges, 50, 150);
    let lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI/180, 100, 0.6*Math.max(edges.rows, edges.cols), 10);

    // Filter lines by near-horizontal/vertical & length
    const W = edges.cols, H = edges.rows;
    const minLenX = 0.90 * W, minLenY = 0.90 * H;
    let xLines = [], yLines = [];

    for (let i=0; i<lines.rows; i++) {
      const x1 = lines.intPtr(i,0)[0];
      const y1 = lines.intPtr(i,0)[1];
      const x2 = lines.intPtr(i,0)[2];
      const y2 = lines.intPtr(i,0)[3];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx,dy);
      const angle = Math.atan2(dy,dx) * 180 / Math.PI;

      if (Math.abs(dy) < 2 && len >= minLenX) { // horizontal
        yLines.push((y1+y2)/2);
      } else if (Math.abs(dx) < 2 && len >= minLenY) { // vertical
        xLines.push((x1+x2)/2);
      }
    }

    // Merge nearby lines
    function mergeLines(arr, tol){
      arr.sort((a,b)=>a-b);
      const out=[];
      for(const v of arr){
        if(out.length===0 || Math.abs(out[out.length-1]-v)>tol){ out.push(v); }
        else { out[out.length-1]=(out[out.length-1]+v)/2; }
      }
      return out;
    }
    const tolX = W * 0.01, tolY = H * 0.01;
    xLines = mergeLines(xLines, tolX);
    yLines = mergeLines(yLines, tolY);

    // Validate periodicity (basic)
    function validatePeriodic(lines, axisLen){
      if(lines.length<3) return {ok:false, lines, spacings:[], warn:'מעט מדי קווים'};
      const spacings=[];
      for(let i=1;i<lines.length;i++){ spacings.push(lines[i]-lines[i-1]); }
      const mean = spacings.reduce((a,b)=>a+b,0)/spacings.length;
      const sd = Math.sqrt(spacings.reduce((a,b)=>a+(b-mean)*(b-mean),0)/spacings.length);
      const cvv = sd/mean;
      const ok = cvv < 0.25;
      return {ok, lines, spacings, warn: ok? null : 'מרווחים לא עקביים'};
    }
    const vx = validatePeriodic(xLines, W);
    const vy = validatePeriodic(yLines, H);
    warnings = [];
    if(!vx.ok) warnings.push('אנכי: ' + vx.warn);
    if(!vy.ok) warnings.push('אופקי: ' + vy.warn);

    function withBorders(lines, axisLen){
      const out = [...lines];
      if (!out.length || out[0] > axisLen*0.02) out.unshift(0);
      if (!out.length || out[out.length-1] < axisLen*0.98) out.push(axisLen);
      return out;
    }
    gridX = withBorders(xLines, W);
    gridY = withBorders(yLines, H);

    drawOverlays();
    warnEl.textContent = warnings.length ? ('אזהרות: ' + warnings.join(' | ')) : 'אזהרות: אין';

    // cleanup
    [src,gray,blur,bin,cnts,hier,textMask,notText,binNoText,edges,lines].forEach(m=>{ try{ m.delete(); }catch(e){} });
    showToast('זיהוי גריד הושלם (בסיס)');
  }

  // UI
  $('#detectGridBtn').addEventListener('click', detectGrid);
  $('#toggleMasksBtn').addEventListener('click', ()=>{
    showToast('תצוגת מסכות תתווסף ב-v4.x');
  });
  $('#exportGridBtn').addEventListener('click', exportGrid);
  $('#toggleOverlayBtn').addEventListener('click', ()=>{ overlayVisible=!overlayVisible; overlayCanvas.style.opacity=overlayVisible?1:0; });
  $('#fitBtn').addEventListener('click', drawImageFit);
  $('#clearBtn').addEventListener('click', ()=>{ imageBitmap=null; ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height); gridX=[];gridY=[];warnings=[]; drawOverlays(); setStatus('נוקה.'); warnEl.textContent=''; });

  fileCam.addEventListener('change', e => onFile(e.target.files[0]));
  fileGal.addEventListener('change', e => onFile(e.target.files[0]));

  new ResizeObserver(resizeCanvases).observe(wrap);
  resizeCanvases();
  setStatus('מוכן. טען/י תמונה, ואז "גלה גריד (v4)".');
})();