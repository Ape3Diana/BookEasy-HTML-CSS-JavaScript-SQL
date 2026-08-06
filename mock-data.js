// The business rules live in rules.js (Anexa C) — imported here so the writers below enforce
// exactly the same numbers the UI uses to decide what to offer.
import {
    ACTIVE_STATUSES,
    MAX_ACTIVE_BOOKINGS,
    bookingTimeProblem,
    canTransition,
} from './rules.js';


function plusMinutes(iso, minutes){
    return new Date(new Date(iso).getTime() + minutes*60000).toISOString();
}

// ── The two kinds of time values in this app ─────────────────────────────────
// Practically every date bug in a booking app is these two confused:
//
//   instant    '2026-08-06T06:00:00.000Z'   a precise moment. ALWAYS UTC (Anexa A).
//                                           Fields: startsAt, endsAt, createdAt, cancelledAt.
//   date key   '2026-08-06'                 a LOCAL calendar day. Exactly what
//                                           <input type="date"> hands you, and what the
//                                           day-picker in service.html will produce.
//
// The four functions below are the only place where one is turned into the other.
// Rule for the rest of the app: if you catch yourself writing .slice(0, 10) or
// new Date('2026-08-06') anywhere else, stop — you are re-implementing one of these,
// and you will get it subtly wrong.

// instant → local date key
export function toDateKey(instant) {
    const d = instant instanceof Date ? instant : new Date(instant);
    const y = d.getFullYear();                               // getFullYear / getMonth / getDate
    const m = String(d.getMonth() + 1).padStart(2, '0');     // are the LOCAL-time getters.
    const day = String(d.getDate()).padStart(2, '0');        // (getUTCFullYear & co. are not.)
    return `${y}-${m}-${day}`;
}

// local date key + 'HH:MM' → instant
export function instantAt(dateKey, hhmm) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    // new Date(y, m, d, h, min, s, ms) builds the moment in LOCAL time — which is what a human
    // means by "09:00". Same reason dayAt() passes 0, 0 to setHours: name every field, or the
    // ones you skip keep whatever the current clock had.
    return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

export function todayKey() {
    return toDateKey(new Date());
}

// date key ± n days. The Date constructor normalizes overflow for us: 32 August becomes
// 1 September, day 0 becomes the last day of the previous month.
export function addDays(dateKey, n) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return toDateKey(new Date(y, m - 1, d + n));
}

// date key → weekday 0–6 (0 = Sunday), matching working_hours.weekday
// The trap this exists to avoid: new Date('2026-08-06').getDay() parses that string as UTC
// midnight, then reads it back in local time — so west of Greenwich you get the PREVIOUS day,
// and you look up the wrong row in workingHours. Splitting the string and passing numbers to
// the constructor forces local interpretation, so the answer is always the day you meant.
export function weekdayOf(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
}


// ── Seed data generator ──────────────────────────────────────────────────────
const TODAY = todayKey();

function dayAt(offsetDays, hhmm) {
    return instantAt(addDays(TODAY, offsetDays), hhmm);
}


// mock tables
const users = [
    { id: 1, email: 'admin@aura.ro',  fullName: 'Ana Admin',    role: 'admin',  password: 'admin123',  createdAt: dayAt(-90, '10:00') },
    { id: 2, email: 'diana@mail.com', fullName: 'Diana Client', role: 'client', password: 'parola123', createdAt: dayAt(-40, '18:30') },
    { id: 3, email: 'radu@mail.com',  fullName: 'Radu Client',  role: 'client', password: 'parola123', createdAt: dayAt(-15, '09:10') },
    { id: 4, email: 'maria@mail.com', fullName: 'Maria Client', role: 'client', password: 'parola123', createdAt: dayAt(-2,  '20:00') }, // 0 rezervations → empty state
];

const services = [
    { id: 1, name: 'Tuns damă',     description: 'Tuns, spălat și coafat',        durationMin: 60,  price: 120, isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 2, name: 'Tuns bărbați',  description: 'Tuns clasic sau fade',          durationMin: 30,  price: 70,  isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 3, name: 'Manichiură',    description: 'Manichiură cu ojă semipermanentă', durationMin: 45,  price: 90,  isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 4, name: 'Vopsit + tuns', description: 'Vopsit integral, include tuns', durationMin: 120, price: 320, isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 5, name: 'Tratament păr', description: 'Serviciu retras din ofertă',    durationMin: 45,  price: 100, isActive: false, createdAt: dayAt(-90, '10:00') }, // test soft delete
];

