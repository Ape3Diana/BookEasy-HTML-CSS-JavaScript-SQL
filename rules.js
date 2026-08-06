// rules.js — Anexa C, the business rules, defined once.
//
// Most rules end up with TWO enforcement points: the UI must not OFFER something invalid, and
// the writer must REFUSE it anyway (a page can be stale, or bypassed entirely). That pairing is
// the design — see Pas 3.4. What must never be duplicated is the rule itself: change the lead
// time to 2 hours here, and the slot grid, the cancel button and addBooking all follow.
//
// This module is pure: constants and predicates, no data access, no DOM. In Partea 2 it moves to
// the server essentially unchanged, where /api/availability and POST /api/bookings import it the
// same way service.html and mock-data.js do now.


// ── Constants ────────────────────────────────────────────────────────────────

export const SLOT_MINUTES = 15;             // RB-01 — slots start at :00, :15, :30, :45
export const MIN_LEAD_MINUTES = 60;         // RB-03 — at least 1h from now
export const MAX_HORIZON_DAYS = 30;         // RB-03 — at most 30 days ahead
export const CANCEL_WINDOW_HOURS = 24;      // RB-05 — client may cancel up to 24h before
export const MAX_ACTIVE_BOOKINGS = 3;       // RB-07 — per client, future and active

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

// RB-05 — the client may cancel only more than 24h before the start, and only a booking that is
// still active. The admin is not bound by the window and does not go through this.
export function canClientCancel(booking, now = new Date()) {
    if (!isActiveStatus(booking.status)) return false;
    const msUntilStart = new Date(booking.startsAt).getTime() - now.getTime();
    return msUntilStart > CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
}
