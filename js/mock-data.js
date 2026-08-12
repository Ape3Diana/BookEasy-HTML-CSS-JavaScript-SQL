// The business rules live in rules.js (Anexa C) — imported here so the writers below enforce
// exactly the same numbers the UI uses to decide what to offer.
import {
    ACTIVE_STATUSES,
    MAX_ACTIVE_BOOKINGS,
    bookingTimeProblem,
    canTransition,
    serviceFitsInDay,
    isOnSlotBoundary,
    serviceFieldsProblem,
    registrationProblem,
} from './rules.js';

// The instant ↔ local-day conversions live in date-utils.js.
import {
    toDateKey,
    instantAt,
    todayKey,
    addDays,
    weekdayOf,
    plusMinutes,
    minutesOfDay,
    minutesFromTime,
} from './date-utils.js';


const clone = row => (row ? { ...row } : null);
const cloneAll = rows => rows.map(r => ({ ...r }));

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
    //{ id: 6, name: 'Test', description: 'x', durationMin: 30, price: 100, isActive: true, createdAt: dayAt(-90, '10:00') }
];

const employees = [
    { id: 1, fullName: 'Ana Popescu',   isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 2, fullName: 'Maria Ionescu', isActive: true,  createdAt: dayAt(-90, '10:00') },
    { id: 3, fullName: 'Elena Vasile',  isActive: true,  createdAt: dayAt(-60, '10:00') },
    { id: 4, fullName: 'Ioana Plecată', isActive: false, createdAt: dayAt(-80, '10:00') }, // left the salon
];

