/** 
 * A snippet that forces the Playcanvas app to be rendered even if the tab/page focus is lost.
 * In other words, it just disables 'pause' feature. 
 * @author Igor Parada
 */
(function () {

    const detectApplication = () => {
        if (typeof pc !== 'undefined') {
            const ApplicationClass = pc.AppBase || pc.Application;
            if (ApplicationClass && ApplicationClass.getApplication()) {
                injectHack();
            }
        }
    };
    const _hookApplicationStart = setInterval(detectApplication, 100);

    const injectHack = () => {
        clearInterval(_hookApplicationStart);

        console.log('Injecting do-not-pause hack...')

        const ApplicationClass = pc.AppBase || pc.Application;
        const app = ApplicationClass.getApplication();
        const initialPlatformWasBrowser = pc.platform.browser;

        const MANUAL_RENDER_FPS = 60;

        let _hiddenAttr = 'hidden';
        let _manualRenderInterval = undefined;

        const setupManualRenderLoop = () => {
            if (_manualRenderInterval) {
                console.warn('manual render is already active!');
                return;
            }
            const averageFPS = app.stats && app.stats.frame && app.stats.frame.fps || MANUAL_RENDER_FPS;
            _manualRenderInterval = setInterval(() => app.tick(), 1000 / Math.max(averageFPS, MANUAL_RENDER_FPS));
        }

        const disableManualRenderLoop = () => {
            if (_manualRenderInterval) {
                clearInterval(_manualRenderInterval);
            }
            _manualRenderInterval = undefined;
        }

        const _visibilityChangeHandler = () => {
            const documentHidden = document[_hiddenAttr];
            // console.log('Visiblity change, hidden: ' + documentHidden);
            if (documentHidden) {
                pc.platform.browser = false;
                app.autoRender = false;
                setupManualRenderLoop();
            } else {
                if (_manualRenderInterval) {
                    pc.platform.browser = initialPlatformWasBrowser;
                    app.autoRender = true;
                    app.tick();
                }
                disableManualRenderLoop();
            }
        };


        const addVisibilityChangeListeners = () => {
            // Depending on browser add the correct visibilitychange event and store the name of the
            // hidden attribute in this._hiddenAttr.
            if (typeof document !== 'undefined') {
                if (document.hidden !== undefined) {
                    _hiddenAttr = 'hidden';
                    document.addEventListener('visibilitychange', _visibilityChangeHandler, false);
                } else if (document.mozHidden !== undefined) {
                    _hiddenAttr = 'mozHidden';
                    document.addEventListener('mozvisibilitychange', _visibilityChangeHandler, false);
                } else if (document.msHidden !== undefined) {
                    _hiddenAttr = 'msHidden';
                    document.addEventListener('msvisibilitychange', _visibilityChangeHandler, false);
                } else if (document.webkitHidden !== undefined) {
                    console.warn('webkitHidden');

                    _hiddenAttr = 'webkitHidden';
                    document.addEventListener('webkitvisibilitychange', _visibilityChangeHandler, false);
                }
            }
        }

        const removeVisibilityChangeListeners = () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', _visibilityChangeHandler, false);
                document.removeEventListener('mozvisibilitychange', _visibilityChangeHandler, false);
                document.removeEventListener('msvisibilitychange', _visibilityChangeHandler, false);
                document.removeEventListener('webkitvisibilitychange', _visibilityChangeHandler, false);
            }
        }

        app.on('destroy', () => {
            removeVisibilityChangeListeners();
        });

        /** path the playcanvas engine */
        ApplicationClass.prototype.isHidden = () => false;
        ApplicationClass.prototype.onVisibilityChange = () => {
            //just a stub to prevent pausing the sound subsystem
        };


        /** entry point */
        addVisibilityChangeListeners();

    }

}());
