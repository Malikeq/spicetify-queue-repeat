(function () {
    "use strict";

    const EXT_NAME = "QueueRepeat";
    const INIT_DELAY = 3500;

    let isActive = false;
    let isPolling = false; // Guard untuk mencegah polling bertumpuk
    let repeatList = [];
    let previousTrackUri = null;
    let queueWatcherInterval = null;
    let buttonElement = null;

    function log(msg, level = "log") {
        console[level](`[${EXT_NAME}] ${msg}`);
    }

    function waitForSpicetify() {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (
                    Spicetify?.Platform?.PlayerAPI?.getQueue &&
                    Spicetify?.Platform?.PlayerAPI?.addToQueue &&
                    Spicetify?.Player?.addEventListener &&
                    Spicetify?.Player?.data !== undefined
                ) {
                    clearInterval(interval);
                    resolve();
                }
            }, 300);
        });
    }

    function getCurrentTrackUri() {
        const d = Spicetify.Player.data;
        return d?.item?.uri ?? d?.track?.uri ?? null;
    }

    async function getAllQueueTracks() {
        try {
            const q = await Spicetify.Platform.PlayerAPI.getQueue();
            const queued = q?.queued ?? [];
            const nextTracks = q?.nextTracks ?? [];

            const extractUri = (item) =>
                item?.contextTrack?.uri ??
                item?.track?.uri ??
                item?.uri ??
                null;

            const queuedUris = queued.map(extractUri).filter(Boolean);
            const nextTrackUris = nextTracks.map(extractUri).filter(Boolean);

            const seen = new Set();
            const result = [];
            for (const uri of [...queuedUris, ...nextTrackUris]) {
                if (!seen.has(uri)) {
                    seen.add(uri);
                    result.push(uri);
                }
            }
            return result;
        } catch (err) {
            log(`Failed to get queue: ${err}`, "warn");
            return [];
        }
    }

    async function enableQueueRepeat() {
        const currentUri = getCurrentTrackUri();
        const queueTracks = await getAllQueueTracks();

        const seen = new Set();
        repeatList = [];

        if (currentUri) {
            seen.add(currentUri);
            repeatList.push(currentUri);
        }

        for (const uri of queueTracks) {
            if (!seen.has(uri)) {
                seen.add(uri);
                repeatList.push(uri);
            }
        }

        previousTrackUri = currentUri;
        isActive = true;

        updateButtonVisual(true);
        log(`Queue Repeat on. ${repeatList.length} track(s) in repeat list.`);
        
        // Fix: Menggunakan perulangan for standar sesuai saran linter
        for (let i = 0; i < repeatList.length; i++) {
            log(`  [${i + 1}] ${repeatList[i]}`);
        }

        startQueueWatcher();

        Spicetify.showNotification(
            `Queue Repeat on (${repeatList.length} tracks)`,
            false,
            2200
        );
    }

    function disableQueueRepeat() {
        isActive = false;
        repeatList = [];
        previousTrackUri = null;

        stopQueueWatcher();
        updateButtonVisual(false);

        log("Queue Repeat off.");
        Spicetify.showNotification("Queue Repeat off", false, 1800);
    }

    async function pollForNewQueueTracks() {
        if (!isActive || isPolling) return;
        isPolling = true;

        try {
            const currentQueueUris = await getAllQueueTracks();
            const repeatSet = new Set(repeatList);
            const newUris = currentQueueUris.filter(uri => !repeatSet.has(uri));

            if (newUris.length > 0) {
                repeatList.push(...newUris);
                log(`${newUris.length} new track(s) added to repeat list.`);
                
                for (const uri of newUris) {
                    log(`  + ${uri}`);
                }

                Spicetify.showNotification(
                    `Queue Repeat: ${newUris.length} new track(s) added`,
                    false,
                    1800
                );
            }
        } catch (err) {
            log(`Queue watcher error: ${err}`, "warn");
        } finally {
            isPolling = false;
        }
    }

    function startQueueWatcher() {
        stopQueueWatcher();
        queueWatcherInterval = setInterval(pollForNewQueueTracks, 2000);
    }

    function stopQueueWatcher() {
        if (queueWatcherInterval !== null) {
            clearInterval(queueWatcherInterval);
            queueWatcherInterval = null;
        }
    }

    async function toggleQueueRepeat() {
        if (isActive) {
            disableQueueRepeat();
        } else {
            await enableQueueRepeat();
        }
    }

    async function onSongChange() {
        if (!isActive) return;

        const newUri = getCurrentTrackUri();

        if (previousTrackUri && repeatList.includes(previousTrackUri)) {
            try {
                await Spicetify.Platform.PlayerAPI.addToQueue([{ uri: previousTrackUri }]);
                log(`Re-queued: ${previousTrackUri}`);
            } catch (err) {
                log(`Failed to re-queue: ${err}`, "error");
            }
        }

        previousTrackUri = newUri;
    }

    function injectStyles() {
        if (document.getElementById("qr-styles")) return;

        const s = document.createElement("style");
        s.id = "qr-styles";
        s.textContent = `
            .qr-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                padding: 0;
                margin: 0 4px;
                border: none;
                border-radius: 50%;
                background: transparent;
                cursor: pointer;
                color: var(--spice-subtext, #b3b3b3);
                opacity: 0.7;
                transition: color 0.2s, opacity 0.2s, transform 0.15s;
                position: relative;
                vertical-align: middle;
                flex-shrink: 0;
            }
            .qr-btn:hover {
                color: var(--spice-text, #fff);
                opacity: 1;
                transform: scale(1.12);
            }
            .qr-btn:active {
                transform: scale(0.93);
            }
            .qr-btn.qr-active {
                color: var(--spice-button-active, #1db954) !important;
                opacity: 1 !important;
            }
            .qr-btn.qr-active::after {
                content: '';
                position: absolute;
                bottom: 2px;
                left: 50%;
                transform: translateX(-50%);
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: var(--spice-button-active, #1db954);
            }
        `;
        document.head.appendChild(s);
    }

    const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h.75v1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5Z"/><path d="M12.25 2.5h-.75V1h.75A3.75 3.75 0 0 1 16 4.75v5A3.75 3.75 0 0 1 12.25 13.5H11V12h1.25A2.25 2.25 0 0 0 14.5 9.75v-5A2.25 2.25 0 0 0 12.25 2.5Z"/><path d="M8 3.5a.75.75 0 0 1 .75.75v3.19l1.72-1.72a.75.75 0 1 1 1.06 1.06L8.53 9.78a.75.75 0 0 1-1.06 0L4.47 6.78a.75.75 0 0 1 1.06-1.06L7.25 7.44V4.25A.75.75 0 0 1 8 3.5Z"/></svg>`;

    function updateButtonVisual(active) {
        if (!buttonElement) return;
        buttonElement.classList.toggle("qr-active", active);
        buttonElement.title = active ? "Queue Repeat: on (click to disable)" : "Queue Repeat: off (click to enable)";
    }

    function injectButton() {
        if (document.body.contains(buttonElement)) return true;

        const lyricsBtn = document.querySelector("[data-testid='lyrics-button']") || 
                          document.querySelector(".main-lyricsButton-button") ||
                          document.querySelector("[aria-label='Lyrics']");

        if (lyricsBtn) {
            const btn = document.createElement("button");
            btn.className = "qr-btn";
            btn.innerHTML = ICON_SVG;
            btn.title = "Queue Repeat: off (click to enable)";
            btn.onclick = toggleQueueRepeat;
            
            lyricsBtn.parentNode.insertBefore(btn, lyricsBtn);
            buttonElement = btn;
            return true;
        }
        return false;
    }

    function setupButton() {
        if (injectButton()) {
            watchButtonRemoval();
        } else {
            const interval = setInterval(() => {
                if (injectButton()) {
                    clearInterval(interval);
                    watchButtonRemoval();
                }
            }, 1000);
        }
    }

    function watchButtonRemoval() {
        const observer = new MutationObserver(() => {
            if (buttonElement && !document.contains(buttonElement)) {
                buttonElement = null;
                injectButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    async function init() {
        await waitForSpicetify();
        injectStyles();
        setupButton();
        Spicetify.Player.addEventListener("songchange", onSongChange);
    }

    setTimeout(init, INIT_DELAY);
})();
