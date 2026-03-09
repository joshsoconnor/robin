import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { query, context } = await req.json();

        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error("Missing GEMINI_API_KEY environment variable.");
        }

        // Prepare context summarizing string
        const stopsStr = context?.routeStops ? JSON.stringify(context.routeStops) : 'Unknown';
        const locStr = context?.currentLocation ? JSON.stringify(context.currentLocation) : 'Unknown';
        const cairnsStr = context?.cairns ? JSON.stringify(context.cairns) : 'Unknown';

        const systemInstruction =
            `You are Robin, an AI co-pilot for a delivery driver.
Keep your answers EXTREMELY concise, ideally 1 sentence, max 2. The driver is driving.
Current User Location: ${locStr}
Route Stops: ${stopsStr}
Nearby App Points of Interest (Cairns): ${cairnsStr}

You MUST return your response as a JSON object:
{
  "response": "The text you want to speak back to the driver",
  "action": { "type": "reroute", "stopId": "identifier" } // Optional. Use ONLY if the driver explicitly agrees to hit a nearby stop or change destination.
}`;

        const payload = {
            contents: [{
                role: "user",
                parts: [{ text: query }]
            }],
            systemInstruction: {
                role: "system",
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                temperature: 0.1, // Lower temperature for more reliable JSON
                maxOutputTokens: 150,
                response_mime_type: "application/json",
            }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"response": "Sorry, I couldn\'t process that."}';

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            parsed = { response: rawText.replace(/[\{\}]/g, '').split(':')[1] || rawText };
        }

        return new Response(
            JSON.stringify(parsed),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
    }
});
