document.addEventListener('DOMContentLoaded', () => {
  const modelSelect = document.getElementById('modelSelect');
  const runSingleBtn = document.getElementById('runSingle');
  const runAllBtn = document.getElementById('runAll');
  const legendDiv = document.getElementById('legend');

  // Load saved model
  const savedModel = localStorage.getItem('selectedModel');
  if (savedModel) modelSelect.value = savedModel;

  modelSelect.addEventListener('change', () => {
    localStorage.setItem('selectedModel', modelSelect.value);
  });

  runSingleBtn.addEventListener('click', () => {
    runModel(modelSelect.value);
  });

  runAllBtn.addEventListener('click', () => {
    runAllModels();
  });

  function runModel(model) {
    console.log('Running model:', model);
    legendDiv.innerHTML = `<div class='legend-item'><div class='legend-color' style='background:blue'></div>${model} ✔</div>`;
    // כאן יתבצע קריאה אמיתית ל-API
  }

  function runAllModels() {
    const models = [
      {name: 'gpt-4o', color: 'blue'},
      {name: 'gpt-5', color: 'green'},
      {name: 'gpt-5-mini', color: 'orange'}
    ];
    legendDiv.innerHTML = models.map(m =>
      `<div class='legend-item'><div class='legend-color' style='background:${m.color}'></div>${m.name}${m.name===modelSelect.value?' ✔':''}</div>`
    ).join('');
    console.log('Running all models...');
  }
});
