//time helpers -> relative date to current one = test anytime and still have valid data

function datAt(offsetDays, hhmm){
    const d = new date();
    d.setDate(d.getDate() + offsetDays);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h,m);
    return d.toISOString;
}

function plusMinutes(iso, minutes){
    return new Date(new Date(iso).getTime() + minutes*60000).toISOString();
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

//
const bookings = [
    {
        id: 1, userId: 2, serviceId: 1, serviceName: 'Tuns damă',
        startsAt: dayAt(1, '10:00'), endsAt: dayAt(1, '11:00'),
        status: 'confirmed',
        createdAt: dayAt(-3, '12:00'), cancelledAt: null,
    },
    {
        id: 2, userId: 3, serviceId: 2, serviceName: 'Tuns bărbați',
        startsAt: dayAt(1, '11:30'), endsAt: dayAt(1, '12:00'),
        status: 'pending',
        createdAt: dayAt(-1, '09:20'), cancelledAt: null,
    },
    {
        id: 3, userId: 2, serviceId: 3, serviceName: 'Manichiură',
        startsAt: dayAt(2, '15:00'), endsAt: dayAt(2, '15:45'),
        status: 'pending',
        createdAt: dayAt(-1, '18:05'), cancelledAt: null,
    },
    {
        // past + completed → not in "future", valid for statistics
        id: 4, userId: 2, serviceId: 2, serviceName: 'Tuns bărbați',
        startsAt: dayAt(-5, '10:00'), endsAt: dayAt(-5, '10:30'),
        status: 'completed',
        createdAt: dayAt(-9, '11:00'), cancelledAt: null,
    },
    {
        // cancelled → MUST NOT block slots (RB-02)
        id: 5, userId: 2, serviceId: 4, serviceName: 'Vopsit + tuns',
        startsAt: dayAt(-2, '13:00'), endsAt: dayAt(-2, '15:00'),
        status: 'cancelled',
        createdAt: dayAt(-8, '10:00'), cancelledAt: dayAt(-6, '10:00'),
    },
    {
        // under 24h → "Cancel" button MUST NOT appear (RB-05)
        id: 6, userId: 2, serviceId: 2, serviceName: 'Tuns bărbați',
        startsAt: dayAt(0, '17:00'), endsAt: dayAt(0, '17:30'),
        status: 'confirmed',
        createdAt: dayAt(-4, '10:00'), cancelledAt: null,
    },
    {
        // block 4 consecutive slots tomorrow, 13:00–14:00 (long rezervation)
        id: 7, userId: 3, serviceId: 4, serviceName: 'Vopsit + tuns',
        startsAt: dayAt(1, '13:00'), endsAt: dayAt(1, '15:00'),
        status: 'confirmed',
        createdAt: dayAt(-2, '16:40'), cancelledAt: null,
    },
];



//simulated session (will be replaced in part 3)
export let currentUserId;

export function setCurrentUSerId(id) {
    currentUserId = id;
}

export function getCurrentUSerId() {
    return users.find(u => u.id === currentUserId) ?? null;
}


// simulated queries
// IMPORTANT: Simulate a DB. Don't work directly with the arrays, use intermediate functions
// that have access to them => useful for part 3

const ACTIVE_STATUSES = ['pending', 'confirmed'];

// SELECT * FROM services WHERE is_active = true
export function getActiveServices() {
    return services.filter(s => s.isActive);
}

// SELECT * FROM services WHERE id = $1
export function getServiceById(id) {
    return services.find(s => s.id === Number(id)) ?? null;
}

export function getUserById(id) {
    return users.find(u => u.id === Number(id)) ?? null;
}

export function getUserByEmail(email) {
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

// SELECT * FROM working_hours WHERE weekday = $1
export function getWorkingHoursFor(weekday) {
    return workingHours.find(w => w.weekday === weekday) ?? null;
}

// client's bookings, newest first
export function getBookingsForUser(userId) {
    return bookings
        .filter(b => b.userId === Number(userId))
        .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
}

// day agenda (admin), cronological, isoDate = 'YYYY-MM-DD'
export function getBookingsForDay(isoDate) {
    return bookings
        .filter(b => b.startsAt.slice(0, 10) === isoDate)
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

// just active rezervations (RB-02: cancelled doesn't block)
export function getActiveBookingsForDay(isoDate) {
    return getBookingsForDay(isoDate).filter(b => ACTIVE_STATUSES.includes(b.status));
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

// INSERT INTO bookings (...)
export function addBooking({ userId, serviceId, startsAt }) {
    const service = getServiceById(serviceId);
    const booking = {
        id: nextId(bookings),
        userId: Number(userId),
        serviceId: Number(serviceId),
        serviceName: service.name,
        startsAt,
        endsAt: plusMinutes(startsAt, service.durationMin),
        status: 'pending',
        createdAt: new Date().toISOString(),
        cancelledAt: null,
    };
    bookings.push(booking);
    return booking;
}

// UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1
export function cancelBooking(id) {
    const booking = bookings.find(b => b.id === Number(id));
    if (!booking) return null;
    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    return booking;
}

// UPDATE bookings SET status = $2 WHERE id = $1
export function setBookingStatus(id, status) {
    const booking = bookings.find(b => b.id === Number(id));
    if (!booking) return null;
    booking.status = status;
    if (status === 'cancelled') booking.cancelledAt = new Date().toISOString();
    return booking;
}

export function addService(data) {
    const service = { id: nextId(services), isActive: true, createdAt: new Date().toISOString(), ...data };
    services.push(service);
    return service;
}

export function updateService(id, data) {
    const service = getServiceById(id);
    if (!service) return null;
    Object.assign(service, data);
    return service;
}

// DELETE = soft delete
export function deactivateService(id) {
    const service = getServiceById(id);
    if (!service) return null;
    service.isActive = false;
    return service;
}