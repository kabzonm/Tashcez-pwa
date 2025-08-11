(() => {
  const $ = s => document.querySelector(s);
  const imageCanvas = $('#imageCanvas'), overlayCanvas = $('#overlayCanvas'), wrap = $('#canvasWrap');
  const fileInput = $('#fileInput'), statusEl = $('#status'), toast = $('#toast');
  const ctx = imageCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');
  let imageBitmap = null, overlayVisible = true;

  const showToast = m => { toast.textContent = m; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1500); };
  const setStatus = m => statusEl.textContent = m;

  function resizeCanvases(){
    const size = Math.round(wrap.getBoundingClientRect().width);
    [imageCanvas, overlayCanvas].forEach(c => { c.width=size; c.height=size; c.getContext('2d').clearRect(0,0,size,size); });
    drawImageFit();
    overlayCanvas.style.opacity = overlayVisible ? 1 : 0;
  }

  async function onFile(e){
    const f = e.target.files[0]; if(!f){ setStatus('לא נבחרה תמונה'); return; }
    const ab = await f.arrayBuffer(); imageBitmap = await createImageBitmap(new Blob([ab]));
    drawImageFit(); setStatus(`תמונה נטענה: ${f.name}`);
  }

  function drawImageFit(){
    const cw=imageCanvas.width, ch=imageCanvas.height;
    ctx.clearRect(0,0,cw,ch); if(!imageBitmap) return;
    const iw=imageBitmap.width, ih=imageBitmap.height, ar=iw/ih, arC=cw/ch;
    let dw,dh,dx,dy; if(ar>arC){ dw=cw; dh=Math.round(cw/ar); dx=0; dy=Math.round((ch-dh)/2); } else { dh=ch; dw=Math.round(ch*ar); dy=0; dx=Math.round((cw-dw)/2); }
    ctx.imageSmoothingQuality='high'; ctx.drawImage(imageBitmap,dx,dy,dw,dh);
  }

  function drawDemoGrid(){
    const N=14, w=overlayCanvas.width, h=overlayCanvas.height;
    octx.clearRect(0,0,w,h); octx.lineWidth=1;
    for(let i=0;i<=N;i++){
      const x=Math.round(i*(w/N))+0.5, y=Math.round(i*(h/N))+0.5;
      octx.strokeStyle = i%5===0 ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.2)';
      octx.beginPath(); octx.moveTo(x,0); octx.lineTo(x,h); octx.stroke();
      octx.beginPath(); octx.moveTo(0,y); octx.lineTo(w,y); octx.stroke();
    }
    octx.strokeStyle='rgba(255,203,71,.9)'; octx.lineWidth=2; octx.strokeRect(1,1,w-2,h-2);
  }

  function clearGrid(){ octx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height); }

  function exportGrid(){
    // Placeholder: this will later be replaced by real grid detection.
    const N = 14;
    const cells = [];
    for(let r=0;r<N;r++){
      for(let c=0;c<N;c++){
        cells.push({
          r, c, type: "empty",
          bbox: null, fg_mean: null,
          ocr: null, meta: {}
        });
      }
    }
    const payload = {
      version: "v3-demo",
      rows: N, cols: N,
      created_at: new Date().toISOString(),
      source_image_present: !!imageBitmap,
      cells, words: []
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grid.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('grid.json נוצר');
  }

  // UI
  $('#drawGridBtn').addEventListener('click', ()=>{ drawDemoGrid(); showToast('גריד דמו צויר'); });
  $('#clearGridBtn').addEventListener('click', clearGrid);
  $('#toggleOverlayBtn').addEventListener('click', ()=>{ overlayVisible=!overlayVisible; overlayCanvas.style.opacity=overlayVisible?1:0; });
  $('#fitBtn').addEventListener('click', drawImageFit);
  $('#clearBtn').addEventListener('click', ()=>{ imageBitmap=null; ctx.clearRect(0,0,imageCanvas.width,imageCanvas.height); clearGrid(); fileInput.value=''; setStatus('נוקה.'); });
  $('#exportGridBtn').addEventListener('click', exportGrid);
  fileInput.addEventListener('change', onFile);

  new ResizeObserver(resizeCanvases).observe(wrap);
  resizeCanvases(); setStatus('מוכן. טען/י תמונה והצג/י גריד דמו לאימות.');
})();