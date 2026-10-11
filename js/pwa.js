// Progressive Web App support: offline caching, updates, and installation.

// Service workers need http(s); opening index.html as a file still works, just not offline-installable
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    let reloadOnControllerChange = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadOnControllerChange) {
            reloadOnControllerChange = false;
            window.location.reload();
        }
    });

    function showUpdatePrompt(worker) {
        if (document.getElementById('updateToast')) return;

        const toast = document.createElement('div');
        toast.id = 'updateToast';
        toast.className = 'toast update-toast';
        toast.innerHTML = `
            <span class="toast-icon">↻</span>
            <span class="toast-message">A new version of Deepweek is available.</span>
            <button class="update-btn">Reload</button>
        `;
        toast.querySelector('.update-btn').addEventListener('click', () => {
            reloadOnControllerChange = true;
            worker.postMessage('SKIP_WAITING');
        });
        document.getElementById('toastContainer').appendChild(toast);
    }

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');

            // An update was downloaded during an earlier visit
            if (registration.waiting && navigator.serviceWorker.controller) {
                showUpdatePrompt(registration.waiting);
            }

            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    // Only prompt for updates, not the very first install
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdatePrompt(worker);
                    }
                });
            });
        } catch (error) {
            console.error('Service worker registration failed:', error);
        }
    });
}

// Install button (Chrome, Edge, and Android; Safari uses Share → Add to Home Screen)
let deferredInstallPrompt = null;

function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.hidden = false;
});

async function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').hidden = true;
}

// Ask the browser not to evict planner data under storage pressure
function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted()
            .then(persisted => persisted || navigator.storage.persist())
            .catch(() => {});
    }
}

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.hidden = true;
    requestPersistentStorage();
    if (typeof showToast === 'function') {
        showToast('Deepweek installed', 'success');
    }
});

window.addEventListener('load', () => {
    if (isRunningStandalone()) {
        requestPersistentStorage();
    }
});