const workingHours = [
    { id: 1, weekday: 0, opensAt: null,    closesAt: null    }, // sunday closd
    { id: 2, weekday: 1, opensAt: '09:00', closesAt: '18:00' },
    { id: 3, weekday: 2, opensAt: '09:00', closesAt: '18:00' },
    { id: 4, weekday: 3, opensAt: '09:00', closesAt: '18:00' },
    { id: 5, weekday: 4, opensAt: '09:00', closesAt: '20:00' },
    { id: 6, weekday: 5, opensAt: '09:00', closesAt: '20:00' },
    { id: 7, weekday: 6, opensAt: '10:00', closesAt: '14:00' }, // saturday - short day
];

// The fields that do NOT exist in the bookings table are marked below: they arrive glued on by
// the JOINs the API performs (Pas 2.4 — bookings × services for the client, plus users for the
// admin agenda). They are duplicated into the seed on purpose, so that the object a page
// receives here is the same object it will receive from the API in Partea 3. Without them,
// account.html would resolve the price with getServiceById(...) — a lookup that works only
// while the whole "database" happens to live in the browser.
const bookings = [
    {
        id: 1, userId: 2, serviceId: 1,
        serviceName: 'Tuns damă', price: 120,                                  // JOIN services
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',             // JOIN users
        startsAt: dayAt(1, '10:00'), endsAt: dayAt(1, '11:00'),
        status: 'confirmed',
        createdAt: dayAt(-3, '12:00'), cancelledAt: null,
    },
    {
        id: 2, userId: 3, serviceId: 2,
        serviceName: 'Tuns bărbați', price: 70,
        userFullName: 'Radu Client', userEmail: 'radu@mail.com',
        startsAt: dayAt(1, '11:30'), endsAt: dayAt(1, '12:00'),
        status: 'pending',
        createdAt: dayAt(-1, '09:20'), cancelledAt: null,
    },
    {
        id: 3, userId: 2, serviceId: 3,
        serviceName: 'Manichiură', price: 90,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(2, '15:00'), endsAt: dayAt(2, '15:45'),
        status: 'pending',
        createdAt: dayAt(-1, '18:05'), cancelledAt: null,
    },
    {
        // past + completed → not in "future", valid for statistics
        id: 4, userId: 2, serviceId: 2,
        serviceName: 'Tuns bărbați', price: 70,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(-5, '10:00'), endsAt: dayAt(-5, '10:30'),
        status: 'completed',
        createdAt: dayAt(-9, '11:00'), cancelledAt: null,
    },
    {
        // cancelled → MUST NOT block slots (RB-02)
        id: 5, userId: 2, serviceId: 4,
        serviceName: 'Vopsit + tuns', price: 320,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(-2, '13:00'), endsAt: dayAt(-2, '15:00'),
        status: 'cancelled',
        createdAt: dayAt(-8, '10:00'), cancelledAt: dayAt(-6, '10:00'),
    },
    {
        // under 24h → "Cancel" button MUST NOT appear (RB-05)
        id: 6, userId: 2, serviceId: 2,
        serviceName: 'Tuns bărbați', price: 70,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(0, '17:00'), endsAt: dayAt(0, '17:30'),
        status: 'confirmed',
        createdAt: dayAt(-4, '10:00'), cancelledAt: null,
    },
    {
        // block 4 consecutive slots tomorrow, 13:00–14:00 (long rezervation)
        id: 7, userId: 3, serviceId: 4,
        serviceName: 'Vopsit + tuns', price: 320,
        userFullName: 'Radu Client', userEmail: 'radu@mail.com',
        startsAt: dayAt(1, '13:00'), endsAt: dayAt(1, '15:00'),
        status: 'confirmed',
        createdAt: dayAt(-2, '16:40'), cancelledAt: null,
    },

    // ── Old bookings for Diana (user 2), so the pager in account.html has a second page ──
    // All in the past and terminal, so they change nothing: they do not block slots (RB-02)
    // and they are not counted as future active bookings (RB-07).
    {
        id: 8, userId: 2, serviceId: 1,
        serviceName: 'Tuns damă', price: 120,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(-12, '11:00'), endsAt: dayAt(-12, '12:00'),
        status: 'completed',
        createdAt: dayAt(-18, '09:30'), cancelledAt: null,
    },
    {
        id: 9, userId: 2, serviceId: 3,
        serviceName: 'Manichiură', price: 90,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(-20, '16:00'), endsAt: dayAt(-20, '16:45'),
        status: 'completed',
        createdAt: dayAt(-25, '14:10'), cancelledAt: null,
    },
    {
        id: 10, userId: 2, serviceId: 2,
        serviceName: 'Tuns bărbați', price: 70,
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        startsAt: dayAt(-31, '09:30'), endsAt: dayAt(-31, '10:00'),
        status: 'cancelled',
        createdAt: dayAt(-35, '20:15'), cancelledAt: dayAt(-33, '08:00'),
    },
];


