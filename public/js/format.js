// format.js — turning data into the words a Romanian visitor reads.

import { timeFromMinutes, minutesOfDay } from './date-utils.js';

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

// 'mie', for the 14-day strip where a full "Miercuri" would not fit
export function weekdayShort(weekday) {
    return weekdayName(weekday).slice(0, 3).toLowerCase();
}

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// instant → '09:15', local wall-clock. Goes through the date helpers rather than slicing the
// ISO string, which would print UTC and be an hour or two wrong all summer.
export function formatTime(instant) {
    return timeFromMinutes(minutesOfDay(instant));
}

// date key → '19 aug'. Intl handles the Romanian month names and their abbreviations, so there
// is no second list of names to keep in step with WEEKDAY_NAMES.
export function formatShortDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' })
        .format(new Date(y, m - 1, d));
}

// date key → 'joi, 20 august' — the long form, for a confirmation line
export function formatLongDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(y, m - 1, d));
}

// Status code → what a client reads. The code is the stable English value stored in the data and
// branched on in code; the label is Romanian and free to change. Never the other way round.
//
// Used by the badges here in 1.4 and by the admin filter and agenda in 1.5 — which is why it is
// in format.js rather than in either page.
const STATUS_LABELS = {
    pending:   'În așteptare',
    confirmed: 'Confirmată',
    completed: 'Finalizată',
    cancelled: 'Anulată',
};

export function statusLabel(status) {
    return STATUS_LABELS[status] ?? status;
}

export function formatWorkingHours(row) {
    if (!row || !row.opensAt || !row.closesAt) return 'Închis';
    return `${row.opensAt} – ${row.closesAt}`;
}
