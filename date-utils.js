// date-utils.js — conversions between the two kinds of time value this app uses.
//
// Not business rules (those are rules.js) and not data (that is mock-data.js): plumbing that
// several layers need. mock-data.js uses it for the seed and the queries, the slot calculator
// will use it in Pasul 1.3, the pages use it to format for display, and in Partea 2 the server
// uses the same conversions to build availability.
//
// ── The two kinds of time value ──────────────────────────────────────────────
// Practically every date bug in a booking app is these two confused:
//
//   instant    '2026-08-06T06:00:00.000Z'   a precise moment. ALWAYS UTC (Anexa A).
//                                           Fields: startsAt, endsAt, createdAt, cancelledAt.
//   date key   '2026-08-06'                 a LOCAL calendar day. Exactly what
//                                           <input type="date"> hands you, and what the
//                                           day-picker in service.html produces.
//
// The functions below are the ONLY place where one is turned into the other. Rule for the rest
// of the app: if you catch yourself writing .slice(0, 10) or new Date('2026-08-06') anywhere
// else, stop — you are re-implementing one of these, and you will get it subtly wrong.


// instant → local date key
export function toDateKey(instant) {
    const d = instant instanceof Date ? instant : new Date(instant);
    const y = d.getFullYear();                               // getFullYear / getMonth / getDate
    const m = String(d.getMonth() + 1).padStart(2, '0');     // are the LOCAL-time getters.
    const day = String(d.getDate()).padStart(2, '0');        // (getUTCFullYear & co. are not.)
    return `${y}-${m}-${day}`;
}

// local date key + 'HH:MM' → instant
export function instantAt(dateKey, hhmm) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    // new Date(y, m, d, h, min, s, ms) builds the moment in LOCAL time — which is what a human
    // means by "09:00". Name every field: the ones you skip keep whatever the current clock had.
    return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

export function todayKey() {
    return toDateKey(new Date());
}

// date key ± n days. The Date constructor normalizes overflow for us: 32 August becomes
// 1 September, day 0 becomes the last day of the previous month.
export function addDays(dateKey, n) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return toDateKey(new Date(y, m - 1, d + n));
}

// date key → weekday 0–6 (0 = Sunday), matching working_hours.weekday
// The trap this exists to avoid: new Date('2026-08-06').getDay() parses that string as UTC
// midnight, then reads it back in local time — so west of Greenwich you get the PREVIOUS day,
// and you look up the wrong row in workingHours. Splitting the string and passing numbers to
// the constructor forces local interpretation, so the answer is always the day you meant.
export function weekdayOf(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
}

// 'HH:MM' → minutes since midnight (09:15 becomes 555).
// Opening hours are local wall-clock strings, so this is plain arithmetic with no timezone in
// it. It lives here rather than in rules.js because both rules.js and mock-data.js need it
export function minutesFromTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// instant → minutes since LOCAL midnight (09:15 becomes 555).
// That is the unit opening hours are written in, so the slot grid and the rules can compare
// like with like without either of them parsing a date.
export function minutesOfDay(instant) {
    const d = instant instanceof Date ? instant : new Date(instant);
    return d.getHours() * 60 + d.getMinutes();
}

// instant + minutes → instant. Pure epoch arithmetic: it never reads a calendar field, so there
// is no point at which local and UTC could diverge. This is why it needs no local/UTC care.
export function plusMinutes(instant, minutes) {
    return new Date(new Date(instant).getTime() + minutes * 60000).toISOString();
}
