// rules.js — Anexa C, the business rules, defined once.
//
// Most rules end up with TWO enforcement points: the UI must not OFFER something invalid, and
// the writer must REFUSE it anyway (a page can be stale, or bypassed entirely). That pairing is
// the design — see Pas 3.4. What must never be duplicated is the rule itself: change the lead
// time to 2 hours here, and the slot grid, the cancel button and addBooking all follow.
//
// It imports one pure formatting helper and nothing else — in particular never mock-data.js.
// The moment rules reach for data they stop being liftable to the server as they are.
import { minutesFromTime } from './date-utils.js';


// ── Constants ────────────────────────────────────────────────────────────────

export const SLOT_MINUTES = 15;             // RB-01 — slots start at :00, :15, :30, :45
export const MIN_LEAD_MINUTES = 60;         // RB-03 — at least 1h from now
export const MAX_HORIZON_DAYS = 30;         // RB-03 — at most 30 days ahead
export const CANCEL_WINDOW_HOURS = 24;      // RB-05 — client may cancel up to 24h before
export const MAX_ACTIVE_BOOKINGS = 3;       // RB-07 — per client, future and active

// Not from Anexa C but from the schema in Anexa A: services CHECK (15–240, multiple of 15).
export const MIN_SERVICE_MINUTES = 15;
export const MAX_SERVICE_MINUTES = 240;

// RB-02 — only these block an interval. A cancelled booking frees its time.
export const ACTIVE_STATUSES = ['pending', 'confirmed'];

// RB-06 — the state machine. completed and cancelled map to empty arrays, so they are terminal
// by construction rather than by a special case someone can forget.
export const ALLOWED_TRANSITIONS = {
    pending:   ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};


// ── Predicates ───────────────────────────────────────────────────────────────

// RB-02
export function isActiveStatus(status) {
    return ACTIVE_STATUSES.includes(status);
}

// RB-06 — used by admin.html to decide which buttons to render, and by setBookingStatus to
// refuse the transition if they are rendered anyway.
export function canTransition(from, to) {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// RB-03 — returns null if the start time is acceptable, otherwise an error code explaining why
// not. One implementation, two readers: the slot grid drops any start where this is non-null,
// addBooking turns the code into a 422.
export function bookingTimeProblem(startsAt, now = new Date()) {
    const start = new Date(startsAt).getTime();
    const from = now.getTime() + MIN_LEAD_MINUTES * 60 * 1000;
    const until = now.getTime() + MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000;

    if (start < from) return 'TOO_SOON';
    if (start > until) return 'TOO_FAR';
    return null;
}

// RB-02, second half — does a service starting at `startMinutes` fit ENTIRELY inside the day?
//
// Thursday closes at 20:00 and Tuns damă lasts 60 minutes, so 19:00 is the last usable start:
// 19:15, 19:30 and 19:45 would run past closing and must never be offered.
//
// Two callers ask exactly this, which is why it lives here rather than inside either of them:
//   · the slot grid (1.3) asks it about every candidate start, to decide what to render
//   · addBooking asks it about the one start it was handed, to refuse anything else
//
// It answers only the question — walking the day in 15-minute steps is the calculator's job.
// Minutes since midnight keeps this free of dates and timezones.
export function serviceFitsInDay(startMinutes, durationMin, hours) {
    if (!hours || !hours.opensAt || !hours.closesAt) return false;    // closed that day
    return startMinutes >= minutesFromTime(hours.opensAt)
        && startMinutes + durationMin <= minutesFromTime(hours.closesAt);
}

// RB-01 — a start must land on the slot grid: :00, :15, :30, :45 and nothing finer.
export function isOnSlotBoundary(startMinutes) {
    return Number.isInteger(startMinutes) && startMinutes % SLOT_MINUTES === 0;
}

// Anexa A CHECK, expressed once. Returns null when the values are acceptable, otherwise a
// message for the admin form. The form shows it under the field; addService/updateService
// refuse with it — and in Partea 2 the CHECK constraint refuses regardless of both.
export function serviceFieldsProblem({ durationMin, price }) {
    if (durationMin !== undefined) {
        if (!Number.isInteger(durationMin)
            || durationMin < MIN_SERVICE_MINUTES
            || durationMin > MAX_SERVICE_MINUTES
            || durationMin % SLOT_MINUTES !== 0) {
            return `Durata trebuie să fie între ${MIN_SERVICE_MINUTES} și ${MAX_SERVICE_MINUTES}`
                 + ` minute, multiplu de ${SLOT_MINUTES}.`;
        }
    }
    if (price !== undefined) {
        if (!Number.isFinite(price) || price < 0) {
            return 'Prețul trebuie să fie un număr mai mare sau egal cu 0.';
        }
    }
    return null;
}

// RB-05 — the client may cancel only more than 24h before the start, and only a booking that is
// still active. The admin is not bound by the window and does not go through this.
export function canClientCancel(booking, now = new Date()) {
    if (!isActiveStatus(booking.status)) return false;
    const msUntilStart = new Date(booking.startsAt).getTime() - now.getTime();
    return msUntilStart > CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
}