//simulated session (will be replaced in part 3)
let currentUserId = null;

export function setCurrentUserId(id) {
    currentUserId = (id === null || id === undefined) ? null : Number(id);
}

// GET /api/auth/me — null means "visitor" (the API answers 401)
export function getCurrentUser() {
    const u = getUserById(currentUserId);
    if (!u) return null;
    const { password, ...safe } = u;   // the API never sends this
    return safe;
}

// ── The auth endpoints ───────────────────────────────────────────────────────
// One function per endpoint, so a page calls login(...) now and api.login(...) in Partea 3.
// Without these, login.html would compare the password itself — server logic living in a page,
// deleted in Partea 3, and teaching the wrong shape while it exists: the client is never the
// one who decides whether a password is correct.

// POST /api/auth/login — throws on failure, and deliberately does not say WHICH half was wrong.
// Pas 2.3: the same generic message either way, so an attacker cannot discover which emails
// have accounts. The page shows "Email sau parolă incorecte" and nothing more specific.
export function login(email, password) {
    const user = getUserByEmail(email);
    if (!user || user.password !== password) {
        throw new ApiError('INVALID_CREDENTIALS', 'Email sau parolă incorecte.', 401);
    }
    setCurrentUserId(user.id);
    return getCurrentUser();
}

// POST /api/auth/logout — here it clears a variable; in Partea 2 it destroys the session on the
// SERVER, not just the cookie, which is why the page must call this rather than forget locally.
export function logout() {
    setCurrentUserId(null);
}


// simulated queries
// IMPORTANT: Simulate a DB. Don't work directly with the arrays, use intermediate functions
// that have access to them => useful for part 3

// ── Errors ───────────────────────────────────────────────────────────────────
// The format is fixed by Pas 2.4: { error: { code, message } } plus an HTTP status. Pas 3.1
// says api.js extracts code and message from it. So the mock raises the same thing, and pages
// are written with try/catch from the first line — in Partea 3 only the `await` is added.
//
//   throw new ApiError('EMAIL_TAKEN', 'Acest email este deja folosit.', 409)
//
// `code` is for your code to branch on (stable, never translated); `message` is for the user
// (Romanian, may change freely). Never branch on the message text.
export class ApiError extends Error {
    constructor(code, message, status) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
    }
}

// ── Copies, not live rows ────────────────────────────────────────────────────
// Readers hand out shallow copies. Over the network you receive a snapshot: mutating it changes
// nothing on the server. Returning live objects here would let a page do booking.status = '...'
// and appear to work — then silently stop working in Partea 3. Copying makes the mock behave
// like the wire, so the only way to change data is to call a writer.
const clone = row => (row ? { ...row } : null);
const cloneAll = rows => rows.map(r => ({ ...r }));

// ── Additions to Anexa B ─────────────────────────────────────────────────────
// Two endpoints the app needs but the documentation does not list. 
//
//   GET /api/admin/services   A   all services, active and inactive
//
//
//   GET /api/services/:id     —   one service, for service.html?id=3

// GET /api/services — SELECT * FROM services WHERE is_active = true ORDER BY name
export function getActiveServices() {
    return cloneAll(services
        .filter(s => s.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'ro')));
}

// GET /api/admin/services — SELECT * FROM services ORDER BY name  (inactive ones included)
export function getAllServices() {
    return cloneAll([...services].sort((a, b) => a.name.localeCompare(b.name, 'ro')));
}

// GET /api/services/:id — 404 if it does not exist (service.html?id=999, or a stale link).
// Throwing rather than returning null also removes a crash: addBooking() used to read
// service.name off null when handed a bad id from the query string.
export function getServiceById(id) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    return clone(service);
}

// Not exported: no endpoint returns an arbitrary user, and these rows still carry the password.
// They are internal steps of login/register/addBooking — the parts of this file playing SERVER
// rather than API. In Partea 3 they do not become fetch calls, they simply cease to exist.
function getUserById(id) {
    return users.find(u => u.id === Number(id)) ?? null;
}

