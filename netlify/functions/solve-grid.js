// /.netlify/functions/solve-grid
export default async (req) => {
  try {
    const body = await req.json();
    const { imageBase64, model = "gpt-4o" } = body || {};
    if (!imageBase64) return new Response(JSON.stringify({ error: "missing imageBase64" }), { status: 400 });

    const messages = [
      { role: "system", content: "אתה מזהה גריד של תשחץ מתמונה. החזר JSON בלבד בסכמה: {rows, cols, width, height, gridX: number[], gridY: number[]}." },
      { role: "user", content: [
          { type: "text", text: "זהה קווי רשת אופקיים ואנכיים. ענה בפיקסלים של התמונה (width/height). החזר gridX/gridY כמערכים." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]}
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" } })
    });

    const data = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ error: data, modelTried: model }), { status: r.status, headers:{'content-type':'application/json'} });

    const content = data?.choices?.[0]?.message?.content || "{}";
    let json; try { json = JSON.parse(content); } catch { json = {}; }
    json.modelUsed = model;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
