// Pasul 1.2 — login.

import { login } from './mock-data.js';
import { emailProblem } from './rules.js';
import { showFieldError, showFormError, clearErrors, clearErrorsOnInput } from './form.js';
import { initLayout } from './layout.js';

const form = document.querySelector('#login-form');

function readValues() {
    return {
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
    };
}

function validate({ email, password }) {
    let ok = true;

    const emailIssue = emailProblem(email);
    if (emailIssue) {
        showFieldError(form, 'email', emailIssue);
        ok = false;
    }

    if (!password) {
        showFieldError(form, 'password', 'Introdu parola.');
        ok = false;
    }

    return ok;
}

form.addEventListener('submit', event => {
    event.preventDefault();

    clearErrors(form);
    const values = readValues();
    if (!validate(values)) {
        form.querySelector('.field--invalid input')?.focus();
        return;
    }

    try {
        // login() sets the session itself, so there is nothing to store here.
        login(values.email, values.password);
        location.href = 'index.html';
    } catch (err) {
        if (err.code === 'INVALID_CREDENTIALS') {
            showFormError(form, err.message);
            form.elements.password.value = '';
            form.elements.password.focus();
        } else {
            showFormError(form, err.message ?? 'A apărut o eroare. Încearcă din nou.');
        }
    }
});

clearErrorsOnInput(form);

initLayout({ showAuthLinks: false });
