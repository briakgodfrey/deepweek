// Deepweek service worker: caches the app shell so it works fully offline.
//
// RELEASING AN UPDATE: bump CACHE_VERSION whenever any app file changes, and
// set the ?v= on the CSS/JS links in index.html to the same value.
// Browsers only fetch new files when this file's contents change. Users then
// see an "update available" prompt and get the new version on reload.
const CACHE_VERSION = 'v5';
// The app was called Weekflow before v3, so old caches use that prefix
const CACHE_PREFIXES = ['deepweek-', 'weekflow-'];
const CACHE_NAME = `deepweek-${CACHE_VERSION}`;

// Every file the app needs to run offline (paths relative to this file).
// If a file is missing, installation fails and the previous version stays active.
const APP_SHELL = [
    './',
    'index.html',
    'manifest.webmanifest',
    'css/styles.css',
    'css/fonts.css',
    'js/planner.js',
    'js/timer.js',
    'js/pwa.js',
    'vendor/sortablejs/Sortable.min.js',
    'assets/fonts/manrope-latin-wght-normal.woff2',
    'assets/fonts/manrope-latin-ext-wght-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-300-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-400-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-500-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-600-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-ext-300-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-ext-400-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-ext-500-normal.woff2',
    'assets/fonts/ibm-plex-mono-latin-ext-600-normal.woff2',
    'assets/icons/icon.svg',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/icons/icon-maskable-512.png',
    'assets/icons/apple-touch-icon.png',
    'assets/icons/favicon-32.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            // Bypass the HTTP cache so a new release never caches stale files
            cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })))
        )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// The page asks the waiting worker to take over when the user accepts an update
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Any page navigation inside the app is served by index.html
        if (request.mode === 'navigate') {
            const shell = await cache.match('index.html');
            return shell || fetch(request);
        }

        const cached = await cache.match(request, { ignoreSearch: true });
        return cached || fetch(request);
    })());
});
