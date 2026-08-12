// Pasul 1.1 — landing page.
//
// Only what is specific to this page: the service cards. The header and footer
// are shared chrome and live in layout.js.

import { getActiveServices } from './mock-data.js';
import { formatPrice, formatDuration } from './format.js';
import { initLayout } from './layout.js';

const list = document.querySelector('#services-list');
const emptyState = document.querySelector('#services-empty');
const template = document.querySelector('#service-card');

function buildCard(service) {
    const card = template.content.firstElementChild.cloneNode(true);

    card.querySelector('[data-name]').textContent = service.name;
    card.querySelector('[data-description]').textContent = service.description;
    card.querySelector('[data-duration]').textContent = formatDuration(service.durationMin);
    card.querySelector('[data-price]').textContent = formatPrice(service.price);

    const bookLink = card.querySelector('[data-book]');
    bookLink.href = `service.html?id=${service.id}`;
    // six identical "Rezervă" links are useless to someone tabbing through them
    bookLink.setAttribute('aria-label', `Rezervă ${service.name}`);

    return card;
}

function renderServices() {
    const services = getActiveServices();

    // replaceChildren empties the list and fills it in one step, so re-rendering
    // later (Pasul 3.2) does not need a manual innerHTML = '' first.
    list.replaceChildren(...services.map(buildCard));

    list.hidden = services.length === 0;
    emptyState.hidden = services.length > 0;
}

initLayout();
renderServices();
