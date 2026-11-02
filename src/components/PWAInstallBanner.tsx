import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Smartphone,
  Wifi,
  WifiOff,
  X,
  ShieldCheck,
  Copy,
  Check,
  Archive,
  RefreshCw,
  FileJson
} from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

interface PWAInstallBannerProps {
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  onExportZipPackage?: () => void;
  onExportJsonBackup?: () => void;
  hideHeaderButtons?: boolean;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  simulatedOffline,
  onToggleSimulatedOffline,
  onExportZipPackage,
  onExportJsonBackup,
  hideHeaderButtons = false
}) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isCapacitorNative,
    swNeedRefresh,
    swOfflineReady,
    install,
    applyServiceWorkerUpdate,
    dismissServiceWorkerUpdate,
    dismissOfflineReadyNotice
  } = usePWAInstall();
  const browserOnline = useOnlineStatus();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const effectiveOnline = browserOnline && !simulatedOffline;

  const shareableAppUrl =
    typeof window !== 'undefined'
      ? window.location.origin.replace('//ais-dev-', '//ais-pre-')
      : '';

  const handleOpenInstallPrompt = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowInstallModal(true);
  };

  const handleCopyAppUrl = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareableAppUrl);
      } else {
        const area = document.createElement('textarea');
        area.value = shareableAppUrl;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const portalOverlays =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {/* Safe Service Worker Update Notification Banner (Preserves 100% of User Data) */}
            {swNeedRefresh && (
              <div
                dir="rtl"
                className="fixed top-20 inset-x-4 max-w-md mx-auto z-50 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white p-4 shadow-2xl border-2 border-emerald-500 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-extrabold">
                      يتوفر تحديث جديد لواجهة التطبيق (UMEDT PWA)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={dismissServiceWorkerUpdate}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  التحديث يُحدّث ملفات الواجهة المخبأة فقط ويحافظ بالكامل (100%) على مصطلحاتك، المفضلة، مجموعاتك، وتقدم مراجعة SM-2 في التخزين المحلي.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void applyServiceWorkerUpdate()}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold"
                  >
                    تحديث التطبيق الآن بأمان
                  </button>
                  <button
                    type="button"
                    onClick={dismissServiceWorkerUpdate}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700"
                  >
                    لاحقاً
                  </button>
                </div>
              </div>
            )}

            {/* Service Worker Offline Ready Toast */}
            {swOfflineReady && !swNeedRefresh && (
              <div
                dir="rtl"
                className="fixed bottom-20 lg:bottom-5 right-4 z-50 max-w-sm rounded-2xl bg-emerald-600 text-white px-4 py-3 shadow-xl border border-emerald-400 flex items-center justify-between gap-3 text-xs font-bold"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>تم تخزين واجهة UMEDT للعمل بدون إنترنت (Offline App-Shell Ready)</span>
                </div>
                <button
                  type="button"
                  onClick={dismissOfflineReadyNotice}
                  className="px-2 py-1 rounded-lg bg-emerald-700 text-[10px] font-extrabold shrink-0"
                >
                  حسناً
                </button>
              </div>
            )}

            {/* Honest Offline Mode Banner */}
            {!effectiveOnline && (
              <div
                dir="rtl"
                className="fixed bottom-20 lg:bottom-5 left-4 z-50 max-w-sm rounded-2xl bg-amber-500 text-slate-950 px-3.5 py-2.5 shadow-xl border border-amber-400 flex items-center justify-between gap-3 text-xs font-extrabold"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-950 animate-pulse shrink-0" />
                  <div>
                    <div>وضع عدم الاتصال (Offline Mode) نشط</div>
                    <div className="text-[10px] font-semibold opacity-90">
                      البحث، المترجم الصرفي/المعجمي، والمراجعة تعمل محلياً. (خدمات Gemini السحابية تتطلب اتصالاً).
                    </div>
                  </div>
                </div>
                {simulatedOffline && (
                  <button
                    type="button"
                    onClick={onToggleSimulatedOffline}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 text-amber-400 text-[10px] font-bold shrink-0"
                  >
                    إعادة الاتصال
                  </button>
                )}
              </div>
            )}

            {/* Full-Screen Centered PWA Installation & Cross-Environment Data Transfer Modal */}
            {showInstallModal && (
              <div
                dir="rtl"
                onClick={() => setShowInstallModal(false)}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl my-auto text-slate-900 dark:text-slate-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          تثبيت UMEDT (PWA / Android APK) ونقل البيانات
                        </h3>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                          تطبيق ويب تقدمي مستقل (PWA) + حزمة Android APK
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInstallModal(false)}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. PWA Installation Instructions on Android Chrome / iOS Safari */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      1. تثبيت تطبيق الويب التقدمي (PWA) على Android Chrome / iOS:
                    </div>

                    {isInstallable && (
                      <button
                        type="button"
                        onClick={() => void install()}
                        className="w-full min-h-[42px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>تثبيت UMEDT مباشرة على الشاشة الرئيسية</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        dir="ltr"
                        value={shareableAppUrl}
                        className="flex-1 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-left text-slate-700 dark:text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={handleCopyAppUrl}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-[11px] font-extrabold flex items-center gap-1 shrink-0"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ الرابط</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isIOS ? (
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <li>افتح الرابط في متصفح Safari.</li>
                        <li>
                          اضغط <strong>مشاركة (Share)</strong> ثم{' '}
                          <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                        </li>
                      </ol>
                    ) : (
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <li>
                          افتح موقع الإنتاج أو الرابط أعلاه في متصفح <strong>Android Chrome</strong>.
                        </li>
                        <li>
                          افتح قائمة المتصفح (⋮) واختر <strong>تثبيت التطبيق (Install App)</strong> أو{' '}
                          <strong>الإضافة إلى الشاشة الرئيسية</strong>.
                        </li>
                      </ol>
                    )}
                  </div>

                  {/* 2. Cross-Environment Data Transfer (ZIP / JSON Only) */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                    <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Archive className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>2. نقل بياناتك بين المعاينة، الموقع، PWA، وتطبيق APK:</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      نظراً لأن تخزين المتصفح وتخزين تطبيق الأندرويد APK منفصلان، يمكنك تصدير كافة بياناتك (المفضلة، المجموعات، تقدم SM-2، والمصطلحات المضافة) بصيغة <strong>.ZIP</strong> أو <strong>.JSON</strong> واستيرادها في أي بيئة أخرى:
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {onExportZipPackage && (
                        <button
                          type="button"
                          onClick={onExportZipPackage}
                          className="min-h-[40px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
                        >
                          <Archive className="w-3.5 h-3.5 shrink-0" />
                          <span>تصدير حزمة (.ZIP)</span>
                        </button>
                      )}
                      {onExportJsonBackup && (
                        <button
                          type="button"
                          onClick={onExportJsonBackup}
                          className="min-h-[40px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 text-slate-800 dark:text-slate-100"
                        >
                          <FileJson className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>تصدير ملف (.JSON)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3. Honest Offline Scope Clarification */}
                  <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 flex items-start gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>نطاق العمل بدون إنترنت (Offline):</strong> يعمل القاموس، البحث الفوري، الجمل، المترجم الصرفي/المعجمي (4 طبقات)، وبطاقات SM-2 محلياً 100% بدون إنترنت. أما ميزات الذكاء الاصطناعي السحابي (Gemini) والتحديث الهوائي فتتطلب اتصالاً بالشبكة.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowInstallModal(false)}
                    className="w-full py-2.5 rounded-2xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-extrabold"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            )}
          </>,
          document.body
        )
      : null;

  if (hideHeaderButtons) {
    return <>{portalOverlays}</>;
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Offline / Online Live Mode Pill & Simulator Toggle */}
        <button
          type="button"
          onClick={onToggleSimulatedOffline}
          title={
            effectiveOnline
              ? 'انقر لمحاكاة وضع عدم الاتصال (Offline Mode) واختبار العمل المحلي'
              : 'وضع Offline نشط (المعجم والمترجم الصرفي يعملان محلياً) — انقر للعودة للاتصال'
          }
          className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
            effectiveOnline
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-800 dark:text-amber-300'
          }`}
        >
          {effectiveOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">متصل (Offline-Ready)</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
              <span>وضع Offline نشط</span>
            </>
          )}
        </button>

        {/* In-App PWA Install & Cross-Environment Transfer Button */}
        {!isCapacitorNative && (
          <button
            type="button"
            onClick={handleOpenInstallPrompt}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-[11px] font-extrabold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
            title="تثبيت التطبيق (PWA) أو نقل البيانات عبر .ZIP / .JSON"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">
              {isInstalled ? 'نقل البيانات' : 'تثبيت PWA / نقل البيانات'}
            </span>
            <span className="md:hidden">{isInstalled ? 'نقل' : 'تثبيت'}</span>
          </button>
        )}
      </div>

      {portalOverlays}
    </>
  );
};
