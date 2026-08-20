// availability.js — which hours can this service still be started at, on this day, with this
// person?
// It owns no rules. Each filter below delegates to rules.js, which is what stops the grid and
// addBooking from ever disagreeing about what is bookable. The only thing this file contributes
// is the walk across the day.

import {
    SLOT_MINUTES,
    serviceFitsInDay,
    bookingTimeProblem,
    intervalsOverlap,
} from './rules.js';

import {
    instantAt,
    plusMinutes,
    minutesFromTime,
    timeFromMinutes,
} from './date-utils.js';


/**
 * @param service  { durationMin }               — the service being booked
 * @param dateKey  'YYYY-MM-DD'                  — the chosen day, LOCAL
 * @param hours    { opensAt, closesAt } | null  — that weekday's row; null/closed → no slots
 * @param taken    [{ startsAt, endsAt }]        — that employee's active bookings, that day
 * @param now      Date                          — injected so tests can pin it
 * @returns        [{ startsAt, available }] every hour of the day, chronological —
 *                 including the busy ones, which the grid draws struck through
 */
export function calculateDaySlots({ service, dateKey, hours, taken = [], now = new Date() }) {
    // Closed: not an error, just nothing on offer. The page shows an empty state.
    if (!hours || !hours.opensAt || !hours.closesAt) return [];

    const opens = minutesFromTime(hours.opensAt);
    const closes = minutesFromTime(hours.closesAt);

    // RB-01: candidates sit on the 15-minute grid. If the salon opened at 09:07 the first
    // candidate would be 09:15, not 09:07 — the grid is absolute, not relative to opening.
    const firstCandidate = Math.ceil(opens / SLOT_MINUTES) * SLOT_MINUTES;

    const slots = [];

    for (let minutes = firstCandidate; minutes <= closes; minutes += SLOT_MINUTES) {
        // RB-02, second half — the whole service has to fit before closing. This is what makes
        // the last few starts of the day vanish for a long service but not for a short one.
        if (!serviceFitsInDay(minutes, service.durationMin, hours)) continue;

        const startsAt = instantAt(dateKey, timeFromMinutes(minutes));
        const endsAt = plusMinutes(startsAt, service.durationMin);

        // RB-03 — in the past, under an hour away, or beyond the 30-day horizon. This is why
        // today's grid shrinks as the day goes on, with no extra logic here.
        if (bookingTimeProblem(startsAt, now)) continue;

        // RB-02, first half — collides with something this employee already has. `taken` is
        // already filtered to one person and to active bookings by the caller; a cancelled
        // booking frees its time, so it must not appear in that list.
        //
        // Note this one does NOT `continue`: a busy hour is still a real hour of the salon's
        // day, and the grid shows it struck through. "Absent" and "taken" say different things
        // to a visitor — absent reads as closed, taken reads as "someone got there first".
        const busy = taken.some(b => intervalsOverlap(startsAt, endsAt, b.startsAt, b.endsAt));

        slots.push({ startsAt, available: !busy });
    }

    return slots;
}

/**
 * Just the free start times. This is what GET /api/availability returns in Pasul 2.5 — an API
 * has no reason to describe hours nobody can book — and what addBooking's world cares about.
 * The page uses calculateDaySlots instead, because it draws the busy ones too.
 */
export function calculateAvailableSlots(args) {
    return calculateDaySlots(args)
        .filter(slot => slot.available)
        .map(slot => slot.startsAt);
}
