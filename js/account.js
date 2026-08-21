// Pasul 1.4 — the client's own bookings.

import { getBookingsForUser, cancelBooking, getCurrentUser } from './mock-data.js';
import { canClientCancel } from './rules.js';
import { toDateKey } from './date-utils.js';
import { formatPrice, formatTime, formatLongDate, statusLabel } from './format.js';
import { initLayout, SESSION_CHANGED } from './layout.js';
import { showMessage, clearMessages } from './messages.js';

const el = {
    authRequired: document.querySelector('#auth-required'),
    account:      document.querySelector('#account'),

    list:  document.querySelector('#bookings-list'),
    empty: document.querySelector('#bookings-empty'),

    pager:     document.querySelector('#pager'),
    prev:      document.querySelector('#prev-page'),
    next:      document.querySelector('#next-page'),
    pageLabel: document.querySelector('#page-label'),

    error:   document.querySelector('#account-error'),
    success: document.querySelector('#account-success'),
};

const tpl = document.querySelector('#booking-row');

let user = null;
let page = 1;


// ── Messages ─────────────────────────────────────────────────────────────────

// Error and success share a slot in the user's attention: showing one always hides the other.
const clearBoth = () => clearMessages(el.error, el.success);

function announce(node, message) {
    clearBoth();
    showMessage(node, message);
}


// ── One row ──────────────────────────────────────────────────────────────────

function buildRow(booking) {
    const row = tpl.content.firstElementChild.cloneNode(true);

    row.querySelector('[data-date]').textContent = formatLongDate(toDateKey(booking.startsAt));

    // endsAt is a stored column, not something to recompute from the duration — the service may
    // have been shortened since, and this booking is still whatever length it was sold as.
    row.querySelector('[data-time]').textContent =
        `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)}`;

    // serviceName and employeeName arrive on the booking itself, from the JOIN — no lookups.
    row.querySelector('[data-service]').textContent = booking.serviceName;
    row.querySelector('[data-employee]').textContent = `cu ${booking.employeeName}`;

    // the price SNAPSHOT: what it cost when booked, not what the service costs today
    row.querySelector('[data-price]').textContent = formatPrice(booking.price);

    const badge = row.querySelector('[data-status]');
    badge.textContent = statusLabel(booking.status);
    badge.dataset.status = booking.status;      // drives the colour, see .badge[data-status]

    const cancelBtn = row.querySelector('[data-cancel]');
    const note = row.querySelector('[data-note]');

    if (canClientCancel(booking)) {
        cancelBtn.hidden = false;
        cancelBtn.dataset.cancel = booking.id;
        cancelBtn.setAttribute('aria-label', `Anulează ${booking.serviceName} din ${formatLongDate(toDateKey(booking.startsAt))}`);
    } else if (booking.status === 'pending' || booking.status === 'confirmed') {
        // Still active, so the client might expect a button — say why there isn't one. A missing
        // button with no explanation reads as a bug; RB-05 is the reason and it is worth stating.
        note.hidden = false;
        note.textContent = new Date(booking.startsAt) < new Date()
            ? 'a trecut'
            : 'sub 24 h — nu mai poate fi anulată';
    }
    // completed or cancelled: neither button nor note. Nothing to explain.

    return row;
}


// ── The page ─────────────────────────────────────────────────────────────────

function render() {
    const { items, total, pageSize } = getBookingsForUser(user.id, page);

    // Cancelling the last row of the last page leaves it empty. Step back rather than showing
    // "Pagina 2 din 1" over nothing.
    if (items.length === 0 && page > 1) {
        page -= 1;
        render();
        return;
    }

    el.list.replaceChildren(...items.map(buildRow));
    el.list.hidden = total === 0;
    el.empty.hidden = total > 0;

    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    el.pager.hidden = pageCount <= 1;
    el.pageLabel.textContent = `Pagina ${page} din ${pageCount}`;
    el.prev.disabled = page <= 1;
    el.next.disabled = page >= pageCount;
}


// ── Reacting ─────────────────────────────────────────────────────────────────

// One listener on the list, not one per row: the rows are replaced on every render, and a
// listener on a replaced node dies with it.
el.list.addEventListener('click', event => {
    const button = event.target.closest('[data-cancel]');
    if (!button) return;

    // The doc asks for a confirmation, and this is a destructive, irreversible action —
    // a blocking dialog is the right amount of friction. (Unlike validation errors, which
    // must never be an alert.)
    if (!confirm('Sigur anulezi rezervarea?')) return;

    try {
        cancelBooking(Number(button.dataset.cancel));   // returns nothing — 204 No Content
        announce(el.success, 'Rezervarea a fost anulată.');
        render();                                        // re-read, do not patch the row by hand
    } catch (err) {
        announce(el.error, err.message ?? 'Nu am putut anula rezervarea.');
    }
});

el.prev.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    clearBoth();
    render();
});

el.next.addEventListener('click', () => {
    page += 1;
    clearBoth();
    render();
});


// ── Start ────────────────────────────────────────────────────────────────────

// Runs on load AND whenever the session changes, so logging out on this page swaps the list for
// the "please log in" message instead of leaving one person's bookings on screen for nobody.
function showForCurrentUser() {
    user = getCurrentUser();
    clearBoth();

    // A visitor sees this instead of an empty list — "no bookings" and "not logged in" are
    // different things. The real guard is the server's 401 in Partea 3; this is courtesy.
    const isVisitor = user === null;
    el.authRequired.hidden = !isVisitor;
    el.account.hidden = isVisitor;

    if (user) {
        page = 1;               // a different account has different pages
        render();
    }
}

initLayout();
document.addEventListener(SESSION_CHANGED, showForCurrentUser);
showForCurrentUser();