// Which employee can perform which service — a LINK TABLE (many-to-many).
// In Partea 2 this is a table with a composite primary key (employee_id, service_id) and a
// foreign key to each side.
const employeeServices = [
    { employeeId: 1, serviceId: 1 },   // Ana — hair
    { employeeId: 1, serviceId: 2 },
    { employeeId: 1, serviceId: 4 },
    { employeeId: 2, serviceId: 1 },   // Maria — hair + nails
    { employeeId: 2, serviceId: 3 },
    { employeeId: 3, serviceId: 3 },   // Elena — nails only
    { employeeId: 3, serviceId: 5 },   // ...and one inactive service, to test filtering
    { employeeId: 4, serviceId: 1 },   // Ioana no longer works here — must never be offered
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

// ── Which days the seed bookings land on ─────────────────────────────────────
// So the future bookings pick the first upcoming day whose schedule can actually hold them,
// using the same rule the writer enforces.
// specs: [['10:00', 60], ['13:00', 120]] — every one of them must fit on the same day
function firstDayFitting(specs, fromOffset = 1) {
    for (let offset = fromOffset; offset < fromOffset + 14; offset++) {
        const hours = getWorkingHoursFor(weekdayOf(addDays(TODAY, offset)));
        if (hours && specs.every(([at, mins]) => serviceFitsInDay(minutesFromTime(at), mins, hours))) {
            return offset;
        }
    }
    return fromOffset;   // unreachable unless the salon is shut all fortnight
}

// bookings 1, 2 and 7 share a day: 10:00–11:00, 11:30–12:00 and 13:00–15:00
const BOOKING_DAY = firstDayFitting([['10:00', 60], ['11:30', 30], ['13:00', 120]]);
// booking 3 sits on a later day: 15:00–15:45
const BOOKING_DAY_2 = firstDayFitting([['15:00', 45]], BOOKING_DAY + 1);
// booking 6 is the RB-05 fixture and wants to be under 24h away, so it prefers today — but only
// if the salon is open late enough. When today is closed or short it slides to the next day that
// fits, which can push it past 24h; the rule itself is tested directly against canClientCancel,
// so the fixture drifting is a cosmetic loss, not a hole in the coverage.
const SOON_DAY = firstDayFitting([['17:00', 30]], 0);

// Past bookings keep their fixed negative offsets. A historical booking outside today's hours is
// legitimate — schedules change, and Anexa B lets the admin edit them — so those rows stay as
// they are rather than pretending the current programme always applied.


// Two kinds of extra field live on a booking, and they are NOT the same thing:
//
//   price — a REAL COLUMN, written once when the booking is created and never recomputed.
//     A price snapshot: if the admin raises "Tuns damă" from 120 to 150, last month's revenue
//     must still report 120. Reading the price through services would silently rewrite history
//     every time the price list changes.
//
//   serviceName / employeeName / userFullName / userEmail — NOT columns. They arrive glued on
//     by the JOINs the API performs (Pas 2.4): services, employees and users respectively.
//     Duplicated into the seed on purpose, so the object a page receives here is the object it
//     will receive from the API in Partea 3.
const bookings = [
    {
        id: 1, userId: 2, serviceId: 1, employeeId: 1,
        serviceName: 'Tuns damă', employeeName: 'Ana Popescu',                 // JOIN
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',             // JOIN
        price: 120,                                                            // column
        startsAt: dayAt(BOOKING_DAY, '10:00'), endsAt: dayAt(BOOKING_DAY, '11:00'),
        status: 'confirmed',
        createdAt: dayAt(-3, '12:00'), cancelledAt: null,
    },
    {
        id: 2, userId: 3, serviceId: 2, employeeId: 1,
        serviceName: 'Tuns bărbați', employeeName: 'Ana Popescu',
        userFullName: 'Radu Client', userEmail: 'radu@mail.com',
        price: 70,
        startsAt: dayAt(BOOKING_DAY, '11:30'), endsAt: dayAt(BOOKING_DAY, '12:00'),
        status: 'pending',
        createdAt: dayAt(-1, '09:20'), cancelledAt: null,
    },
    {
        id: 3, userId: 2, serviceId: 3, employeeId: 2,
        serviceName: 'Manichiură', employeeName: 'Maria Ionescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 90,
        startsAt: dayAt(BOOKING_DAY_2, '15:00'), endsAt: dayAt(BOOKING_DAY_2, '15:45'),
        status: 'pending',
        createdAt: dayAt(-1, '18:05'), cancelledAt: null,
    },
    {
        // past + completed → counts towards revenue, does not count as "future"
        // NOTE the price: sold at 60, while the price list now says 70. Revenue must report 60.
        id: 4, userId: 2, serviceId: 2, employeeId: 1,
        serviceName: 'Tuns bărbați', employeeName: 'Ana Popescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 60,
        startsAt: dayAt(-5, '10:00'), endsAt: dayAt(-5, '10:30'),
        status: 'completed',
        createdAt: dayAt(-9, '11:00'), cancelledAt: null,
    },
    {
        // cancelled → MUST NOT block slots (RB-02), MUST NOT count as revenue
        id: 5, userId: 2, serviceId: 4, employeeId: 1,
        serviceName: 'Vopsit + tuns', employeeName: 'Ana Popescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 320,
        startsAt: dayAt(-2, '13:00'), endsAt: dayAt(-2, '15:00'),
        status: 'cancelled',
        createdAt: dayAt(-8, '10:00'), cancelledAt: dayAt(-6, '10:00'),
    },
    {
        // under 24h → "Cancel" button MUST NOT appear (RB-05)
        id: 6, userId: 2, serviceId: 2, employeeId: 1,
        serviceName: 'Tuns bărbați', employeeName: 'Ana Popescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 70,
        startsAt: dayAt(SOON_DAY, '17:00'), endsAt: dayAt(SOON_DAY, '17:30'),
        status: 'confirmed',
        createdAt: dayAt(-4, '10:00'), cancelledAt: null,
    },
    {
        // long booking, blocks 13:00–15:00 tomorrow — but only for ANA. Maria and Elena are
        // still free then: that is the whole point of per-employee availability.
        id: 7, userId: 3, serviceId: 4, employeeId: 1,
        serviceName: 'Vopsit + tuns', employeeName: 'Ana Popescu',
        userFullName: 'Radu Client', userEmail: 'radu@mail.com',
        price: 320,
        startsAt: dayAt(BOOKING_DAY, '13:00'), endsAt: dayAt(BOOKING_DAY, '15:00'),
        status: 'confirmed',
        createdAt: dayAt(-2, '16:40'), cancelledAt: null,
    },

    // ── Old bookings for Diana (user 2), so the pager in account.html-css has a second page ──
    // All in the past and terminal, so they change nothing: they do not block slots (RB-02)
    // and they are not counted as future active bookings (RB-07).
    {
        id: 8, userId: 2, serviceId: 1, employeeId: 2,
        serviceName: 'Tuns damă', employeeName: 'Maria Ionescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 110,                                                  // older, cheaper price
        startsAt: dayAt(-12, '11:00'), endsAt: dayAt(-12, '12:00'),
        status: 'completed',
        createdAt: dayAt(-18, '09:30'), cancelledAt: null,
    },
    {
        id: 9, userId: 2, serviceId: 3, employeeId: 3,
        serviceName: 'Manichiură', employeeName: 'Elena Vasile',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 90,
        startsAt: dayAt(-20, '16:00'), endsAt: dayAt(-20, '16:45'),
        status: 'completed',
        createdAt: dayAt(-25, '14:10'), cancelledAt: null,
    },
    {
        id: 10, userId: 2, serviceId: 2, employeeId: 1,
        serviceName: 'Tuns bărbați', employeeName: 'Ana Popescu',
        userFullName: 'Diana Client', userEmail: 'diana@mail.com',
        price: 70,
        startsAt: dayAt(-31, '09:30'), endsAt: dayAt(-31, '10:00'),
        status: 'cancelled',
        createdAt: dayAt(-35, '20:15'), cancelledAt: dayAt(-33, '08:00'),
    },
];


// ── Persistence ──────────────────────────────────────────────────────────────
// Every page load re-imports this file, which rebuilds the tables above from the seed. So
// without this block a user who registered on register.html would not exist by the time
// index.html loaded, and a booking made in 1.3 would be gone before account.html could show it.
//
// That would make the Partea 1 checkpoint impossible: register → login → rezervare → cont →
// admin is five pages, and therefore five module reloads.
//
// So the mutable tables are mirrored into localStorage. It stays INSIDE this module — no page
// knows storage exists — and it dies with the file in Partea 3, when the data genuinely lives
// on a server and every page load fetches it fresh over HTTP.
//
// employees and employeeServices are absent on purpose: nothing can change them yet. Add them
// here the day an admin screen can.
// smoke-test.html sets window.__BOOKEASY_TEST__ in a plain <script> before its module runs, so
// the tests read and write their own storage. Without this they share one key with the app, and
// a test run leaves behind its fixtures — services called "Test", deactivated rows, edited
// working hours — which then show up on the landing page as if they were real data.
const TEST_MODE = globalThis.__BOOKEASY_TEST__ === true;
const STATE_KEY = TEST_MODE ? 'bookeasy.test.state' : 'bookeasy.state';

const TABLES = { users, services, bookings, workingHours };

function saveState() {
    try {
        // seededOn stamps which day the fixtures were generated for. The seed is built from
        // offsets relative to today, so state kept overnight would describe yesterday's week —
        // "tomorrow at 10:00" would quietly become today, or the past.
        localStorage.setItem(STATE_KEY, JSON.stringify({ seededOn: TODAY, ...TABLES }));
    } catch { /* storage unavailable — the mock simply stops persisting */ }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw);
        if (saved.seededOn !== TODAY) return;      // stale fixtures: fall back to a fresh seed

        // The tables are const, so they are refilled in place rather than reassigned. Every
        // query below closes over these exact arrays.
        for (const [name, table] of Object.entries(TABLES)) {
            if (Array.isArray(saved[name])) table.splice(0, table.length, ...saved[name]);
        }
    } catch { /* corrupt or unreadable — keep the seed */ }
}

