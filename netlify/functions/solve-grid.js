// /.netlify/functions/solve-grid
// Requires env var: OPENAI_API_KEY
export default async (req, context) => {
  try {
    const body = await req.json();
    const imageBase64 = body.imageBase64;
    if (!imageBase64) return new Response(JSON.stringify({error:'missing imageBase64'}), {status:400});

    const payload = {
      model: "gpt-4.1-mini", // vision-capable; adjust if needed
      messages: [
        { role: "system", content: "אתה מזהה גריד של תשחץ מתמונה. החזר JSON בלבד בסכימה: {rows, cols, width, height, gridX: number[], gridY: number[]}. אין טקסט חופשי." },
        { role: "user", content: [
          { type: "text", text: "זהה קווי רשת אופקיים ואנכיים. ענה ביחידות פיקסל ביחס לתמונה שנשלחה (width/height). החזר gridX ו-gridY כמערכי מיקומים." },
          { type: "image_url", image_url: "data:image/jpeg;base64," + imageBase64 }
        ]}
      ],
      response_format: { type: "json_object" }
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) return new Response(JSON.stringify(data), {status:r.status});
    const content = data.choices?.[0]?.message?.content || "{}";
    return new Response(content, {headers:{'content-type':'application/json'}});
  } catch (e) {
    return new Response(JSON.stringify({error:String(e)}), {status:500, headers:{'content-type':'application/json'}});
  }
};
