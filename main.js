(() => {
const $ = s => document.querySelector(s);
const imageCanvas = $(’#imageCanvas’), overlayCanvas = $(’#overlayCanvas’), wrap = $(’#canvasWrap’);
const fileCam = $(’#fileInputCamera’), fileGal = $(’#fileInputGallery’), fullResChk = $(’#fullRes’);
const statusEl = $(’#status’), toast = $(’#toast’), warnEl = $(’#warnings’), metaEl = $(’#meta’), cvBadge = $(’#cvBadge’), logoVer = $(’#logoVer’);
const detectBtn = $(’#detectGridBtn’), detectApiBtn = $(’#detectApiBtn’), exportBtn = $(’#exportGridBtn’), toggleBtn = $(’#toggleOverlayBtn’);
const logEl = $(’#log’);
const ctx = imageCanvas.getContext(‘2d’), octx = overlayCanvas.getContext(‘2d’);

let overlayVisible = true;
let srcImg = null;  
let viewMat = null;  
let gridX = [], gridY = [], warnings = [];
let cvReady = false;
let detectedCells = [];

const log = (…a)=>{ const line=a.map(x=>typeof x===‘object’?JSON.stringify(x):String(x)).join(’ ‘); logEl.textContent+=line+’\n’; logEl.scrollTop=logEl.scrollHeight; console.log(…a); };
const showToast = m => { toast.textContent = m; toast.classList.add(‘show’); setTimeout(()=>toast.classList.remove(‘show’),1600); };
const setStatus = m => statusEl.textContent = m;

fetch(‘version.txt?ts=’+Date.now()).then(r=>r.text()).then(t=>{ logoVer.textContent = (t.split(’\n’)[0]||‘ת’).trim(); }).catch(()=>{});

$(’#hardRefreshBtn’)?.addEventListener(‘click’, async ()=>{
try{
if (‘serviceWorker’ in navigator) {
const regs = await navigator.serviceWorker.getRegistrations();
for (const r of regs) await r.unregister();
}
if (window.caches && caches.keys) {
const keys = await caches.keys();
await Promise.all(keys.map(k => caches.delete(k)));
}
}catch(e){ console.warn(e); }
location.replace(location.pathname + ‘?v=’ + Date.now());
});

function checkCV(){
if (window.cv && cv.Mat && typeof cv.Mat === ‘function’){
cvReady = true;
detectBtn.disabled = false;
cvBadge.classList.remove(‘wait’); cvBadge.classList.add(‘ok’);
cvBadge.textContent = ‘OpenCV: מוכן’;
return true;
}
return false;
}
const cvInterval = setInterval(()=>{ if(checkCV()) clearInterval(cvInterval); }, 1000);
window.addEventListener(‘load’, checkCV);

function resizeCanvases(){
const size = Math.round(wrap.getBoundingClientRect().width);
[imageCanvas, overlayCanvas].forEach(c => { c.width=size; c.height=size; c.getContext(‘2d’).clearRect(0,0,size,size); });
drawView();
overlayCanvas.style.opacity = overlayVisible ? 1 : 0;
drawOverlays();
}
new ResizeObserver(resizeCanvases).observe(wrap);

function drawView(){
ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
if(!viewMat) return;
const w = viewMat.cols, h = viewMat.rows;
const imgData = new ImageData(w, h);
for(let i=0;i<w*h;i++){ const v = viewMat.ucharPtr(Math.floor(i/w), i%w)[0]; imgData.data[i*4+0]=v; imgData.data[i*4+1]=v; imgData.data[i*4+2]=v; imgData.data[i*4+3]=255; }
const cw=imageCanvas.width, ch=imageCanvas.height, ar=w/h, arC=cw/ch;
let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
const tmp = document.createElement(‘canvas’); tmp.width=w; tmp.height=h; tmp.getContext(‘2d’).putImageData(imgData,0,0);
ctx.imageSmoothingQuality=‘high’; ctx.drawImage(tmp,dx,dy,dw,dh);
}

function drawOverlays(){
const w=overlayCanvas.width, h=overlayCanvas.height;
octx.clearRect(0,0,w,h);

```
if(gridX.length && gridY.length) {
  octx.lineWidth = 1.5;
  octx.strokeStyle = 'rgba(6,214,160,.95)';
  gridX.forEach(x=>{ octx.beginPath(); octx.moveTo(x+0.5,0); octx.lineTo(x+0.5,h); octx.stroke(); });
  octx.strokeStyle = 'rgba(239,158,54,.95)';
  gridY.forEach(y=>{ octx.beginPath(); octx.moveTo(0,y+0.5); octx.lineTo(w,y+0.5); octx.stroke(); });
}

if(detectedCells.length) {
  octx.strokeStyle = 'rgba(255,100,100,.8)';
  octx.lineWidth = 2;
  detectedCells.forEach(cell => {
    octx.strokeRect(cell.x, cell.y, cell.width, cell.height);
    octx.fillStyle = 'rgba(255,255,255,.9)';
    octx.font = '12px Arial';
    octx.fillText(`${cell.row},${cell.col}`, cell.x + 2, cell.y + 14);
  });
}
```

}

async function onFile(file){
if(!file){ setStatus(‘לא נבחרה תמונה’); return; }
const blob = file.slice(0, file.size, file.type);
const img = await createImageBitmap(blob);
srcImg = img;
metaEl.textContent = `תמונה נטענה (${img.width}×${img.height})`;

```
if (!cvReady) await new Promise(r=>setTimeout(r,300));

const maxSide = fullResChk.checked ? Math.max(img.width, img.height) : 1200;
const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
const tw = Math.max(1, Math.round(img.width * scale));
const th = Math.max(1, Math.round(img.height * scale));

const tmp = document.createElement('canvas'); 
tmp.width = tw; 
tmp.height = th;
tmp.getContext('2d').drawImage(img, 0, 0, tw, th);

const tctx = tmp.getContext('2d');
let src = new cv.Mat(th, tw, cv.CV_8UC4); 
src.data.set(tctx.getImageData(0, 0, tw, th).data);

let gray = new cv.Mat(); 
cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

let clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
let enhanced = new cv.Mat();
clahe.apply(gray, enhanced);

let warped = await findAndWarpGrid(enhanced);

if(viewMat) try{ viewMat.delete(); }catch(e){}
viewMat = warped;

[src, gray, enhanced].forEach(m=>{ try{ m.delete(); }catch(e){} });
clahe.delete();

gridX = []; gridY = []; warnings = []; detectedCells = [];
resizeCanvases();
setStatus('תמונה נטענה ומיושרת. לחץ "גלה גריד".');
```

}

async function findAndWarpGrid(grayImage) {
let binary = new cv.Mat();
cv.adaptiveThreshold(grayImage, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 10);

```
let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
let cleaned = new cv.Mat();
cv.morphologyEx(binary, cleaned, cv.MORPH_CLOSE, kernel);

let contours = new cv.MatVector();
let hierarchy = new cv.Mat();
cv.findContours(cleaned, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

let bestContour = null;
let maxArea = 0;

for (let i = 0; i < contours.size(); i++) {
  let contour = contours.get(i);
  let area = cv.contourArea(contour);
  let peri = cv.arcLength(contour, true);
  let approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, 0.02 * peri, true);
  
  if (approx.rows === 4 && area > maxArea && area > grayImage.rows * grayImage.cols * 0.1) {
    maxArea = area;
    if (bestContour) bestContour.delete();
    bestContour = approx.clone();
  }
  approx.delete();
}

let result = new cv.Mat();

if (bestContour) {
  const corners = [];
  for (let i = 0; i < 4; i++) {
    const point = bestContour.intPtr(i, 0);
    corners.push({ x: point[0], y: point[1] });
  }
  
  corners.sort((a, b) => a.y - b.y);
  const top = corners.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = corners.slice(2, 4).sort((a, b) => a.x - b.x);
  const orderedCorners = [top[0], top[1], bottom[1], bottom[0]];
  
  const gridSize = 1024;
  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    orderedCorners[0].x, orderedCorners[0].y,
    orderedCorners[1].x, orderedCorners[1].y,
    orderedCorners[2].x, orderedCorners[2].y,
    orderedCorners[3].x, orderedCorners[3].y
  ]);
  
  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    gridSize, 0,
    gridSize, gridSize,
    0, gridSize
  ]);
  
  const transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
  cv.warpPerspective(grayImage, result, transform, new cv.Size(gridSize, gridSize));
  
  srcPoints.delete();
  dstPoints.delete();
  transform.delete();
} else {
  result = grayImage.clone();
  warnings.push('לא נמצא גריד מלבני ברור - משתמש בתמונה המקורית');
}

[binary, cleaned, kernel, contours, hierarchy].forEach(m => {
  try { m.delete(); } catch(e) {}
});
if (bestContour) bestContour.delete();

return result;
```

}

function detectGrid(){
log(’[detect] התחלת זיהוי גריד משופר’);
if(!cvReady){ showToast(‘OpenCV עדיין נטען…’); return; }
if(!viewMat){ showToast(‘טען תמונה קודם’); return; }

```
warnings = []; gridX = []; gridY = []; detectedCells = [];

try {
  const houghResult = detectGridHough(viewMat);
  const templateResult = detectGridTemplate(viewMat);
  const contourResult = detectGridContours(viewMat);
  
  const finalResult = combineGridResults([houghResult, templateResult, contourResult]);
  
  gridX = finalResult.gridX;
  gridY = finalResult.gridY;
  detectedCells = finalResult.cells;
  
  mapToOverlayCoordinates();
  
  drawOverlays();
  
  const rows = Math.max(0, gridY.length - 1);
  const cols = Math.max(0, gridX.length - 1);
  warnEl.textContent = `זוהו: ${rows}×${cols} (${detectedCells.length} תאים)`;
  
  log(`[detect] הושלם: ${rows} שורות, ${cols} עמודות`);
  
} catch(error) {
  log('[detect] שגיאה:', error);
  showToast('שגיאה בזיהוי הגריד');
}
```

}

function detectGridHough(img) {
let processed = img.clone();
cv.GaussianBlur(processed, processed, new cv.Size(5, 5), 0);

```
let binary = new cv.Mat();
cv.adaptiveThreshold(processed, binary, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 21, 10);

let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);

let edges = new cv.Mat();
cv.Canny(binary, edges, 50, 150, 3);

let lines = new cv.Mat();
const minLineLength = Math.max(edges.cols, edges.rows) * 0.4;
cv.HoughLinesP(edges, lines, 1, Math.PI/180, 80, minLineLength, 10);

const W = edges.cols, H = edges.rows;
let verticalLines = [], horizontalLines = [];

for(let i = 0; i < lines.rows; i++) {
  const line = lines.intPtr(i, 0);
  const x1 = line[0], y1 = line[1], x2 = line[2], y2 = line[3];
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  if (Math.abs(angle) < 10 || Math.abs(angle) > 170) {
    horizontalLines.push({y: (y1 + y2) / 2, length, angle});
  } else if (Math.abs(Math.abs(angle) - 90) < 10) {
    verticalLines.push({x: (x1 + x2) / 2, length, angle});
  }
}

const mergeThreshold = Math.min(W, H) * 0.02;
const mergedVertical = mergeLines(verticalLines.sort((a,b) => a.x - b.x), 'x', mergeThreshold);
const mergedHorizontal = mergeLines(horizontalLines.sort((a,b) => a.y - b.y), 'y', mergeThreshold);

[processed, binary, kernel, edges, lines].forEach(m => {
  try { m.delete(); } catch(e) {}
});

return {
  gridX: mergedVertical,
  gridY: mergedHorizontal,
  confidence: calculateLineConfidence(mergedVertical, mergedHorizontal)
};
```

}

function detectGridTemplate(img) {
const templates = createGridTemplates();
const matches = [];

```
templates.forEach((template, index) => {
  let result = new cv.Mat();
  cv.matchTemplate(img, template, result, cv.TM_CCOEFF_NORMED);
  
  let minVal = new cv.Scalar(), maxVal = new cv.Scalar();
  let minLoc = new cv.Point(), maxLoc = new cv.Point();
  cv.minMaxLoc(result, minVal, maxVal, minLoc, maxLoc);
  
  if (maxVal.val[0] > 0.6) {
    matches.push({
      x: maxLoc.x + template.cols / 2,
      y: maxLoc.y + template.rows / 2,
      confidence: maxVal.val[0],
      type: index
    });
  }
  
  result.delete();
  template.delete();
});

const gridX = [...new Set(matches.map(m => m.x))].sort((a,b) => a-b);
const gridY = [...new Set(matches.map(m => m.y))].sort((a,b) => a-b);

return {
  gridX,
  gridY,
  confidence: matches.length > 0 ? matches.reduce((s,m) => s + m.confidence, 0) / matches.length : 0
};
```

}

function detectGridContours(img) {
let binary = new cv.Mat();
cv.adaptiveThreshold(img, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

```
let contours = new cv.MatVector();
let hierarchy = new cv.Mat();
cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

const cells = [];
const minArea = (img.rows * img.cols) / 2000;
const maxArea = (img.rows * img.cols) / 50;

for (let i = 0; i < contours.size(); i++) {
  const contour = contours.get(i);
  const area = cv.contourArea(contour);
  
  if (area > minArea && area < maxArea) {
    const rect = cv.boundingRect(contour);
    const aspectRatio = rect.width / rect.height;
    
    if (aspectRatio > 0.5 && aspectRatio < 2.0) {
      cells.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        area,
        aspectRatio
      });
    }
  }
}

[binary, contours, hierarchy].forEach(m => {
  try { m.delete(); } catch(e) {}
});

const gridX = [...new Set(cells.map(c => c.x).concat(cells.map(c => c.x + c.width)))].sort((a,b) => a-b);
const gridY = [...new Set(cells.map(c => c.y).concat(cells.map(c => c.y + c.height)))].sort((a,b) => a-b);

return {
  gridX,
  gridY,
  cells,
  confidence: cells.length > 10 ? 0.8 : 0.3
};
```

}

function mergeLines(lines, coord, threshold) {
const merged = [];

```
lines.forEach(line => {
  const pos = line[coord];
  let found = false;
  
  for (let existing of merged) {
    if (Math.abs(existing - pos) <= threshold) {
      found = true;
      break;
    }
  }
  
  if (!found) {
    merged.push(pos);
  }
});

return merged;
```

}

function calculateLineConfidence(vertical, horizontal) {
const expectedRows = 15;
const expectedCols = 15;

```
const rowScore = Math.min(1, horizontal.length / expectedRows);
const colScore = Math.min(1, vertical.length / expectedCols);

return (rowScore + colScore) / 2;
```

}

function createGridTemplates() {
const size = 21;
const templates = [];

```
const cross = new cv.Mat(size, size, cv.CV_8UC1, new cv.Scalar(0));
const center = Math.floor(size / 2);

for (let x = 0; x < size; x++) {
  cross.ucharPtr(center, x)[0] = 255;
}
for (let y = 0; y < size; y++) {
  cross.ucharPtr(y, center)[0] = 255;
}

templates.push(cross);
return templates;
```

}

function combineGridResults(results) {
let bestResult = results[0];

```
for (let result of results) {
  if (result.confidence > bestResult.confidence) {
    bestResult = result;
  }
}

return {
  gridX: bestResult.gridX || [],
  gridY: bestResult.gridY || [],
  cells: bestResult.cells || []
};
```

}

function mapToOverlayCoordinates() {
const cw = overlayCanvas.width, ch = overlayCanvas.height;
const ar = viewMat.cols / viewMat.rows, arC = cw / ch;

```
let dw, dh, dx, dy;
if (ar > arC) {
  dw = cw;
  dh = Math.round(cw / ar);
  dx = 0;
  dy = Math.round((ch - dh) / 2);
} else {
  dh = ch;
  dw = Math.round(ch * ar);
  dy = 0;
  dx = Math.round((cw - dw) / 2);
}

const sx = dw / viewMat.cols, sy = dh / viewMat.rows;

gridX = gridX.map(x => Math.round(dx + x * sx));
gridY = gridY.map(y => Math.round(dy + y * sy));

detectedCells = detectedCells.map(cell => ({
  ...cell,
  x: Math.round(dx + cell.x * sx),
  y: Math.round(dy + cell.y * sy),
  width: Math.round(cell.width * sx),
  height: Math.round(cell.height * sy)
}));
```

}

async function detectGridAPI(){
if(!srcImg){ showToast(‘טען תמונה קודם’); return; }
setStatus(‘שולח ל-API…’);
const tmp = document.createElement(‘canvas’); tmp.width=srcImg.width; tmp.height=srcImg.height;
tmp.getContext(‘2d’).drawImage(srcImg,0,0);
const blob = await new Promise(r=> tmp.toBlob(r,‘image/jpeg’,0.95));
const b64 = await blobToBase64(blob);
const resp = await fetch(’/.netlify/functions/solve-grid’, {
method:‘POST’, headers:{‘Content-Type’:‘application/json’},
body: JSON.stringify({ imageBase64: b64 })
});
const data = await resp.json();
log(’[api]’, data);
const cw=overlayCanvas.width, ch=overlayCanvas.height;
gridX = (data.gridX||[]).map(x=>Math.round(x/ (data.width||1024) * cw));
gridY = (data.gridY||[]).map(y=>Math.round(y/ (data.height||1024) * ch));
drawOverlays();
warnEl.textContent = `API: rows=${data.rows||'?'} cols=${data.cols||'?'}`;
setStatus(‘ה‑API החזיר תוצאה’);
}

function blobToBase64(blob){
return new Promise((resolve,reject)=>{
const fr = new FileReader();
fr.onload = () => resolve(fr.result.split(’,’)[1]);
fr.onerror = reject;
fr.readAsDataURL(blob);
});
}

function exportGrid(){
const cols = Math.max(1, gridX.length - 1);
const rows = Math.max(1, gridY.length - 1);
const cells = [];

```
for(let r = 0; r < rows; r++){
  for(let c = 0; c < cols; c++){
    const x0 = gridX[c] || 0, x1 = gridX[c+1] || gridX[gridX.length-1];
    const y0 = gridY[r] || 0, y1 = gridY[r+1] || gridY[gridY.length-1];
    
    const matchingCell = detectedCells.find(cell => 
      Math.abs(cell.x - x0) < 10 && Math.abs(cell.y - y0) < 10
    );
    
    const cellType = matchingCell ? "empty" : "blocked";
    
    cells.push({ 
      r, c, 
      type: cellType, 
      bbox: [x0, y0, x1-x0, y1-y0], 
      stats: matchingCell ? {
        area: matchingCell.area,
        aspectRatio: matchingCell.aspectRatio
      } : {}, 
      ocr: null, 
      meta: {} 
    });
  }
}

const payload = { 
  version: "v4.3.0", 
  rows, 
  cols, 
  created_at: new Date().toISOString(), 
  warnings, 
  cells, 
  words: [],
  detection_method: "hybrid",
  confidence: detectedCells.length > 0 ? 0.8 : 0.5
};

const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
const a = document.createElement('a'); 
a.href = URL.createObjectURL(blob); 
a.download = 'grid.json'; 
a.click(); 
URL.revokeObjectURL(a.href);
showToast('grid.json נוצר עם מידע משופר');
```

}

function clearAll(){
try{ if(viewMat) viewMat.delete(); }catch(e){}
viewMat = null; srcImg = null; gridX=[]; gridY=[]; warnings=[]; detectedCells=[];
ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height);
octx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
(fileCam||{}).value = ‘’; (fileGal||{}).value = ‘’;
setStatus(‘נוקה.’); metaEl.textContent=’’; warnEl.textContent=’’; logEl.textContent=’’;
}

detectBtn?.addEventListener(‘click’, detectGrid);
detectApiBtn?.addEventListener(‘click’, detectGridAPI);
exportBtn?.addEventListener(‘click’, exportGrid);
toggleBtn?.addEventListener(‘click’, ()=>{ overlayVisible=!overlayVisible; overlayCanvas.style.opacity=overlayVisible?1:0; });
$(’#clearBtn’)?.addEventListener(‘click’, clearAll);
fileCam?.addEventListener(‘change’, e => onFile(e.target.files[0]));
fileGal?.addEventListener(‘change’, e => onFile(e.target.files[0]));

new ResizeObserver(resizeCanvases).observe(wrap);
resizeCanvases();
setStatus(‘מוכן. טען תמונה, ואז "גלה גריד (מקומי)" או "גלה גריד (API)".’);
})();