// A pristine copy of the fixtures, taken BEFORE anything saved is restored over them. Deep, so
// that later edits to a row cannot reach back and change the copy.
const SEED = structuredClone(TABLES);

// Throws away everything written since the seed and logs out. The smoke test calls it first so
// every run starts from identical data, and it is the quickest way to undo a mess by hand:
//
//   import('./js/mock-data.js').then(m => m.resetMockData())
//
// It rebuilds the tables in memory rather than reloading the page — a reset that reloaded would
// send the smoke test into an endless loop.
export function resetMockData() {
    for (const [name, table] of Object.entries(TABLES)) {
        table.splice(0, table.length, ...structuredClone(SEED[name]));
    }
    setCurrentUserId(null);
    saveState();
}

loadState();


// ── Simulated session ────────────────────────────────────────────────────────
// A module variable alone is not enough: every page load re-imports this file with fresh state,
// so a user who logged in on index.html-css would arrive at service.html-css as a visitor. Pasul 1.2
// calls for localStorage precisely for this, and keeping it INSIDE the module means no page ever
// touches storage — pages only ever call login / logout / getCurrentUser.
//
// In Partea 3 the whole block dies: the browser sends an httpOnly cookie automatically, which
// JavaScript cannot read at all. That is the upgrade — right now anyone can open DevTools and
// write bookeasy.userId = 1 to become the admin, and no amount of client code can prevent it.
// A session cookie cannot be forged that way.
const SESSION_KEY = TEST_MODE ? 'bookeasy.test.userId' : 'bookeasy.userId';

