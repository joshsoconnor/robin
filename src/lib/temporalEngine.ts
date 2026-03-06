/**
 * Temporal Engine — checks day/time against restriction windows
 * to determine if warnings like clearways or school zones are active.
 */

export interface TemporalWindow {
    start: string; // "HH:MM" (24h)
    end: string;   // "HH:MM" (24h)
}

export interface TemporalWarnings {
    inside: string;  // e.g. "Clearway active — do not park here"
    outside: string; // e.g. "Clearway over — street parking is allowed"
}

/**
 * Check if a time-based restriction is currently active.
 */
export function isRestrictionActive(
    activeWindow: TemporalWindow | undefined,
    days: string[] | undefined,
    now: Date = new Date()
): boolean {
    // No window defined = never active
    if (!activeWindow || !activeWindow.start || !activeWindow.end) return false;

    // Check day
    if (days && days.length > 0) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayName = dayNames[now.getDay()];
        if (!days.includes(todayName)) return false;
    }

    // Check time window
    const [startH, startM] = activeWindow.start.split(':').map(Number);
    const [endH, endM] = activeWindow.end.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Get the appropriate warning message based on whether a restriction is active.
 */
export function getTemporalMessage(
    warnings: TemporalWarnings | undefined,
    isActive: boolean
): string | null {
    if (!warnings) return null;
    return isActive ? warnings.inside : warnings.outside;
}
