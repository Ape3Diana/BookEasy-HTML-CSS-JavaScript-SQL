// Pasul 2.1, second half — the same server, in Express.
//
// Identical behaviour to server/server.js: serves public/, answers GET /api/health, returns a
// JSON 404 for unknown /api/ routes. Kept side by side deliberately — the comparison is the
// point of the step, not the result.
//
// Run with:  npm run start:express

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT ?? 3000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, '..', 'public');

const app = express();

// ── What this one line replaces ──────────────────────────────────────────────
//
// In server.js this was ~40 lines: mapping the URL to a path on disk, reading the file,
// looking up the Content-Type by extension, 404 on ENOENT, 500 on anything else, and the
// path-traversal guard that stops /../../.env being served.
//
// express.static does all of it, plus things the hand-written one does NOT: ETag and
// Last-Modified headers so the browser can cache and revalidate, Range requests, and
// conditional 304 responses.
//
// Knowing that list is the difference between choosing the middleware and cargo-culting it.
app.use(express.static(PUBLIC_DIR));


// ── Routes ───────────────────────────────────────────────────────────────────
//
// app.get() matches method AND path in one call. In server.js that was an if on pathname
// followed by an if on req.method, with a hand-written 405 and its Allow header. Express
// answers unmatched methods itself.
app.get('/api/health', (req, res) => {
    // res.json() stringifies, sets Content-Type and sets Content-Length. Three lines become one.
    res.json({ status: 'ok' });
});


// ── Unknown /api/ routes ─────────────────────────────────────────────────────
//
// Reached only when nothing above matched. It must stay AFTER the routes: Express tries
// handlers in the order they were registered, so a catch-all declared early would swallow
// everything below it. That ordering IS the routing model — there is no table being consulted.
app.use('/api', (req, res) => {
    res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ruta nu există.' },
    });
});


// ── The error middleware ─────────────────────────────────────────────────────
//
// Four parameters, and that is not decoration: Express inspects the function's arity to tell an
// error handler from an ordinary one. Drop `next` and it silently becomes a normal middleware
// that never runs.
//
// This is the shape Pas 2.4 asks for — "un middleware de erori care îl aplică peste tot" — so
// that every failure leaves through one door in one format, rather than each route inventing
// its own.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        error: { code: 'INTERNAL', message: 'A apărut o eroare pe server.' },
    });
});


app.listen(PORT, () => {
    console.log(`BookEasy (express) → http://localhost:${PORT}`);
    console.log(`  static  ${PUBLIC_DIR}`);
    console.log(`  health  http://localhost:${PORT}/api/health`);
});
