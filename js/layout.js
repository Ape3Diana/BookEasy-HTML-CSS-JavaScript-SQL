// layout.js — the parts of the chrome that every page shares.

import { getAllWorkingHours } from './mock-data.js';
import { todayKey, weekdayOf } from './date-utils.js';
import { weekdayName, formatWorkingHours, WEEK_ORDER } from './format.js';

export function renderFooterHours() {
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