function readStoredUserId() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw === null ? null : Number(raw);      // localStorage only ever returns strings
    } catch {
        return null;                                    // storage disabled — behave as a visitor
    }
}

let currentUserId = readStoredUserId();

// Not exported: no endpoint corresponds to "become this user". Pages get a session by calling
// login() or addUser(), and drop it with logout().
function setCurrentUserId(id) {
    currentUserId = (id === null || id === undefined) ? null : Number(id);
    try {
        if (currentUserId === null) localStorage.removeItem(SESSION_KEY);
        else localStorage.setItem(SESSION_KEY, String(currentUserId));
    } catch { /* storage disabled — the session just will not survive navigation */ }
}

// GET /api/auth/me — null means "visitor".
//
// The API answers 401 for a visitor, which is NOT an error condition: being logged out is a
// normal answer to "who am I". So api.js must translate 401 → null for this one endpoint,
// instead of throwing the way it does everywhere else. Every page calls this on load to decide
// whether to render the logged-in header.
export function getCurrentUser() {
    const u = getUserById(currentUserId);
    if (!u) return null;
    const { password, ...safe } = u;   // the API never sends this
    return safe;
}

// ── The auth endpoints ───────────────────────────────────────────────────────
// One function per endpoint, so a page calls login(...) now and api.login(...) in Partea 3.
// Without these, login.html-css would compare the password itself — server logic living in a page,
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

// ── Additions to Anexa B ─────────────────────────────────────────────────────
// Endpoints the app needs but the documentation does not list.
//
//   GET /api/admin/services            A   all services, active and inactive
//   GET /api/services/:id              —   one service, for service.html-css?id=3
//
// Added with the employees change:
//   GET /api/employees                 —   active employees
//   GET /api/services/:id/employees    —   who can perform this service (the picker in 1.3)
//
// And two existing endpoints change shape:
//   GET  /api/availability   gains &employeeId= — availability is per employee now
//   POST /api/bookings       gains employeeId in the body

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

// GET /api/services/:id — 404 if it does not exist (service.html-css?id=999, or a stale link).
// Throwing rather than returning null also removes a crash: addBooking() used to read
// service.name off null when handed a bad id from the query string.
export function getServiceById(id) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    return clone(service);
}

// ── Employees ────────────────────────────────────────────────────────────────

