// layout.js — the parts of the chrome that every page shares.

import { getAllWorkingHours, getCurrentUser, logout } from './mock-data.js';
import { todayKey, weekdayOf } from './date-utils.js';
import { weekdayName, formatWorkingHours, WEEK_ORDER } from './format.js';

export function initLayout({ showAuthLinks = true } = {}) {
    renderHeader({ showAuthLinks });
    renderFooterHours();
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

        nodes.push(link('Contul meu', 'account.html', 'btn btn--ghost'));

        const out = document.createElement('button');
        out.className = 'btn';
        out.type = 'button';
        out.textContent = 'Delogare';
        out.addEventListener('click', () => {
            logout();
            renderHeader({ showAuthLinks });   // re-render, do not reload
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