function getUserByEmail(email) {
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

// SELECT * FROM working_hours ORDER BY weekday
export function getAllWorkingHours() {
    return cloneAll([...workingHours].sort((a, b) => a.weekday - b.weekday));
}

// SELECT * FROM working_hours WHERE weekday = $1
// null is a normal answer here (closed days exist), so no throw.
export function getWorkingHoursFor(weekday) {
    return clone(workingHours.find(w => w.weekday === weekday) ?? null);
}

// PUT /api/admin/working-hours — replaces the whole week (opensAt/closesAt null = closed)
export function updateWorkingHours(week) {
    week.forEach(({ weekday, opensAt, closesAt }) => {
        const row = workingHours.find(w => w.weekday === weekday);
        if (row) Object.assign(row, { opensAt, closesAt });
    });
    return getAllWorkingHours();
}

// client's bookings, newest first
// pageSize 5 so the seed (8 bookings for Diana) actually produces two pages — otherwise the
// pager in account.html has nothing to exercise. Pas 2.4 asks for a 60+ row seed to prove it.
export function getBookingsForUser(userId, page = 1, pageSize = 5) {
    const all = bookings
        .filter(b => b.userId === Number(userId))
        .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));

    // Clamp the page. Without this, page = -1 gives start = -10, and slice(-10, -5) counts from
    // the END of the array — so it returns real bookings, just the wrong ones, with no error.
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const start = (safePage - 1) * pageSize;
    return { items: cloneAll(all.slice(start, start + pageSize)), total: all.length, page: safePage, pageSize };
}

