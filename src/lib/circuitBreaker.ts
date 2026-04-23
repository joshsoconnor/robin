import { Geolocation } from '@capacitor/geolocation';

const THROTTLE_TIME_MS = 60 * 1000;
const THROTTLE_DISTANCE_M = 500;
const MAX_CALLS_PER_5_MINS = 10;
const WARNING_WINDOW_MS = 5 * 60 * 1000;

let lastCallTimestamp = 0;
let lastCallPos: { lat: number, lng: number } | null = null;
let requestInProgress = false;

// For dev warning
let callHistory: number[] = [];

// Haversine formula for distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

export async function checkCircuitBreaker(): Promise<boolean> {
    if (requestInProgress) {
        console.warn('CircuitBreaker: Request already in progress.');
        return false;
    }

    const now = Date.now();
    
    // Check Dev Warning Window
    callHistory = callHistory.filter(t => now - t < WARNING_WINDOW_MS);
    callHistory.push(now);
    if (import.meta.env.DEV && callHistory.length > MAX_CALLS_PER_5_MINS) {
        console.warn(`[DEVELOPMENT WARNING] High Gemini API usage: ${callHistory.length} calls in last 5 minutes!`);
    }

    // Time check
    const timeSinceLast = now - lastCallTimestamp;
    if (timeSinceLast < THROTTLE_TIME_MS) {
        // Less than 60s have passed. Did they move 500m?
        if (lastCallPos) {
            try {
                // Quick resolution with low accuracy so we don't stall UI too long
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
                const dist = getDistance(
                    lastCallPos.lat, lastCallPos.lng, 
                    pos.coords.latitude, pos.coords.longitude
                );
                if (dist < THROTTLE_DISTANCE_M) {
                    console.warn(`CircuitBreaker: Throttled. Only ${Math.round(timeSinceLast/1000)}s passed and moved ${Math.round(dist)}m. Needs 60s or 500m.`);
                    return false;
                }
            } catch (e) {
                // Location failed, default to time-based throttling
                console.warn('CircuitBreaker: Throttled by time (location check failed)');
                return false;
            }
        } else {
            console.warn('CircuitBreaker: Throttled by time (no previous location)');
            return false;
        }
    }

    // Pass throttle check, update last call info
    lastCallTimestamp = now;
    try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        lastCallPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
        // Ignored
    }

    return true;
}

export function setRequestInProgress(status: boolean) {
    requestInProgress = status;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function executeWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 4
): Promise<T> {
    let retries = 0;
    while (true) {
        try {
            return await operation();
        } catch (error: any) {
            const isClientError = error.status >= 400 && error.status < 500 && error.status !== 429;
            if (isClientError) throw error; // Don't retry 400, 401, 403, 404

            if (retries < maxRetries) {
                retries++;
                const delay = 1000 * Math.pow(2, retries); // 2s, 4s, 8s, 16s
                console.warn(`Gemini API Error: Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`, error);
                await sleep(delay);
            } else {
                throw error;
            }
        }
    }
}