// GET /api/employees — SELECT * FROM employees WHERE is_active = true ORDER BY full_name
// A list endpoint: an empty result is a normal answer, not an error, so this never throws.
export function getActiveEmployees() {
    return cloneAll(employees
        .filter(e => e.isActive)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ro')));
}

// GET /api/services/:id/employees — the employee picker on service.html-css.
// In Partea 2 this is the link table joined to employees:
//   SELECT e.* FROM employees e
//   JOIN employee_services es ON es.employee_id = e.id
//   WHERE es.service_id = $1 AND e.is_active = true
//   ORDER BY e.full_name
// Inactive employees are filtered HERE, not in the page: someone who left the salon must never
// be offered, and a page that forgot to filter would happily offer them.
export function getEmployeesForService(serviceId) {
    // 404 for a service that does not exist OR is withdrawn: this is the public booking flow,
    // and offering staff for a service nobody can book would be a dead end. addBooking refuses
    // the same pair, so the two agree.
    const service = getServiceById(serviceId);
    if (!service.isActive) {
        throw new ApiError('NOT_FOUND', 'Serviciul nu mai este disponibil.', 404);
    }
    const ids = employeeServices
        .filter(link => link.serviceId === Number(serviceId))
        .map(link => link.employeeId);
    return cloneAll(employees
        .filter(e => e.isActive && ids.includes(e.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ro')));
}

// internal — no endpoint, so a plain boolean. Both addBooking and the slot grid ask this.
function employeeCanDoService(employeeId, serviceId) {
    return employeeServices.some(link =>
        link.employeeId === Number(employeeId) && link.serviceId === Number(serviceId));
}

// internal — no endpoint returns one arbitrary employee, so null rather than a throw
function getEmployeeById(id) {
    return employees.find(e => e.id === Number(id)) ?? null;
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

// GET /api/working-hours — PUBLIC. SELECT * FROM working_hours ORDER BY weekday
//
// Another endpoint missing from Anexa B, which only has GET /api/admin/working-hours
// (auth A). But the programme is shown in the footer of every page, to visitors who are
// not logged in — it is the sign on the shop door. In Partea 3 a visitor calling the
// admin route would get 403 and the footer would be empty for everyone but the admin.
//
// Reading the hours is public; only EDITING them is admin (PUT /api/admin/working-hours).
export function getAllWorkingHours() {
    return cloneAll([...workingHours].sort((a, b) => a.weekday - b.weekday));
}

// SELECT * FROM working_hours WHERE weekday = $1
// null is a normal answer here (closed days exist), so no throw.
export function getWorkingHoursFor(weekday) {
    return clone(workingHours.find(w => w.weekday === weekday) ?? null);
}

// PUT /api/admin/working-hours — replaces the whole week (opensAt/closesAt null = closed)
// A day is either closed (both times null) or open with closesAt strictly after opensAt —
// the schema's CHECK (closes_at > opens_at). 'HH:MM' strings compare correctly as strings,
// since they are zero-padded and the same length.
export function updateWorkingHours(week) {
    // Validate the WHOLE week before touching anything.
    week.forEach(({ weekday, opensAt, closesAt }) => {
        if (!workingHours.some(w => w.weekday === Number(weekday))) {
            throw new ApiError('NOT_FOUND', `Ziua ${weekday} nu există.`, 404);
        }
        const closed = !opensAt && !closesAt;
        if (!closed && (!opensAt || !closesAt || closesAt <= opensAt)) {
            throw new ApiError(
                'INVALID_HOURS',
                'Ora de închidere trebuie să fie după ora de deschidere.',
                422,
            );
        }
    });

    week.forEach(({ weekday, opensAt, closesAt }) => {
        const row = workingHours.find(w => w.weekday === Number(weekday));
        const closed = !opensAt && !closesAt;
        Object.assign(row, {
            opensAt: closed ? null : opensAt,
            closesAt: closed ? null : closesAt,
        });
    });

    saveState();
    return getAllWorkingHours();
}

// client's bookings, newest first
// pageSize 5 so the seed (8 bookings for Diana) actually produces two pages — otherwise the
// pager in account.html-css has nothing to exercise. Pas 2.4 asks for a 60+ row seed to prove it.
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

// GET /api/admin/bookings?date=&status=&employeeId= — the day agenda, in the natural order
// things happen (chronological). dateKey is a LOCAL 'YYYY-MM-DD'.
//
// All three filters are optional and default to the state the dashboard opens in: today, all
// statuses, all employees. The page re-calls this on every `change`
//
// The filters live HERE, not in admin.html-css, because in Partea 2 the server applies them
// (WHERE status = $2 AND employee_id = $3). Filtering in the page would be code you delete in
// Partea 3; filtering here means admin.html-css passes the same arguments to the mock now and to
// api.getAdminBookings(...) later.
//
// An empty string counts as "all", because that is what a <select> whose "Toate" option has
// value="" actually gives you. Without this, choosing "Toate" would filter for status === ''
// and the table would go blank.
export function getBookingsForDay(dateKey = todayKey(), { status = null, employeeId = null } = {}) {
    const byStatus = status !== null && status !== undefined && status !== '';
    const byEmployee = employeeId !== null && employeeId !== undefined && employeeId !== '';

    return cloneAll(bookings
        .filter(b => toDateKey(b.startsAt) === dateKey)
        .filter(b => !byStatus || b.status === status)
        .filter(b => !byEmployee || b.employeeId === Number(employeeId))
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
}

// The bookings that block time, for the slot calculation (RB-02: cancelled doesn't block).
//
// employeeId is REQUIRED now. "Taken" stopped being a property of the salon and became a
// property of one person's calendar: Ana being busy at 10:00 says nothing about Maria. Without
// this filter the grid would hide every slot any colleague happens to have booked.
export function getActiveBookingsForDay(dateKey, employeeId) {
    // A plain Error, not an ApiError: no endpoint maps to this, so a missing employee is a
    // programming mistake, not something a client could cause. It must shout rather than guess —
    // forwarding `undefined` would fall through to "all employees" in getBookingsForDay and the
    // grid would grey out Ana's 13:00 because MARIA is busy then. No error, plausible output,
    // completely wrong.
    if (employeeId === null || employeeId === undefined || employeeId === '') {
        throw new Error('getActiveBookingsForDay: employeeId is required');
    }
    return getBookingsForDay(dateKey, { employeeId })
        .filter(b => ACTIVE_STATUSES.includes(b.status));
}

// GET /api/admin/stats?from=&to= — ONE endpoint, so one function returning one object.
//
// Previously this was two exported functions returning two numbers, which no single endpoint
// could ever produce. The dashboard reads several figures at once, and over the network that is
// one request, so it has to be one shape here too.
//
// Defaults to today, which is the state the dashboard opens in.
//
// revenue counts ONLY completed, so it is realised income and never a forecast: a past range is
// settled, today shows what has actually happened so far, a future range is legitimately 0. It
// sums booking.price — the snapshot taken at booking time, NOT services.price. That is the whole
// point of the snapshot: booking 4 was sold at 60 while the price list now says 70, and last
// month's revenue must still report 60.
//
// bookings counts everything EXCEPT cancelled — a cancelled booking released its time, so it is
// not workload. Note it deliberately does not reuse ACTIVE_STATUSES: that constant answers "does
// this block a slot?", and completed blocks nothing yet still happened.
//
// In Partea 2 this is a handful of aggregate queries, not loops:
//   SELECT SUM(price) ... WHERE status = 'completed' AND starts_at BETWEEN $1 AND $2
//   SELECT status, COUNT(*) ... GROUP BY status
//   SELECT service_name, COUNT(*) ... GROUP BY service_name ORDER BY 2 DESC LIMIT 3
export function getStats(from = todayKey(), to = from) {
    const inRange = bookings.filter(b => {
        const day = toDateKey(b.startsAt);
        return day >= from && day <= to;
    });

    const byStatus = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const b of inRange) byStatus[b.status]++;

    const completed = inRange.filter(b => b.status === 'completed');

    // top 3 services by number of completed bookings
    const counts = new Map();
    for (const b of completed) {
        counts.set(b.serviceName, (counts.get(b.serviceName) ?? 0) + 1);
    }
    const topServices = [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ro'))
        .slice(0, 3);

    return {
        from,
        to,
        revenue: completed.reduce((total, b) => total + b.price, 0),
        bookings: inRange.filter(b => b.status !== 'cancelled').length,
        byStatus,
        topServices,
    };
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
    // Pas 2.3: the server validates whatever the client validated. Checked before the duplicate
    // lookup, so a malformed email is reported as malformed rather than as "already taken".
    const problem = registrationProblem({ fullName, email, password });
    if (problem) throw new ApiError('INVALID_REGISTRATION', problem.message, 422);

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
    saveState();

    // Pas 2.3: register "creează sesiunea" — you are logged in as soon as the account exists.
    // Doing it here rather than in register.html-css keeps the page's flow identical in Partea 3,
    // where the server sets the cookie and the page just redirects.
    setCurrentUserId(user.id);
    return getCurrentUser();   // same shape as login() and /auth/me — never includes password
}

// POST /api/bookings — the one endpoint with real failure modes (Pas 2.5).
// The mock raises them so that the confirm handler in Pas 1.3 has an error branch from the
// start. In Partea 2 the SLOT_TAKEN check becomes the UNIQUE constraint on booking_slots inside
// a transaction — the check here is the friendly message, never the guarantee (RB-04).
export function addBooking({ userId, serviceId, employeeId, startsAt }) {
    const service = getServiceById(serviceId);          // 404 if the id is bogus

    // A withdrawn service must not be bookable. getActiveServices() already keeps it off the
    // catalogue, so this can only be reached by a typed URL, an old bookmark or a stale link —
    // which is exactly why it is checked here too. 404 rather than 422: from a client's point of
    // view a withdrawn service simply is not there. (The admin still reaches it through
    // getServiceById, which deliberately does not filter, because editing needs it.)
    if (!service.isActive) {
        throw new ApiError('NOT_FOUND', 'Serviciul nu mai este disponibil.', 404);
    }

    const user = getUserById(userId);
    // POST /api/bookings is auth `C` — no session, no booking. Without this the next line
    // would read .fullName off null and crash instead of failing the way the API fails.
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Trebuie să fii autentificat.', 401);

    // The employee must exist and still work here. An inactive one is a 404 rather than a 422:
    // from the client's point of view someone who left the salon is simply not there.
    const employee = getEmployeeById(employeeId);
    if (!employee || !employee.isActive) {
        throw new ApiError('NOT_FOUND', 'Angajatul nu există.', 404);
    }

    // ...and must actually perform this service. The picker only offers valid pairs, but the
    // pair arrives from the client, so it is checked again here.
    if (!employeeCanDoService(employeeId, serviceId)) {
        throw new ApiError(
            'EMPLOYEE_CANNOT_PERFORM',
            `${employee.fullName} nu efectuează serviciul „${service.name}”.`,
            422,
        );
    }

    // the start must be a real instant before anything can be measured against it.
    // Without this an unparseable string makes every comparison below false (NaN compares false
    // against everything), all the rule checks pass, and the failure surfaces later as a
    // RangeError from toISOString() instead of a clean 422.
    if (Number.isNaN(new Date(startsAt).getTime())) {
        throw new ApiError('INVALID_DATE', 'Momentul rezervării nu este valid.', 422);
    }

    const startMinutes = minutesOfDay(startsAt);

    // RB-01 — the start must land on the grid. The slot grid only offers :00/:15/:30/:45, so
    // reaching this means the value did not come from the grid.
    if (!isOnSlotBoundary(startMinutes)) {
        throw new ApiError(
            'INVALID_SLOT_START',
            'Rezervările încep din 15 în 15 minute.',
            422,
        );
    }

    // RB-02, second half — the salon must be open, and the service must fit entirely inside the
    // programme. Same predicate the grid uses, so the two can never disagree about closing time.
    const hours = getWorkingHoursFor(weekdayOf(toDateKey(startsAt)));
    if (!hours || !hours.opensAt) {
        throw new ApiError('SALON_CLOSED', 'Salonul este închis în ziua selectată.', 422);
    }
    if (!serviceFitsInDay(startMinutes, service.durationMin, hours)) {
        throw new ApiError(
            'OUTSIDE_WORKING_HOURS',
            `Serviciul nu încape în programul zilei (${hours.opensAt}–${hours.closesAt}).`,
            422,
        );
    }

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

    // RB-02 — overlap, scoped to THIS EMPLOYEE. Half-open intervals [start, end): a booking that
    // ends at 11:00 does not collide with one that starts at 11:00.
    //
    // The employee filter is the whole change: two clients may hold the same hour as long as
    // they are with different people. In Pas 2.5 this becomes UNIQUE(employee_id, slot_starts_at)
    // on booking_slots instead of UNIQUE(slot_starts_at) — same mechanism, composite key.
    const collides = bookings.some(b =>
        b.employeeId === Number(employeeId) &&
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
        employeeId: Number(employeeId),
        // price is a COLUMN, copied once from the price list and frozen. Editing the service
        // later must not change what this booking cost.
        price: service.price,
        // JOIN-derived fields, so a freshly created booking is indistinguishable from one that
        // came back from the API
        serviceName: service.name,
        employeeName: employee.fullName,
        userFullName: user.fullName,
        userEmail: user.email,
        startsAt,
        endsAt,
        status: 'pending',
        createdAt: new Date().toISOString(),
        cancelledAt: null,
    };
    bookings.push(booking);
    saveState();
    return clone(booking);
}

// DELETE /api/bookings/:id — 404 if it does not exist.
// In Pas 2.5 this also deletes the rows from booking_slots, which is what frees the interval.
//
// Returns NOTHING: a DELETE answers 204 No Content, so there is no body to hand back. The page
// re-fetches the list afterwards, which is what it would have to do over the network anyway.
export function cancelBooking(id) {
    const booking = bookings.find(b => b.id === Number(id));
    if (!booking) throw new ApiError('NOT_FOUND', 'Rezervarea nu există.', 404);
    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    saveState();
}

// PATCH /api/admin/bookings/:id/status — 422 on an invalid transition (Pas 2.6).
// admin.html-css asks canTransition() to decide which buttons to render; this asks the same
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
    saveState();
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
// The columns a client may write. Everything else in the payload is ignored, which is what an
// UPDATE does: the server writes SET name = $1, price = $2 ... and the id lives in the WHERE.
// Spreading the caller's object instead let addService({id: 999}) overwrite the generated id and
// updateService(1, {id: 99}) repoint a row — silently, and with duplicate ids as the result.
const SERVICE_FIELDS = ['name', 'description', 'durationMin', 'price', 'isActive'];

function normalizeService(data) {
    const out = {};
    for (const field of SERVICE_FIELDS) {
        if (field in data) out[field] = data[field];
    }
    if ('price' in out) out.price = Number(out.price);
    if ('durationMin' in out) out.durationMin = Number(out.durationMin);

    // Anexa A: duration 15–240 and a multiple of 15, price ≥ 0. Not fussiness — Pas 2.5
    // decomposes every booking into 15-minute rows in booking_slots, and a 50-minute service
    // does not divide into whole slots, so the anti-overlap mechanism would break.
    //
    // In Partea 2 the same restriction exists twice over: the server answers 422 with this
    // message, and the CHECK constraint refuses the row whatever the server believes. Here the
    // mock plays both parts, because there is no database yet.
    const problem = serviceFieldsProblem(out);
    if (problem) throw new ApiError('INVALID_SERVICE', problem, 422);

    return out;
}

// POST /api/services
export function addService(data) {
    const fields = normalizeService(data);

    // Creating requires the NOT NULL columns. serviceFieldsProblem cannot demand them, because
    // it also validates partial updates where "absent" means "leave it alone" — so the
    // requirement belongs here, where the row is being built from nothing.
    for (const required of ['name', 'durationMin', 'price']) {
        if (fields[required] === undefined || fields[required] === '') {
            throw new ApiError('INVALID_SERVICE', `Câmpul „${required}” este obligatoriu.`, 422);
        }
    }

    const service = {
        ...fields,
        id: nextId(services),                       // generated here — never taken from the caller
        isActive: fields.isActive ?? true,
        createdAt: new Date().toISOString(),
    };
    services.push(service);
    saveState();
    return clone(service);
}

// PUT /api/services/:id — 404 if it does not exist
export function updateService(id, data) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    Object.assign(service, normalizeService(data));
    saveState();
    return clone(service);
}

// DELETE /api/services/:id — soft delete. 204 No Content, so nothing comes back.
// Reactivating is not a DELETE: it is updateService(id, { isActive: true }), a PUT.
export function deactivateService(id) {
    const service = services.find(s => s.id === Number(id));
    if (!service) throw new ApiError('NOT_FOUND', 'Serviciul nu există.', 404);
    service.isActive = false;
    saveState();
}