import { useEffect, useState } from 'react';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac

const DISMISS_KEY = 'installHintDismissed';
const getDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};
const setDismissed = () => {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
};

const CHECK_EVERY_MS = 10 * 60 * 1000; // look for a newer deploy while the app stays open

/**
 * Launching or refreshing always loads the latest version (the service worker fetches the page
 * network-first), so no button is needed then. Only when a new version is deployed WHILE the app
 * is open do we show an "Update" button.
 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && build !== __BUILD_ID__) setAvailable(true);
      } catch { /* offline: try again later */ }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
      check();
    };

    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(check, CHECK_EVERY_MS);
    check(); // also right after launch, in case the page came from the offline copy
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of Splitbox is available.</span>
      <button className="btn small-btn primary" onClick={() => location.reload()}>Update</button>
      <button className="icon-btn" aria-label="Later" onClick={() => setAvailable(false)}>✕</button>
    </div>
  );
}

/** "Install app" card for the home page: native prompt on Android/desktop Chrome, instructions on iOS. */
export function InstallCard() {
  const [deferred, setDeferred] = useState(null);
  const [hidden, setHidden] = useState(() => isStandalone() || getDismissed());
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const ios = isIos();
  if (hidden || (!deferred && !ios)) return null;

  async function install() {
    if (ios) return setShowIosSteps(true);
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setHidden(true);
  }

  function dismiss() {
    setDismissed();
    setHidden(true);
  }

  return (
    <div className="card install-card">
      <img src="/icons/icon-192.png" alt="" width="44" height="44" />
      <div className="grow">
        <div className="strong">Install Splitbox</div>
        {showIosSteps ? (
          <div className="small">
            Tap <strong>Share</strong>{' '}
            <svg className="ios-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{' '}
            in Safari, then <strong>Add to Home Screen</strong>.
          </div>
        ) : (
          <div className="muted small">Open it from your home screen like an app. Works offline.</div>
        )}
      </div>
      {!showIosSteps && <button className="btn small-btn primary" onClick={install}>Install</button>}
      <button className="icon-btn" aria-label="Dismiss" onClick={dismiss}>✕</button>
    </div>
  );
}
