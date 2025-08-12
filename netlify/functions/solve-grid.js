exports.handler = async (event) => {
  const { model = 'gpt-4o' } = JSON.parse(event.body || '{}');
  return {
    statusCode: 200,
    body: JSON.stringify({
      modelUsed: model,
      rows: [],
      cols: [],
      gridX: [],
      gridY: []
    })
  };
};
