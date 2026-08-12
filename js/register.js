// Pasul 1.2 — register.

import { addUser } from './mock-data.js';
import { fullNameProblem, emailProblem, passwordProblem } from './rules.js';
import { showFieldError, showFormError, clearErrors, clearErrorsOnInput } from './form.js';
import { initLayout } from './layout.js';

const form = document.querySelector('#register-form');

const VALIDATORS = {
    fullName: fullNameProblem,
    email: emailProblem,
    password: passwordProblem,
};

function readValues() {
    return {
        fullName: form.elements.fullName.value.trim(),
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
        passwordConfirm: form.elements.passwordConfirm.value,
    };
}

function validate(values) {
    let ok = true;

    for (const [field, check] of Object.entries(VALIDATORS)) {
        const problem = check(values[field]);
        if (problem) {
            showFieldError(form, field, problem);
            ok = false;
        }
    }

    if (values.passwordConfirm !== values.password) {
        showFieldError(form, 'passwordConfirm', 'Parolele nu coincid.');
        ok = false;
    }

    return ok;
}

form.addEventListener('submit', event => {
    event.preventDefault();

    clearErrors(form);
    const values = readValues();
    if (!validate(values)) {
        // send focus to the first thing that needs fixing
        form.querySelector('.field--invalid input')?.focus();
        return;
    }

    try {
        // addUser validates again and creates the session itself, so there is nothing to store
        // here and no password to compare — exactly what api.register(...) will do in Partea 3.
        addUser(values);
        location.href = 'index.html';
    } catch (err) {
        if (err.code === 'EMAIL_TAKEN') {
            showFieldError(form, 'email', err.message);
            form.elements.email.focus();
        } else {
            showFormError(form, err.message ?? 'A apărut o eroare. Încearcă din nou.');
        }
    }
});

clearErrorsOnInput(form);

initLayout({ showAuthLinks: false });
