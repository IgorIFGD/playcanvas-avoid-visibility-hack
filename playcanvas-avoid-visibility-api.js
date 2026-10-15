/**
 * A snippet that forces the Playcanvas app to keep running even if the tab/page focus is lost.
 * In other words, it just disables 'pause' feature. Also fixes the issue with timers being throttled in background tabs.
 * Updated to work with engine v2.x (the engine relies on requestAnimationFrame, which browsers stop when the tab is hidden).
 * WARNING: This snippet modifies the document prototype, so it may break other scripts that rely on the document.hidden or visibility API properties.
 * @author Igor Parada
 * @license MIT
 * @version 2.0.0
 */
(function () {

    const MANUAL_TICK_FPS = 60;

    // Real page visibility, read straight from the prototype (before we shadow it below).
    const isPageHidden = () => Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get.call(document);

    /**
     *  Dark magic here: make the page look permanently visible and focused to everyone else.
     */
    const hidePageStateFromGame = () => {
        const define = (target, prop, descriptor) => {
            try {
                Object.defineProperty(target, prop, Object.assign({ configurable: true }, descriptor));
            } catch (e) {
                console.warn('do-not-pause hack: could not override ' + prop, e);
            }
        };
        define(document, 'hidden', { get: () => false });
        define(document, 'visibilityState', { get: () => 'visible' });
        define(document, 'webkitHidden', { get: () => false });
        define(document, 'webkitVisibilityState', { get: () => 'visible' });
        define(document, 'hasFocus', { value: () => true, writable: true });
        define(window, 'onblur', { get: () => null, set: () => {} });
        define(window, 'onfocus', { get: () => null, set: () => {} });
    };
    hidePageStateFromGame();

    const findApplication = () => {
        if (typeof pc === 'undefined') return null;
        const ApplicationClass = pc.AppBase || pc.Application;
        if (!ApplicationClass) return null;
        return ApplicationClass.getApplication() || pc.app || null;
    };

    const _hookApplicationStart = setInterval(() => {
        const app = findApplication();
        // wait until the app has created its graphics device (i.e. is able to tick)
        if (app && app.graphicsDevice) {
            clearInterval(_hookApplicationStart);
            injectHack(app);
        }
    }, 100);

    const injectHack = (app) => {
        console.log('Injecting do-not-pause hack...');

        const ApplicationClass = pc.AppBase || pc.Application;
        const initialPlatformWasBrowser = pc.platform.browser;

        let _timerWorker = null;
        let _timerWorkerUrl = null;
        let _fallbackInterval = null;
        let _manualRenderActive = false;

        // Timers on the main thread are throttled heavily in background tabs (1/sec, then 1/min), while timers inside a dedicated Worker are not. So drive the ticks from a Worker when possible.
        const startTimer = (callback, ms) => {
            try {
                const src = `setInterval(() => postMessage(0), ${ms});`;
                _timerWorkerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
                _timerWorker = new Worker(_timerWorkerUrl);
                _timerWorker.onmessage = callback;
            } catch (e) {
                // throws an error when blocked by CSP etc.
                _timerWorker = null;
                _fallbackInterval = setInterval(callback, ms);
            }
        };

        const stopTimer = () => {
            if (_timerWorker) {
                _timerWorker.terminate();
                _timerWorker = null;
            }
            if (_timerWorkerUrl) {
                URL.revokeObjectURL(_timerWorkerUrl);
                _timerWorkerUrl = null;
            }
            if (_fallbackInterval) {
                clearInterval(_fallbackInterval);
                _fallbackInterval = null;
            }
        };

        const setupManualRenderLoop = () => {
            if (_manualRenderActive) return;
            _manualRenderActive = true;
            console.log('Page hidden: pause prevented, running manual update loop');
            // With platform.browser = false the engine's tick() stops scheduling requestAnimationFrame, so we are the only ones driving it
            pc.platform.browser = false;
            app.autoRender = false;
            startTimer(() => app.tick(), 1000 / MANUAL_TICK_FPS);
        };

        const disableManualRenderLoop = () => {
            if (!_manualRenderActive) return;
            _manualRenderActive = false;
            console.log('Page visible: resumed normal render loop');
            stopTimer();
            pc.platform.browser = initialPlatformWasBrowser;
            app.autoRender = true;
            // tick() cancels any pending frame request and schedules the next requestAnimationFrame
            app.tick();
        };

        const _visibilityChangeHandler = () => {
            if (isPageHidden()) {
                setupManualRenderLoop();
            } else {
                disableManualRenderLoop();
            }
        };

        document.addEventListener('visibilitychange', _visibilityChangeHandler, false);

        app.once('destroy', () => {
            document.removeEventListener('visibilitychange', _visibilityChangeHandler, false);
            stopTimer();
            _manualRenderActive = false;
            pc.platform.browser = initialPlatformWasBrowser;
        });

        /**
         * Patch the engine: the engine's own (already bound) visibility handler calls this.isHidden()
         * to decide whether to suspend the sound manager, so reporting 'not hidden' keeps audio alive.
         */
        ApplicationClass.prototype.isHidden = () => false;

        // in case the page is already hidden at the moment of injection
        if (isPageHidden()) {
            setupManualRenderLoop();
        }
    };

}());
