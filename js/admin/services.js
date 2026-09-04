// Pasul 1.5, zone 2 — the service catalogue.
//
// Owns #services-* and #service-form. One form does both adding and editing: `editingId` decides
// which, so the four fields exist once rather than twice.
//
// Nothing here validates a duration or a price. serviceFieldsProblem does, in rules.js, and
// addService/updateService refuse with it — this file only puts the message under the field.

import {
    getAllServices,
    addService,
    updateService,
    deactivateService,
} from '../mock-data.js';

import { serviceFieldsProblem } from '../rules.js';
import { formatPrice, formatDuration } from '../format.js';
import { showFieldError, clearErrors } from '../form.js';
import { messagePair } from '../messages.js';

const el = {
    rows: document.querySelector('#services-rows'),

    form:      document.querySelector('#service-form'),
    formTitle: document.querySelector('#service-form-title'),
    save:      document.querySelector('#service-save'),
    cancel:    document.querySelector('#service-cancel'),

    error:   document.querySelector('#services-error'),
    success: document.querySelector('#services-success'),
};

const tpl = document.querySelector('#service-row');

const msg = messagePair(el.error, el.success);

// null = the form is adding. A number = it is editing that service. The single piece of state
// this zone has, and every difference between the two modes is derived from it.
let editingId = null;


// ── Drawing ──────────────────────────────────────────────────────────────────

function buildRow(service) {
    const row = tpl.content.firstElementChild.cloneNode(true);

    row.querySelector('[data-name]').textContent = service.name;
    row.querySelector('[data-duration]').textContent = formatDuration(service.durationMin);
    row.querySelector('[data-price]').textContent = formatPrice(service.price);

    // Not a booking status, so a plain variant rather than data-status.
    const active = row.querySelector('[data-active]');
    active.textContent = service.isActive ? 'Da' : 'Nu';
    active.classList.add(service.isActive ? 'badge--ok' : 'badge--bad');

    row.querySelector('[data-edit]').dataset.edit = service.id;

    // Deactivating is a DELETE; reactivating is a PUT with the flag flipped — there is no
    // "undelete" endpoint, and there does not need to be.
    const toggle = row.querySelector('[data-toggle-active]');
    toggle.textContent = service.isActive ? 'Dezactivează' : 'Reactivează';
    toggle.dataset.toggleActive = service.id;
    toggle.classList.toggle('btn--danger', service.isActive);

    return row;
}

// getAllServices, not getActiveServices: the admin is the only one who sees withdrawn services,
// and without them there would be no way to bring one back.
function render() {
    el.rows.replaceChildren(...getAllServices().map(buildRow));
}


// ── The form ─────────────────────────────────────────────────────────────────

// An <input> always hands back a string, so these need coercing. The trap is that Number('')
// is 0, not NaN — and 0 is a PERFECTLY VALID price, so an empty price field would quietly
// create a free service. NaN fails priceProblem's Number.isFinite check, which is what turns
// "you left it blank" into a message instead of a 0-lei row.
const asNumber = value => (value.trim() === '' ? NaN : Number(value));

function readForm() {
    return {
        name: el.form.elements.name.value.trim(),
        description: el.form.elements.description.value.trim(),
        durationMin: asNumber(el.form.elements.durationMin.value),
        price: asNumber(el.form.elements.price.value),
    };
}

function startAdding() {
    editingId = null;
    el.form.reset();
    clearErrors(el.form);
    el.formTitle.textContent = 'Adaugă un serviciu';
    el.save.textContent = 'Adaugă';
    el.cancel.hidden = true;
}

function startEditing(service) {
    editingId = service.id;
    clearErrors(el.form);

    el.form.elements.name.value = service.name;
    el.form.elements.description.value = service.description ?? '';
    el.form.elements.durationMin.value = service.durationMin;
    el.form.elements.price.value = service.price;

    el.formTitle.textContent = `Editează „${service.name}”`;
    el.save.textContent = 'Salvează';
    el.cancel.hidden = false;

    el.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.form.elements.name.focus();
}


// ── Reacting ─────────────────────────────────────────────────────────────────

export function initServices() {

    el.form.addEventListener('submit', event => {
        event.preventDefault();
        clearErrors(el.form);
        msg.clear();

        const data = readForm();

        // The same predicate the writer refuses with, asked first so the message lands under the
        // field it belongs to. It returns { field, message }, so there is nothing to infer.
        const problem = serviceFieldsProblem(data);
        if (problem) {
            showFieldError(el.form, problem.field, problem.message);
            el.form.elements[problem.field]?.focus();
            return;
        }

        try {
            if (editingId === null) {
                addService(data);
                msg.success(`Serviciul „${data.name}” a fost adăugat.`);
            } else {
                updateService(editingId, data);
                msg.success(`Serviciul „${data.name}” a fost actualizat.`);
            }
            startAdding();      // back to add mode, fields cleared
            render();
        } catch (err) {
            msg.error(err.message ?? 'Nu am putut salva serviciul.');
        }
    });

    el.cancel.addEventListener('click', () => {
        msg.clear();
        startAdding();
    });

    // One listener for the whole table: rows are replaced on every render.
    el.rows.addEventListener('click', event => {
        const editButton = event.target.closest('[data-edit]');
        if (editButton) {
            const service = getAllServices().find(s => s.id === Number(editButton.dataset.edit));
            if (service) startEditing(service);
            return;
        }

        const toggleButton = event.target.closest('[data-toggle-active]');
        if (!toggleButton) return;

        const id = Number(toggleButton.dataset.toggleActive);
        const service = getAllServices().find(s => s.id === id);
        if (!service) return;

        // Deactivating hides a service from every client, so it gets a confirmation.
        // Reactivating only puts it back, and needs none.
        if (service.isActive && !confirm(`Dezactivezi „${service.name}”? Nu va mai putea fi rezervat.`)) {
            return;
        }

        try {
            msg.clear();
            if (service.isActive) {
                deactivateService(id);
                msg.success(`„${service.name}” nu mai este disponibil pentru rezervări.`);
            } else {
                updateService(id, { isActive: true });
                msg.success(`„${service.name}” este din nou disponibil.`);
            }

            // Editing the row that is open in the form would leave stale values on screen.
            if (editingId === id) startAdding();
            render();
        } catch (err) {
            msg.error(err.message ?? 'Nu am putut schimba serviciul.');
        }
    });

    startAdding();
    render();
}

// Redraws the table only. The FORM is deliberately left alone: if the admin is halfway through
// typing a service, wiping the fields because another tab did something would be worse than
// showing a slightly stale table.
export function refreshServices() {
    render();
}
