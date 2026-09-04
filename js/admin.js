// Pasul 1.5 — the admin dashboard, entry point.
//
// This file does two things: decide whether the page may be shown at all, and start the three
// modules that own the three zones. It contains no rendering of its own — that is the point of
// splitting it, and it is what the documentation asks for: "codul e împărțit în module ES, nu un
// singur fișier de 800 de linii".
//
//   js/admin/agenda.js    the day's bookings, filters, tiles, RB-06 actions
//   js/admin/services.js  the services table and its add/edit form
//   js/admin/hours.js     the weekly schedule
//
// The three never import each other. When one changes something another displays, it says so
// with an event and the other listens — the same shape as SESSION_CHANGED.

import { getCurrentUser } from './mock-data.js';
import { initLayout, SESSION_CHANGED } from './layout.js';

import { initAgenda, refreshAgenda } from './admin/agenda.js';
import { initServices, refreshServices } from './admin/services.js';
import { initHours } from './admin/hours.js';

const el = {
    denied: document.querySelector('#access-denied'),
    admin:  document.querySelector('#admin'),
};

// The modules attach listeners, so they must be started exactly once — starting them again on a
// later session change would double every click handler.
let started = false;

function showForCurrentUser() {
    const user = getCurrentUser();

    // The whole guard. Note what it is NOT: security. Anyone can set bookeasy.userId to 1 in
    // DevTools and become Ana Admin, and no amount of client code can stop them. In Partea 2
    // every /api/admin/* route sits behind requireRole('admin') and answers 403 — that is the
    // real guard, and this only decides what is worth rendering.
    const isAdmin = user?.role === 'admin';

    el.denied.hidden = isAdmin;
    el.admin.hidden = !isAdmin;

    if (isAdmin && !started) {
        started = true;
        initAgenda();
        initServices();
        initHours();
    }
}

// A booking made in another tab, or a cancellation by a client, will not announce itself — the
// mock has no push and neither will the API. Redrawing when the tab regains focus covers the
// case that actually comes up: two tabs open side by side.
//
// The hours form is deliberately NOT refreshed. It may be half filled in, and losing an admin's
// typing to a background change is worse than showing them a stale schedule; it has its own
// "Anulează modificările" button for that.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !started) return;
    if (getCurrentUser()?.role !== 'admin') return;
    refreshAgenda();
    refreshServices();
});

initLayout();

// Logging out on this page must hide the agenda, not just change the header — it is showing
// every client's name and email.
document.addEventListener(SESSION_CHANGED, showForCurrentUser);

showForCurrentUser();
