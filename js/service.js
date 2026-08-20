// Pasul 1.3
//
// No rules live here. The grid is drawn from calculateDaySlots, the booking is made by
// addBooking, and both consult rules.js

import {
    getServiceById,
    getEmployeesForService,
    getWorkingHoursFor,
    getActiveBookingsForDay,
    getCurrentUser,
    addBooking,
} from './mock-data.js';

import { calculateDaySlots } from './availability.js';
import { todayKey, addDays, weekdayOf, plusMinutes } from './date-utils.js';
import {
    formatPrice, formatDuration, formatTime, formatShortDate, formatLongDate, weekdayName,
} from './format.js';
import { initLayout } from './layout.js';

const DAYS_SHOWN = 14;

const el = {
    missing:     document.querySelector('#service-missing'),
    booking:     document.querySelector('#booking'),
    name:        document.querySelector('#service-name'),
    description: document.querySelector('#service-description'),
    duration:    document.querySelector('#service-duration'),
    price:       document.querySelector('#service-price'),

    employees:      document.querySelector('#employee-picker'),
    employeesEmpty: document.querySelector('#employees-empty'),
    days:           document.querySelector('#day-picker'),

    slots:     document.querySelector('#slot-grid'),
    slotsHint: document.querySelector('#slots-hint'),
    slotsEmpty:document.querySelector('#slots-empty'),

    error:   document.querySelector('#booking-error'),
    success: document.querySelector('#booking-success'),

    panel:       document.querySelector('#confirm-panel'),
    summary:     document.querySelector('#confirm-summary'),
    confirmBtn:  document.querySelector('#confirm-button'),
    confirmLogin:document.querySelector('#confirm-login'),
};

const tpl = {
    employee: document.querySelector('#employee-option'),
    day:      document.querySelector('#day-option'),
    slot:     document.querySelector('#slot-option'),
};

let service = null;

// Everything the page shows is derived from these three values. One place to change, one
// render() to redraw
// The strip starts today, but the SELECTED day must be one the salon is open on. Defaulting to
// today means that on a Sunday the disabled Sunday button renders as chosen, and the grid says
// "no free hours" for a day nobody could have picked.
function firstOpenDay() {
    for (let offset = 0; offset < DAYS_SHOWN; offset++) {
        const dateKey = addDays(todayKey(), offset);
        if (getWorkingHoursFor(weekdayOf(dateKey))?.opensAt) return dateKey;
    }
    return todayKey();          // a fortnight with no opening hours at all
}

const state = {
    employeeId: null,
    dateKey: firstOpenDay(),
    startsAt: null,
};


// ── Drawing ──────────────────────────────────────────────────────────────────

function fillServiceDetails() {
    el.name.textContent = service.name;
    el.description.textContent = service.description;
    el.duration.textContent = formatDuration(service.durationMin);
    el.price.textContent = formatPrice(service.price);
    document.title = `${service.name} — BookEasy`;
}

function renderEmployees() {
    const people = getEmployeesForService(service.id);
    el.employeesEmpty.hidden = people.length > 0;

    el.employees.replaceChildren(...people.map(person => {
        const chip = tpl.employee.content.firstElementChild.cloneNode(true);
        chip.textContent = person.fullName;
        chip.dataset.employee = person.id;
        return chip;
    }));
}

function renderDays() {
    const buttons = [];

    for (let offset = 0; offset < DAYS_SHOWN; offset++) {
        const dateKey = addDays(todayKey(), offset);
        const hours = getWorkingHoursFor(weekdayOf(dateKey));

        const button = tpl.day.content.firstElementChild.cloneNode(true);
        button.dataset.day = dateKey;
        button.querySelector('[data-weekday]').textContent =
            weekdayName(weekdayOf(dateKey)).slice(0, 3).toLowerCase();
        button.querySelector('[data-date]').textContent = formatShortDate(dateKey);
        button.disabled = !hours?.opensAt;
        buttons.push(button);
    }

    el.days.replaceChildren(...buttons);
}

// aria-pressed is the state AND the styling hook — set it once and both follow.
function markPressed(container, attribute, value) {
    for (const button of container.querySelectorAll(`[data-${attribute}]`)) {
        button.setAttribute('aria-pressed', String(button.dataset[attribute] === String(value)));
    }
}

