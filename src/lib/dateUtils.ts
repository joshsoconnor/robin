/**
 * Returns the current date in Australia/Sydney timezone formatted as YYYY-MM-DD.
 * This is the standard format used for delivery_date in the database.
 */
export const getSydneyDate = () => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Sydney',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

/**
 * Formats an ISO date string (YYYY-MM-DD) to Australian display format (DD/MM/YYYY).
 */
export const formatDisplayDate = (iso: string) => {
    if (!iso) return 'N/A';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};
