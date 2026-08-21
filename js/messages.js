// messages.js — putting a sentence in front of the user, and taking it away again.
//
// Three pages need the same pair. form.js does this for form fields specifically; these two work
// on any element, for pages that have no <form> at all — the service page's booking result, the
// account page's cancellation notice, the admin agenda in 1.5.
//
// They know nothing about WHAT the message says or why: text in, visibility toggled. Which is
// why they survive Partea 3 untouched, when the sentences start coming from a server.

export function showMessage(node, text) {
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
}

export function clearMessage(node) {
    if (!node) return;
    node.textContent = '';
    node.hidden = true;
}

// Most pages have exactly one error slot and one success slot, and showing either should hide
// the other — a red "slot taken" left sitting above a green "booking made" is worse than no
// message at all.
export function clearMessages(...nodes) {
    nodes.forEach(clearMessage);
}
