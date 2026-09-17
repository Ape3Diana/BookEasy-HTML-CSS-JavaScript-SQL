// Pasul 1.5, zone 3 — the weekly schedule.
//
// Owns #hours-*. One form, one save: PUT /api/admin/working-hours replaces the whole week, so
// seven independent saves would be seven requests and seven chances to half-apply a change.
//
// This is where RB-08 becomes visible. The schedule cannot be narrowed over bookings that
// already exist — updateWorkingHours refuses with SCHEDULE_CONFLICT and hands back which
// bookings are in the way, so the admin can go and move them instead of guessing.

import { getAllWorkingHours, updateWorkingHours } from '../mock-data.js';
import { toDateKey } from '../date-utils.js';
import { weekdayName, formatTime, formatLongDate, WEEK_ORDER } from '../format.js';
import { messagePair } from '../messages.js';
import { HOURS_CHANGED } from '../layout.js';

const el = {
    form:      document.querySelector('#hours-form'),
    rows:      document.querySelector('#hours-rows'),
    conflicts: document.querySelector('#hours-conflicts'),
    reset:     document.querySelector('#hours-reset'),

    error:   document.querySelector('#hours-error'),
    success: document.querySelector('#hours-success'),
};

const tpl = document.querySelector('#hours-row');

const msg = messagePair(el.error, el.success);


// ── Drawing ──────────────────────────────────────────────────────────────────

// Seven rows in reading order — Monday first. The table stores 0–6 with Sunday first because
// that is what Date.getDay() returns; WEEK_ORDER is the display sequence, not the storage one.
function render() {
    const week = getAllWorkingHours();

    el.rows.replaceChildren(...WEEK_ORDER.map(weekday => {
        const row = tpl.content.firstElementChild.cloneNode(true);
        const hours = week.find(h => h.weekday === weekday);
        const closed = !hours?.opensAt;

        row.dataset.weekday = weekday;
        row.querySelector('[data-weekday]').textContent = weekdayName(weekday);

        const opens = row.querySelector('[data-opens]');
        const closes = row.querySelector('[data-closes]');
        const closedBox = row.querySelector('[data-closed]');

        opens.value = hours?.opensAt ?? '';
        closes.value = hours?.closesAt ?? '';
        closedBox.checked = closed;

        // A closed day has no hours to type, so the inputs are disabled rather than left
        // holding values nobody will read.
        opens.disabled = closed;
        closes.disabled = closed;

        return row;
    }));

    hideConflicts();
}

function hideConflicts() {
    el.conflicts.replaceChildren();
    el.conflicts.hidden = true;
}

// The bookings that blocked a save, listed so the admin knows what to move. err.conflicts is
// the mock's version of what Partea 2 would send as error.details.
function showConflicts(bookings) {
    el.conflicts.replaceChildren(...bookings.map(booking => {
        const item = document.createElement('li');
        item.textContent =
            `${formatLongDate(toDateKey(booking.startsAt))}, `
            + `${formatTime(booking.startsAt)}–${formatTime(booking.endsAt)} · `
            + `${booking.serviceName} · ${booking.employeeName} · ${booking.userFullName}`;
        return item;
    }));
    el.conflicts.hidden = bookings.length === 0;
}


// ── Reading the form ─────────────────────────────────────────────────────────

// The whole week, in the shape updateWorkingHours expects. A closed day is both times null —
// the same convention the table uses, decided in one place rather than per row.
function readWeek() {
    return [...el.rows.querySelectorAll('.hours-editor__row')].map(row => {
        const closed = row.querySelector('[data-closed]').checked;
        return {
            weekday: Number(row.dataset.weekday),
            opensAt: closed ? null : row.querySelector('[data-opens]').value,
            closesAt: closed ? null : row.querySelector('[data-closes]').value,
        };
    });
}

// "Closed" must be said by ticking the box, never by leaving the times empty. updateWorkingHours
// reads two blank times as a closed day, so without this check clearing Thursday's fields would
// silently close Thursdays — a destructive change that nobody asked for and that RB-08 would
// then have to refuse for confusing reasons.
function blankDay(week) {
    return week.find(day =>
        day.opensAt !== null && (day.opensAt === '' || day.closesAt === ''));
}


// ── Reacting ─────────────────────────────────────────────────────────────────

export function initHours() {

    // Ticking "Închis" greys out that day's inputs immediately, so the row always shows what
    // will actually be saved.
    el.rows.addEventListener('change', event => {
        const box = event.target.closest('[data-closed]');
        if (!box) return;

        const row = box.closest('.hours-editor__row');
        row.querySelector('[data-opens]').disabled = box.checked;
        row.querySelector('[data-closes]').disabled = box.checked;
    });

    el.form.addEventListener('submit', event => {
        event.preventDefault();
        msg.clear();
        hideConflicts();

        const week = readWeek();

        const incomplete = blankDay(week);
        if (incomplete) {
            msg.error(`Completează ambele ore pentru ${weekdayName(incomplete.weekday)},`
                    + ' sau bifează „Închis".');
            return;
        }

        try {
            updateWorkingHours(week);
            msg.success('Programul a fost salvat.');

            // The footer programme and the agenda's occupancy tile both read these hours.
            // Announce it; they listen. No module here imports another.
            document.dispatchEvent(new CustomEvent(HOURS_CHANGED));

            render();

        } catch (err) {
            msg.error(err.message ?? 'Nu am putut salva programul.');

            // RB-08: say WHICH bookings stand in the way. Refusing without naming them would
            // leave the admin hunting through the agenda day by day.
            if (err.code === 'SCHEDULE_CONFLICT' && Array.isArray(err.conflicts)) {
                showConflicts(err.conflicts);
            }
        }
    });

    // Nothing was written, so this is a pure redraw from the data — the quickest way out of a
    // half-typed week.
    el.reset.addEventListener('click', () => {
        msg.clear();
        render();
    });

    render();
}
