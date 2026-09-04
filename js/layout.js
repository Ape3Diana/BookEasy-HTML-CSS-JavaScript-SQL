// layout.js — the parts of the chrome that every page shares.

import { getAllWorkingHours, getCurrentUser, logout } from './mock-data.js';
import { todayKey, weekdayOf } from './date-utils.js';
import { weekdayName, formatWorkingHours, WEEK_ORDER } from './format.js';

// Fired on <document> when logging out changes who is looking at the page. Namespaced so it
// cannot collide with anything the browser or a library dispatches.
//
// In Partea 3 the same event still makes sense: api.logout() destroys the session on the server,
// and every region that shows private data has to redraw.
export const SESSION_CHANGED = 'bookeasy:session-changed';

// Fired when the admin saves a new weekly schedule. The footer programme shows those hours, and
// the agenda's occupancy tile divides by them, so both go stale the moment they change.
//
// Two events is still comfortably a pair of constants; if a third appears, move all of them to
// their own js/events.js rather than letting layout.js become the place events live.
export const HOURS_CHANGED = 'bookeasy:hours-changed';

export function initLayout({ showAuthLinks = true } = {}) {
    renderHeader({ showAuthLinks });
    renderFooterHours();

    // The footer keeps itself current. The admin page does not have to remember to tell it.
    document.addEventListener(HOURS_CHANGED, renderFooterHours);
}

function renderFooterHours() {
    const hoursList = document.querySelector('#working-hours');
    if (!hoursList) return;

    const hours = getAllWorkingHours();
    const today = weekdayOf(todayKey());
    const nodes = [];

    for (const weekday of WEEK_ORDER) {
        const row = hours.find(h => h.weekday === weekday);
        if (!row) continue;

        const term = document.createElement('dt');
        term.textContent = weekdayName(weekday);

        const value = document.createElement('dd');
        value.textContent = formatWorkingHours(row);

        if (weekday === today) {
            term.dataset.today = '';
            value.dataset.today = '';
        }

        nodes.push(term, value);
    }

    hoursList.replaceChildren(...nodes);
}

// showAuthLinks: false on login.html and register.html — a visitor already there
// does not need a button pointing at the page they are looking at.
function renderHeader({ showAuthLinks = true } = {}) {
    const slot = document.querySelector('#auth-nav');
    if (!slot) return;

    const user = getCurrentUser();
    const nodes = [];

    if (user) {
        const greeting = document.createElement('span');
        greeting.textContent = `Bună, ${user.fullName.split(' ')[0]}`;
        nodes.push(greeting);

        // The admin link is hidden from clients as a courtesy. admin.html checks the
        // role itself, and in Partea 3 the server answers 403
        if (user.role === 'admin') {
            nodes.push(link('Panou admin', 'admin.html', 'btn btn--ghost'));
        }

        // An admin account has admin duties only — it never books anything, so it has no
        // bookings to look at. Offering "Contul meu" would lead to a page that is empty by
        // definition.
        if (user.role !== 'admin') {
            nodes.push(link('Contul meu', 'account.html', 'btn btn--ghost'));
        }

        const out = document.createElement('button');
        out.className = 'btn';
        out.type = 'button';
        out.textContent = 'Delogare';
        out.addEventListener('click', () => {
            logout();
            renderHeader({ showAuthLinks });   // re-render, do not reload

            // The header is not the only thing that depends on who is logged in. account.html
            // is showing someone's bookings; admin.html will be showing the whole agenda. They
            // have to be told, or they keep displaying private data to nobody.
            //
            // An event rather than a direct call, because layout.js must not know which pages
            // exist — it is imported BY them. Pages that care listen; the rest ignore it.
            document.dispatchEvent(new CustomEvent(SESSION_CHANGED));
        });
        nodes.push(out);

    } else if (showAuthLinks) {
        nodes.push(link('Autentificare', 'login.html', 'btn'));
        nodes.push(link('Creează cont', 'register.html', 'btn btn--primary'));
    }

    slot.replaceChildren(...nodes);
}

function link(text, href, className) {
    const a = document.createElement('a');
    a.className = className;
    a.href = href;
    a.textContent = text;
    return a;
}
