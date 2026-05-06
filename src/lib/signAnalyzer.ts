/**
 * Sign Analyzer — uses Gemini Vision AI to extract structured rules
 * from photos of street signs (clearways, school zones, parking restrictions).
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

import { checkCircuitBreaker, setRequestInProgress, executeWithBackoff } from './circuitBreaker';

export interface SignData {
    category: 'clearway' | 'school_zone' | 'parking' | 'loading_zone' | 'other';
    description: string;
    active_window?: { start: string; end: string };
    days?: string[];
    warnings?: {
        inside: string;
        outside: string;
    };
}

/**
 * Analyze a photo of a street sign and extract structured restriction data.
 * Returns null if Gemini is unavailable or cannot parse the sign.
 */
export async function analyzeSignPhoto(
    base64: string,
    mimeType: string
): Promise<SignData | null> {
    if (!GEMINI_API_KEY) {
        console.warn('No Gemini API key — sign analysis unavailable.');
        return null;
    }

    const prompt = `You are an Australian road sign analyzer for a delivery driver app.
Analyze this photo of a street sign and extract the restriction rules.

Return ONLY valid JSON, no markdown, no explanation. Format:
{
  "category": "clearway" | "school_zone" | "parking" | "loading_zone" | "other",
  "description": "Brief description of the sign",
  "active_window": { "start": "HH:MM", "end": "HH:MM" },
  "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "warnings": {
    "inside": "Warning message when restriction IS active (e.g. 'Clearway active — do not park here')",
    "outside": "Message when restriction is NOT active (e.g. 'Clearway over — street parking is allowed')"
  }
}

Rules:
- Use 24-hour time format for active_window
- If the sign applies all days, include all 7 days
- If the sign applies weekdays only, include Mon-Fri
- If you cannot determine times or days, omit those fields
- If the photo is not a street sign, return {"category": "other", "description": "Not a recognizable street sign"}`;

    const isSafe = await checkCircuitBreaker();
    if (!isSafe) {
        console.warn('CircuitBreaker blocked sign analysis call.');
        return null;
    }

    setRequestInProgress(true);

    try {
        const response = await executeWithBackoff(async () => {
            const payload = JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64 } }
                    ]
                }]
            });
            
            let res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                }
            );

            if (!res.ok) {
                if (res.status === 429 || res.status === 404 || res.status === 503) {
                    console.log("Primary model failed, falling back to gemini-flash-latest...");
                    res = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: payload
                        }
                    );
                }
            }

            if (!res.ok) {
                // Determine if we should throw for retry
                const error = new Error(`Gemini sign analysis API error: ${res.statusText}`);
                (error as any).status = res.status;
                throw error;
            }
            return res;
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(clean) as SignData;
    } catch (err) {
        console.error('Failed to analyze sign photo:', err);
        return null;
    } finally {
        setRequestInProgress(false);
    }
}