function renderSlots() {
    // Nothing can be computed until we know whose calendar to look at.
    if (!state.employeeId) {
        el.slotsHint.hidden = false;
        el.slots.hidden = true;
        el.slotsEmpty.hidden = true;
        return;
    }

    // Every hour of that day, busy ones included
    const slots = calculateDaySlots({
        service,
        dateKey: state.dateKey,
        hours: getWorkingHoursFor(weekdayOf(state.dateKey)),
        taken: getActiveBookingsForDay(state.dateKey, state.employeeId),
    });

    el.slotsHint.hidden = true;
    el.slots.hidden = slots.length === 0;
    el.slotsEmpty.hidden = slots.length > 0;

    el.slots.replaceChildren(...slots.map(({ startsAt, available }) => {
        const button = tpl.slot.content.firstElementChild.cloneNode(true);
        button.textContent = formatTime(startsAt);
        button.dataset.slot = startsAt;

        // A disabled button fires no click event at all, so the handler needs no guard of its
        // own — the browser refuses on its behalf.
        button.disabled = !available;
        button.classList.toggle('slot--taken', !available);
        // "Indisponibil", not "ocupat": a slot can also be grey because the service would not
        // fit before the next booking, and at 09:15 nothing is actually occupied.
        if (!available) button.title = 'Indisponibil';

        return button;
    }));

    markPressed(el.slots, 'slot', state.startsAt);
}

function renderConfirm() {
    if (!state.startsAt) {
        el.panel.hidden = true;
        return;
    }

    const endsAt = plusMinutes(state.startsAt, service.durationMin);

    el.summary.textContent =
        `${service.name} · ${formatLongDate(state.dateKey)} · `
        + `${formatTime(state.startsAt)}–${formatTime(endsAt)} · ${formatPrice(service.price)}`;

    // Decided BEFORE the click, so a visitor is told up front rather than after choosing an
    // hour. addBooking still throws UNAUTHENTICATED if anyone gets past this — the guard is the
    // writer's, this is only courtesy.
    const isVisitor = getCurrentUser() === null;
    el.confirmBtn.hidden = isVisitor;
    el.confirmLogin.hidden = !isVisitor;

    el.panel.hidden = false;
}

function render() {
    markPressed(el.employees, 'employee', state.employeeId);
    markPressed(el.days, 'day', state.dateKey);
    renderSlots();
    renderConfirm();
}


// ── Messages ─────────────────────────────────────────────────────────────────

function clearMessages() {
    el.error.hidden = true;
    el.error.textContent = '';
    el.success.hidden = true;
    el.success.textContent = '';
}

function showError(message) {
    clearMessages();
    el.error.textContent = message;
    el.error.hidden = false;
}


// ── Reacting ─────────────────────────────────────────────────────────────────
// One listener per picker rather than one per button: the buttons are replaced on every render,
// and a listener attached to a replaced node dies with it. Listening on the container means the
// handler survives, because events bubble up to it.

el.employees.addEventListener('click', event => {
    const chip = event.target.closest('[data-employee]');
    if (!chip) return;

    state.employeeId = Number(chip.dataset.employee);
    state.startsAt = null;      // that hour may be busy for the new person
    clearMessages();
    render();
});

el.days.addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (!button || button.disabled) return;

    state.dateKey = button.dataset.day;
    state.startsAt = null;      // the chosen hour belonged to the previous day
    clearMessages();
    render();
});

el.slots.addEventListener('click', event => {
    const button = event.target.closest('[data-slot]');
    if (!button) return;

    state.startsAt = button.dataset.slot;
    clearMessages();
    render();
});

el.confirmBtn.addEventListener('click', () => {
    const user = getCurrentUser();
    if (!user) return;          // the button is hidden for visitors; belt and braces

    try {
        addBooking({
            userId: user.id,
            serviceId: service.id,
            employeeId: state.employeeId,
            startsAt: state.startsAt,
        });

        clearMessages();
        el.success.textContent =
            'Rezervare înregistrată. O găsești în Contul meu, în așteptarea confirmării.';
        el.success.hidden = false;

        state.startsAt = null;  // the slot is gone from the grid now — nothing stays selected
        render();

    } catch (err) {
        showError(err.message ?? 'Nu am putut face rezervarea. Încearcă din nou.');

        // SLOT_TAKEN means someone booked it between the grid being drawn and the click. The
        // message alone would leave a stale grid on screen, so redraw it — the same handling
        // Pasul 3.3 asks for when the 409 comes from a real server.
        if (err.code === 'SLOT_TAKEN') {
            state.startsAt = null;
            render();
        }
    }
});


// ── Start ────────────────────────────────────────────────────────────────────

initLayout();

const serviceId = new URLSearchParams(location.search).get('id');

try {
    service = getServiceById(serviceId);          // throws NOT_FOUND on a bad or missing id
    if (!service.isActive) throw new Error('withdrawn');

    fillServiceDetails();
    renderEmployees();
    renderDays();
    render();
    el.booking.hidden = false;

} catch {
    // Unknown id, no id at all, or a service the salon has withdrawn — one message covers all
    // three, because from the visitor's side they are the same thing: it is not on offer.
    el.missing.hidden = false;
}
