// format.js — turning data into the words a Romanian visitor reads.

export function formatPrice(price) {
    return `${price} lei`;
}

export function formatDuration(minutes) {
    return `${minutes} min`;
}


const WEEKDAY_NAMES = [
    'Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă',
];

export function weekdayName(weekday) {
    return WEEKDAY_NAMES[weekday] ?? '';
}

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatWorkingHours(row) {
    if (!row || !row.opensAt || !row.closesAt) return 'Închis';
    return `${row.opensAt} – ${row.closesAt}`;
}