// both sides of the comparison are now local date keys, by construction.
// day agenda (admin), chronological. dateKey = local 'YYYY-MM-DD'
// GET /api/admin/bookings?date=&status= — the status filter is applied HERE, not in admin.html,
// because in Partea 2 the server applies it (WHERE status = $2). Filtering in the page instead
// would be code you delete in Partea 3; filtering here means admin.html passes the same two
// arguments to the mock now and to api.getAdminBookings(...) later. status = null → all.
export function getBookingsForDay(dateKey, status = null) {
    return cloneAll(bookings
        .filter(b => toDateKey(b.startsAt) === dateKey)
        .filter(b => !status || b.status === status)
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
}

// just active rezervations (RB-02: cancelled doesn't block)
export function getActiveBookingsForDay(dateKey) {
    return getBookingsForDay(dateKey).filter(b => ACTIVE_STATUSES.includes(b.status));
}

// RB-07 (max 3 future bookings per client)
export function countActiveFutureBookings(userId, now = new Date()) {
    return bookings.filter(b =>
        b.userId === Number(userId) &&
        ACTIVE_STATUSES.includes(b.status) &&
        new Date(b.startsAt) > now
    ).length;
}


// writing functions
function nextId(rows) {
    return rows.length === 0 ? 1 : Math.max(...rows.map(r => r.id)) + 1;
}

// INSERT INTO users (...) — the register form in Pas 1.2
// Returns null on a duplicate email. That is the same condition the server answers with 409
// (Pas 2.3), and what lets the form show "Acest email este deja folosit" under the field.
// role is always 'client': an admin is created by the seed, never by registration.
export function addUser({ fullName, email, password }) {
    if (getUserByEmail(email)) {
        throw new ApiError('EMAIL_TAKEN', 'Acest email este deja folosit.', 409);
    }
    const user = {
        id: nextId(users),
        email,
        password,          // Partea 1 only. In Pas 2.3 this becomes a bcrypt hash, server-side.
        fullName,
        role: 'client',
        createdAt: new Date().toISOString(),
    };
    users.push(user);

    // Pas 2.3: register "creează sesiunea" — you are logged in as soon as the account exists.
    // Doing it here rather than in register.html keeps the page's flow identical in Partea 3,
    // where the server sets the cookie and the page just redirects.
    setCurrentUserId(user.id);
    return getCurrentUser();   // same shape as login() and /auth/me — never includes password
}

// POST /api/bookings — the one endpoint with real failure modes (Pas 2.5).
// The mock raises them so that the confirm handler in Pas 1.3 has an error branch from the
// start. In Partea 2 the SLOT_TAKEN check becomes the UNIQUE constraint on booking_slots inside
// a transaction — the check here is the friendly message, never the guarantee (RB-04).
export function addBooking({ userId, serviceId, startsAt }) {
    const service = getServiceById(serviceId);          // 404 if the id is bogus
    const user = getUserById(userId);
    // POST /api/bookings is auth `C` — no session, no booking. Without this the next line
    // would read .fullName off null and crash instead of failing the way the API fails.
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Trebuie să fii autentificat.', 401);
    const endsAt = plusMinutes(startsAt, service.durationMin);

    // RB-03 — the same predicate the slot grid uses to decide what to display
    const timeProblem = bookingTimeProblem(startsAt);
    if (timeProblem === 'TOO_SOON') {
        throw new ApiError(timeProblem, 'Rezervările se fac cu cel puțin o oră înainte.', 422);
    }
    if (timeProblem === 'TOO_FAR') {
        throw new ApiError(timeProblem, 'Rezervările se fac cu cel mult 30 de zile înainte.', 422);
    }

    // RB-07
    if (countActiveFutureBookings(userId) >= MAX_ACTIVE_BOOKINGS) {
        throw new ApiError(
            'TOO_MANY_BOOKINGS',
            `Ai deja ${MAX_ACTIVE_BOOKINGS} rezervări active.`,
            422,
        );
    }

    // RB-02 — overlap with an active booking. Half-open intervals [start, end): a booking that
    // ends at 11:00 does not collide with one that starts at 11:00.
    const collides = bookings.some(b =>
        ACTIVE_STATUSES.includes(b.status) &&
        new Date(startsAt) < new Date(b.endsAt) &&
        new Date(endsAt) > new Date(b.startsAt)
    );
    if (collides) {
        throw new ApiError('SLOT_TAKEN', 'Intervalul tocmai a fost rezervat.', 409);
    }

    const booking = {
        id: nextId(bookings),
        userId: Number(userId),
        serviceId: Number(serviceId),
        // same JOIN-derived fields the seed rows carry, so a freshly created booking is
        // indistinguishable from one that came back from the API
        serviceName: service.name,
        price: service.price,
        userFullName: user.fullName,
        userEmail: user.email,
        startsAt,
        endsAt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        cancelledAt: null,
    };
    bookings.push(booking);
    return clone(booking);
}

// DELETE /api/bookings/:id — 404 if it does not exist.
// In Pas 2.5 this also deletes the rows from booking_slots, which is what frees the interval.
export function cancelBooking(id) {
    const booking = bookings.find(b => b.id === Number(id));
    if (!booking) throw new ApiError('NOT_FOUND', 'Rezervarea nu există.', 404);
    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    return clone(booking);
}

// PATCH /api/admin/bookings/:id/status — 422 on an invalid transition (Pas 2.6).
// admin.html asks canTransition() to decide which buttons to render; this asks the same
// function to refuse anything that gets through anyway. Both layers, one rule.
export function setBookingStatus(id, status) {
    const booking = bookings.find(b => b.id === Number(id));
    if (!booking) throw new ApiError('NOT_FOUND', 'Rezervarea nu există.', 404);

    if (!canTransition(booking.status, status)) {
        throw new ApiError(
            'INVALID_TRANSITION',
            `O rezervare ${booking.status} nu poate deveni ${status}.`,
            422,
        );
    }

    booking.status = status;
    if (status === 'cancelled') booking.cancelledAt = new Date().toISOString();
    return clone(booking);
}

// ── Numeric fields ───────────────────────────────────────────────────────────
// Two ways a number stops being a number, both silent:
//   1. an <input> always yields a STRING, so the admin form sends price: "120"
//   2. price is DECIMAL in the schema, and the standard Postgres driver returns numeric as a
//      string ("120.00") to avoid float precision loss
// Either one turns 120 + 50 into "12050". Coercing on the way in fixes (1) here; for (2), the
// decision for Pas 2.4 is that the SERVER casts prices to numbers before responding, so the
// JSON matches this mock. Write that down in the API notes — it is a contract, not a detail.
function normalizeService(data) {
    const out = { ...data };
    if ('price' in out) out.price = Number(out.price);
    if ('durationMin' in out) out.durationMin = Number(out.durationMin);
    return out;
}

// POST /api/services
export function addService(data) {
    const service = {
        id: nextId(services),
        isActive: true,
        createdAt: new Date().toISOString(),
        ...normalizeService(data),
    };
    services.push(service);
    return clone(service);
}

// PUT /api/services/:id — 404 if it does not exist
export function updateService(id, data) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    Object.assign(service, normalizeService(data));
    return clone(service);
}

// DELETE /api/services/:id — soft delete
export function deactivateService(id) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    service.isActive = false;
    return clone(service);
}