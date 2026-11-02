import { useEffect, useState, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isCapacitorNative, setIsCapacitorNative] = useState(false);
  const [swNeedRefresh, setSwNeedRefresh] = useState(false);
  const [swOfflineReady, setSwOfflineReady] = useState(false);
  const updateSwFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    const isNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    setIsCapacitorNative(isNative);

    const isStandalone =
      isNative ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Register Service Worker safely in browser environments (skip inside native Capacitor APK where assets are bundled locally)
    if (!isNative && 'serviceWorker' in navigator) {
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
              setSwNeedRefresh(true);
            },
            onOfflineReady() {
              setSwOfflineReady(true);
            }
          });
          updateSwFnRef.current = updateSW;
        })
        .catch(() => {
          // Service worker registration skipped in non-PWA dev mode
        });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const applyServiceWorkerUpdate = useCallback(async () => {
    if (updateSwFnRef.current) {
      await updateSwFnRef.current(true);
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
    setSwNeedRefresh(false);
  }, []);

  const dismissServiceWorkerUpdate = useCallback(() => {
    setSwNeedRefresh(false);
  }, []);

  const dismissOfflineReadyNotice = useCallback(() => {
    setSwOfflineReady(false);
  }, []);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isCapacitorNative,
    swNeedRefresh,
    swOfflineReady,
    install,
    applyServiceWorkerUpdate,
    dismissServiceWorkerUpdate,
    dismissOfflineReadyNotice
  };
}

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return browserOnline;
}
