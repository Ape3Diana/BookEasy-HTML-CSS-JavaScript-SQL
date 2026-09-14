// Pasul 2.1 — the minimum server, using only Node's built-in http module.
//
// No Express, no dependencies, nothing installed. The point is to do by hand everything a
// framework would hide, so that when Express replaces this file you know exactly what it took
// off your hands rather than treating it as an incantation.
//
// Two jobs:
//   1. serve the Partea 1 files out of public/
//   2. answer GET /api/health with {"status":"ok"}
//
// Run it with:  npm start      then open http://localhost:3000

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT ?? 3000;

// ES modules have no __dirname, so it is derived from this file's URL. Everything is resolved
// against it rather than against the working directory — otherwise the server would only work
// when started from the project root.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, '..', 'public');

// The browser decides what to DO with a response from its Content-Type, not from the file
// extension. Serve a module as text/plain and the browser refuses to execute it — the script
// downloads fine and simply never runs, which looks exactly like a blank page with no error.
const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.ico':  'image/x-icon',
};

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

function sendText(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
}


// ── Static files ─────────────────────────────────────────────────────────────

async function serveStatic(req, res, urlPath) {
    // "/" means index.html. Without this the root would 404 and the site would have no entrance.
    const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));

    // PATH TRAVERSAL. A request for /../../etc/passwd, or an encoded %2e%2e%2f, would otherwise
    // walk out of public/ and serve anything on the disk — including .git and the .env file that
    // will hold the database password in Partea 2.
    //
    // Resolving first and then checking the prefix is what makes it safe: string-matching ".."
    // before resolving is the version that keeps getting bypassed.
    const filePath = path.resolve(PUBLIC_DIR, relative);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
        return sendText(res, 403, 'Forbidden');
    }

    try {
        const file = await fs.readFile(filePath);
        const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()]
            ?? 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': file.length,
        });
        res.end(file);

    } catch (err) {
        // ENOENT = no such file, EISDIR = it is a directory. Both mean "nothing to serve here";
        // anything else is a genuine server fault and should not be reported as a 404.
        if (err.code === 'ENOENT' || err.code === 'EISDIR') {
            return sendText(res, 404, 'Not found');
        }
        console.error('static:', err);
        return sendText(res, 500, 'Internal server error');
    }
}


// ── The server ───────────────────────────────────────────────────────────────
//
// One function, called once per request. `req` is a readable stream carrying the method, the URL
// and the headers; `res` is a writable one. Nothing is routed for you: matching the path and the
// method is your job, and doing it by hand here is the whole point of the exercise.

const server = http.createServer(async (req, res) => {
    // req.url is a raw string — "/api/health?x=1" — not a parsed object. The second argument is
    // a base, required because req.url is relative; the host is never actually contacted.
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    // ── API routes ──
    if (pathname === '/api/health') {
        // Method matters. A GET-only endpoint answering POST would be lying about what it is.
        // 405 Method Not Allowed, with Allow listing what IS accepted, is the correct refusal.
        if (req.method !== 'GET') {
            res.writeHead(405, { Allow: 'GET' });
            return res.end();
        }
        return sendJson(res, 200, { status: 'ok' });
    }

    // Anything else under /api/ is a route that does not exist. Answering with the JSON error
    // shape rather than an HTML 404 matters: a client that parses every /api/ response as JSON
    // would otherwise choke on "<!DOCTYPE html>".
    if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, {
            error: { code: 'NOT_FOUND', message: 'Ruta nu există.' },
        });
    }

    // ── Everything else is a file ──
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end();
    }

    return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log(`BookEasy → http://localhost:${PORT}`);
    console.log(`  static  ${PUBLIC_DIR}`);
    console.log(`  health  http://localhost:${PORT}/api/health`);
});
