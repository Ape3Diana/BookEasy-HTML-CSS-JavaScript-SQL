// form.js — showing and clearing validation messages.

// Shows a message under one field and marks the input as invalid.
export function showFieldError(form, fieldName, message) {
    const input = form.elements[fieldName];
    const slot = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (!input || !slot) return;

    slot.textContent = message;
    slot.hidden = false;
    slot.id ||= `error-${fieldName}`;

    input.closest('.field')?.classList.add('field--invalid');

    // aria-invalid tells a screen reader the field is wrong; aria-describedby ties the input to
    // the message, so the reason is read out with it rather than being visual-only.
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', slot.id);
}

export function clearFieldError(form, fieldName) {
    const input = form.elements[fieldName];
    const slot = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (!input || !slot) return;

    slot.textContent = '';
    slot.hidden = true;

    input.closest('.field')?.classList.remove('field--invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
}

// Errors that belong to the whole form rather than one input — a duplicate email, or anything
// the writer throws that does not map to a field.
export function showFormError(form, message) {
    const box = form.querySelector('.form-error');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
}

export function clearErrors(form) {
    for (const slot of form.querySelectorAll('[data-error-for]')) {
        clearFieldError(form, slot.dataset.errorFor);
    }
    const box = form.querySelector('.form-error');
    if (box) {
        box.textContent = '';
        box.hidden = true;
    }
}

// Wires "the message disappears as soon as the user starts fixing the field" — the half of the
// definition of done that is easy to skip, and the one that makes a form feel responsive rather
// than accusatory.
export function clearErrorsOnInput(form) {
    form.addEventListener('input', event => {
        const name = event.target.name;
        if (name) clearFieldError(form, name);

        // The form-level box goes too. It usually says "Email sau parolă incorecte", and leaving
        // it up while the user retypes contradicts what they are doing — they are already fixing
        // it. Clearing on the first keystroke is the "disappear" half of the definition of done.
        const box = form.querySelector('.form-error');
        if (box && !box.hidden) {
            box.textContent = '';
            box.hidden = true;
        }
    });
}
