// Pasul 1.5, zone 1 — the day's agenda.
//
// Owns everything under #agenda-*: the three filters, the four tiles, the table and the RB-06
// action buttons. It imports no other admin module; when the schedule changes elsewhere on the
// page it hears about it through an event, not a function call.
//
// Which buttons a row gets is canTransition's answer, not this file's. setBookingStatus asks the
// same function and refuses anything that gets through anyway.

import {
    getBookingsForDay,
    getActiveEmployees,
    setBookingStatus,
    getStats,
    getOccupancy,
} from '../mock-data.js';

import { canTransition } from '../rules.js';
import { todayKey } from '../date-utils.js';
import { formatPrice, formatTime, statusLabel } from '../format.js';
import { messagePair } from '../messages.js';
import { HOURS_CHANGED } from '../layout.js';

const el = {
    date:     document.querySelector('#filter-date'),
    status:   document.querySelector('#filter-status'),
    employee: document.querySelector('#filter-employee'),

    bookings:  document.querySelector('#stat-bookings'),
    pending:   document.querySelector('#stat-pending'),
    revenue:   document.querySelector('#stat-revenue'),
    occupancy: document.querySelector('#stat-occupancy'),

    rows:  document.querySelector('#agenda-rows'),
    empty: document.querySelector('#agenda-empty'),

    error:   document.querySelector('#agenda-error'),
    success: document.querySelector('#agenda-success'),
};

const tpl = document.querySelector('#agenda-row');

const msg = messagePair(el.error, el.success);

// The label a client would recognise, per transition. Keys are the target status, so the button
// text and the action it performs cannot drift apart.
const ACTION_LABELS = {
    confirmed: 'Confirmă',
    completed: 'Finalizează',
    cancelled: 'Anulează',
};


// ── Drawing ──────────────────────────────────────────────────────────────────

// Read straight from the controls rather than from a separate state object: the DOM already
// holds the filter state, and keeping a copy would give two versions of the truth. An empty
// string means "all" — which is exactly what the "Toate" option's value is.
function currentFilters() {
    return {
        dateKey: el.date.value || todayKey(),
        status: el.status.value,
        employeeId: el.employee.value,
    };
}

function buildActions(booking) {
    // RB-06 decides. completed and cancelled map to an empty list, so terminal rows get no
    // buttons at all — no special case needed here.
    return Object.keys(ACTION_LABELS)
        .filter(target => canTransition(booking.status, target))
        .map(target => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = target === 'cancelled' ? 'btn btn--danger' : 'btn';
            button.textContent = ACTION_LABELS[target];
            button.dataset.booking = booking.id;
            button.dataset.target = target;
            return button;
        });
}

function buildRow(booking) {
    const row = tpl.content.firstElementChild.cloneNode(true);

    row.querySelector('[data-time]').textContent =
        `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)}`;

    // client, service and employee names all arrive on the booking from the JOINs
    row.querySelector('[data-client]').textContent = booking.userFullName;
    row.querySelector('[data-email]').textContent = booking.userEmail;
    row.querySelector('[data-service]').textContent = booking.serviceName;
    row.querySelector('[data-employee]').textContent = booking.employeeName;

    const badge = row.querySelector('[data-status]');
    badge.textContent = statusLabel(booking.status);
    badge.dataset.status = booking.status;

    row.querySelector('[data-actions]').replaceChildren(...buildActions(booking));

    return row;
}

function renderTiles(dateKey) {
    const stats = getStats(dateKey);              // from = to = that day
    const occupancy = getOccupancy(dateKey);

    el.bookings.textContent = stats.active;        // pending + confirmed, per RB-02
    el.pending.textContent = stats.byStatus.pending;
    el.revenue.textContent = formatPrice(stats.revenue);

    // null means the salon is closed that day. "0%" would read as a catastrophic day rather
    // than a day that never existed, so a dash is the honest answer.
    el.occupancy.textContent = occupancy === null
        ? '—'
        : `${Math.round(occupancy.rate * 100)}%`;
}

// The tiles describe the whole day, so they ignore the status and employee filters — narrowing
// the table to one person should not make it look like the salon earned less.
function render() {
    const { dateKey, status, employeeId } = currentFilters();
    const bookings = getBookingsForDay(dateKey, { status, employeeId });

    el.rows.replaceChildren(...bookings.map(buildRow));
    el.empty.hidden = bookings.length > 0;

    renderTiles(dateKey);
}


// ── Reacting ─────────────────────────────────────────────────────────────────

export function initAgenda() {
    el.date.value = todayKey();

    // The label is the name, the value is the id — names are not unique and people change them,
    // ids do not. Same split as <option value="pending">În așteptare</option>.
    for (const employee of getActiveEmployees()) {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = employee.fullName;
        el.employee.append(option);
    }

    // No Apply button: every control redraws the table. One listener each, one render().
    for (const control of [el.date, el.status, el.employee]) {
        control.addEventListener('change', () => {
            // A date input can be cleared. The data falls back to today either way, but an empty
            // field next to today's figures reads as broken — so put the value back.
            if (!el.date.value) el.date.value = todayKey();
            msg.clear();
            render();
        });
    }

    // One listener on the table body — the rows are replaced on every render, so listeners
    // attached to individual buttons would die with them.
    el.rows.addEventListener('click', event => {
        const button = event.target.closest('[data-booking]');
        if (!button) return;

        const target = button.dataset.target;

        // Cancelling is the only irreversible one here: confirming can still be cancelled
        // afterwards, and completing follows an appointment that already happened.
        if (target === 'cancelled' && !confirm('Sigur anulezi rezervarea?')) return;

        try {
            setBookingStatus(Number(button.dataset.booking), target);
            msg.success(`Rezervarea este acum ${statusLabel(target).toLowerCase()}.`);
            render();          // re-read: the badge, the buttons and the tiles all change
        } catch (err) {
            msg.error(err.message ?? 'Nu am putut schimba statusul.');
        }
    });

    // Occupancy divides by the day's opening hours, so a new schedule changes the tile even
    // though no booking moved. hours.js announces it; this listens. Neither imports the other.
    document.addEventListener(HOURS_CHANGED, () => render());

    render();
}

// Re-read and redraw. Called when the page regains focus, so a booking made in another tab
// shows up without a manual reload — the two-tab case that comes up constantly while demoing.
export function refreshAgenda() {
    render();
}
