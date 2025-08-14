// kept for compatibility – not used in v4.4.1
export default async () => new Response(JSON.stringify({ ok:true, note:'Not used in v4.4.1' }), { headers:{'content-type':'application/json'} });