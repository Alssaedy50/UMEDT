import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Upload,
  Volume2,
  Download,
  Link2,
  X,
  AlertCircle,
  CheckCircle2,
  Plus
} from 'lucide-react';
import {
  saveLocalMediaRecord,
  getLocalMediaRecord,
  deleteLocalMediaRecord,
  formatBytesLabel
} from '../services/mediaStorageService';
import {
  prepareAndDownloadFile,
  base64ToUint8Array
} from '../utils/downloadHelper';

interface VoiceRecorderBlockProps {
  topicId?: string;
  sectionId?: string;
  blockId: string;
  initialAudioUrl?: string;
  initialMediaIdbKey?: string;
  initialDurationSeconds?: number;
  initialTitleEn?: string;
  initialTitleAr?: string;
  readOnly?: boolean;
  onChange?: (updated: {
    mediaUrl: string;
    mediaIdbKey?: string;
    mediaMimeType?: string;
    mediaSizeBytes?: number;
    mediaDurationSeconds?: number;
    titleEn?: string;
    titleAr?: string;
  }) => void;
  showToast?: (msg: string, type?: string) => void;
}

type AudioSheetMode = 'menu' | 'record' | 'upload' | 'url';

export const VoiceRecorderBlock: React.FC<VoiceRecorderBlockProps> = ({
  topicId,
  sectionId,
  blockId,
  initialAudioUrl = '',
  initialMediaIdbKey = '',
  initialDurationSeconds = 0,
  initialTitleEn = 'Clinical Audio / Voice Note',
  initialTitleAr = 'تسجيل صوتي للشرح الطبي',
  readOnly = false,
  onChange,
  showToast
}) => {
  const [audioUrl, setAudioUrl] = useState<string>(() =>
    initialAudioUrl && !initialAudioUrl.startsWith('idb://')
      ? initialAudioUrl
      : ''
  );
  const [currentMediaIdbKey, setCurrentMediaIdbKey] =
    useState<string>(initialMediaIdbKey);
  const [titleEn, setTitleEn] = useState<string>(initialTitleEn);
  const [titleAr, setTitleAr] = useState<string>(initialTitleAr);
  const [durationSeconds, setDurationSeconds] = useState<number>(
    initialDurationSeconds
  );
  const [sizeBytes, setSizeBytes] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Bottom Sheet & Recording state
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState<boolean>(false);
  const [sheetMode, setSheetMode] = useState<AudioSheetMode>('menu');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSavingAudio, setIsSavingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [externalAudioUrlDraft, setExternalAudioUrlDraft] =
    useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync props when switching topics/blocks
  useEffect(() => {
    if (initialMediaIdbKey && initialMediaIdbKey !== currentMediaIdbKey) {
      setCurrentMediaIdbKey(initialMediaIdbKey);
    }
    if (
      initialAudioUrl &&
      !initialAudioUrl.startsWith('idb://') &&
      initialAudioUrl !== audioUrl
    ) {
      setAudioUrl(initialAudioUrl);
    }
  }, [initialAudioUrl, initialMediaIdbKey, currentMediaIdbKey, audioUrl]);

  // Restore persisted audio from IndexedDB across app restarts
  useEffect(() => {
    let active = true;
    const shouldLoadFromIdb =
      Boolean(currentMediaIdbKey) &&
      (!audioUrl ||
        audioUrl.startsWith('idb://') ||
        audioUrl.startsWith('blob:'));

    if (shouldLoadFromIdb) {
      void getLocalMediaRecord(currentMediaIdbKey).then((rec) => {
        if (!active) return;
        if (rec && rec.dataUrl) {
          setAudioUrl(rec.dataUrl);
          if (rec.durationSeconds) setDurationSeconds(rec.durationSeconds);
          if (rec.sizeBytes) setSizeBytes(rec.sizeBytes);
        } else if (audioUrl.startsWith('idb://')) {
          setAudioUrl('');
          setRecordingError(
            'لم يتم العثور على التسجيل الصوتي المحفوظ في الذاكرة المحلية (IndexedDB).'
          );
        }
      });
    }
    return () => {
      active = false;
    };
  }, [audioUrl, currentMediaIdbKey]);

  // Clean up media stream & timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const formatTime = (sec: number): string => {
    const safeSec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const ensureNativeAndroidMicPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;
    const w = window as unknown as {
      UMEDNativeDownloader?: {
        hasMicrophonePermission?: () => boolean;
        requestMicrophonePermission?: () => boolean;
      };
    };
    const bridge = w.UMEDNativeDownloader;
    if (
      bridge &&
      typeof bridge.hasMicrophonePermission === 'function' &&
      typeof bridge.requestMicrophonePermission === 'function'
    ) {
      try {
        if (bridge.hasMicrophonePermission()) {
          return true;
        }
        bridge.requestMicrophonePermission();
        // Wait up to 3.5 seconds for the user to respond to the native Android permission dialog
        for (let i = 0; i < 14; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (bridge.hasMicrophonePermission()) {
            return true;
          }
        }
        return bridge.hasMicrophonePermission();
      } catch {
        return true;
      }
    }
    return true;
  };

  const startRecording = async () => {
    setRecordingError(null);

    const nativeGranted = await ensureNativeAndroidMicPermission();
    if (!nativeGranted) {
      const msg =
        'تم رفض صلاحية الميكروفون في نظام أندرويد. يرجى السماح بصلاحية الميكروفون للتطبيق ثم المحاولة مجدداً.';
      setRecordingError(msg);
      showToast?.(msg, 'info');
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      const msg =
        'المتصفح أو الجهاز الحالي لا يدعم التسجيل الصوتي المباشر (MediaDevices API). يمكنك رفع ملف صوتي جاهز من خيار "رفع ملف".';
      setRecordingError(msg);
      showToast?.(msg, 'info');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      const msg =
        'واجهة التسجيل الصوتي (MediaRecorder) غير مدعومة في هذا المتصفح. استخدم خيار "رفع ملف" لإدراج ملف صوتي.';
      setRecordingError(msg);
      showToast?.(msg, 'info');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      activeStreamRef.current = stream;

      const candidateMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/aac'
      ];
      let chosenMime = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        for (const candidate of candidateMimes) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            chosenMime = candidate;
            break;
          }
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      const startedAtMs = Date.now();

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;

        const finalMime = recorder.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        const recordedDuration = Math.max(
          1,
          Math.round((Date.now() - startedAtMs) / 1000)
        );

        if (blob.size <= 0) {
          const emptyErr =
            'لم يتم التقاط أي بيانات صوتية أثناء التسجيل. يرجى التحقق من الميكروفون والمحاولة مرة أخرى.';
          setRecordingError(emptyErr);
          showToast?.(emptyErr, 'info');
          return;
        }

        setIsSavingAudio(true);
        const reader = new FileReader();
        reader.onerror = () => {
          setIsSavingAudio(false);
          const readErr = 'تعذر قراءة بيانات التسجيل الصوتي بعد التوقف.';
          setRecordingError(readErr);
          showToast?.(readErr, 'info');
        };
        reader.onloadend = async () => {
          try {
            const dataUrl =
              typeof reader.result === 'string' ? reader.result : '';
            if (!dataUrl) {
              setIsSavingAudio(false);
              const errMsg = 'فشل تحويل التسجيل الصوتي إلى صيغة قابلة للحفظ.';
              setRecordingError(errMsg);
              showToast?.(errMsg, 'info');
              return;
            }

            // Delete previous IndexedDB audio record if replacing
            if (currentMediaIdbKey) {
              await deleteLocalMediaRecord(currentMediaIdbKey);
            }

            const idbKey = `voice-${blockId}-${Date.now()}`;
            const ext = finalMime.includes('mp4')
              ? 'm4a'
              : finalMime.includes('ogg')
                ? 'ogg'
                : 'webm';
            const saved = await saveLocalMediaRecord({
              id: idbKey,
              topicId,
              sectionId,
              blockId,
              mediaType: 'audio_recording',
              fileName: `voice-note-${Date.now()}.${ext}`,
              mimeType: finalMime,
              sizeBytes: blob.size,
              durationSeconds: recordedDuration,
              dataUrl,
              createdAt: new Date().toISOString()
            });

            setIsSavingAudio(false);

            if (!saved.success || !saved.verifiedInIdb) {
              const failMsg =
                saved.errorAr ||
                'فشل حفظ التسجيل الصوتي في قاعدة البيانات المحلية (IndexedDB). لم يتم اعتماد التسجيل.';
              setRecordingError(failMsg);
              showToast?.(failMsg, 'info');
              return;
            }

            setAudioUrl(dataUrl);
            setCurrentMediaIdbKey(idbKey);
            setDurationSeconds(recordedDuration);
            setSizeBytes(blob.size);
            setRecordingError(null);
            setIsBottomSheetOpen(false);
            setSheetMode('menu');

            onChange?.({
              mediaUrl: dataUrl,
              mediaIdbKey: idbKey,
              mediaMimeType: finalMime,
              mediaSizeBytes: blob.size,
              mediaDurationSeconds: recordedDuration,
              titleEn,
              titleAr
            });
            showToast?.(
              `تم حفظ التسجيل الصوتي وتأكيد ثباته محلياً (${formatTime(
                recordedDuration
              )} · ${formatBytesLabel(blob.size)})`
            );
          } catch (saveErr) {
            setIsSavingAudio(false);
            const msg =
              saveErr instanceof Error
                ? saveErr.message
                : 'حدث خطأ غير متوقع أثناء حفظ التسجيل الصوتي';
            setRecordingError(msg);
            showToast?.(msg, 'info');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const errName = err instanceof DOMException ? err.name : '';
      const msg =
        errName === 'NotAllowedError' || errName === 'PermissionDeniedError'
          ? 'تم رفض صلاحية استخدام الميكروفون. يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح أو الهاتف ثم المحاولة مرة أخرى.'
          : errName === 'NotFoundError'
            ? 'لم يتم العثور على ميكروفون متصل بالجهاز.'
            : 'تعذر تشغيل الميكروفون في هذه الجلسة. يمكنك رفع ملف صوتي جاهز من خيار "رفع ملف".';
      setRecordingError(msg);
      showToast?.(msg, 'info');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecordingError(null);
    setIsSavingAudio(true);

    const reader = new FileReader();
    reader.onerror = () => {
      setIsSavingAudio(false);
      const msg = 'تعذر قراءة الملف الصوتي المختار من الجهاز.';
      setRecordingError(msg);
      showToast?.(msg, 'info');
    };
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setIsSavingAudio(false);
        const msg = 'محتوى الملف الصوتي المختار فارغ أو غير صالح.';
        setRecordingError(msg);
        showToast?.(msg, 'info');
        return;
      }

      if (currentMediaIdbKey) {
        await deleteLocalMediaRecord(currentMediaIdbKey);
      }

      const idbKey = `voice-upload-${blockId}-${Date.now()}`;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId,
        mediaType: 'audio_file',
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });

      setIsSavingAudio(false);

      if (!saved.success || !saved.verifiedInIdb) {
        const errMsg =
          saved.errorAr ||
          'تعذر حفظ الملف الصوتي في قاعدة البيانات المحلية (IndexedDB).';
        setRecordingError(errMsg);
        showToast?.(errMsg, 'info');
        return;
      }

      const nextTitleEn =
        titleEn === 'Clinical Audio / Voice Note' ||
        titleEn === 'Clinical Audio / Voice Recording'
          ? cleanName
          : titleEn;

      setAudioUrl(dataUrl);
      setCurrentMediaIdbKey(idbKey);
      setSizeBytes(file.size);
      setTitleEn(nextTitleEn);
      setRecordingError(null);
      setIsBottomSheetOpen(false);
      setSheetMode('menu');

      onChange?.({
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaMimeType: file.type || 'audio/mpeg',
        mediaSizeBytes: file.size,
        titleEn: nextTitleEn,
        titleAr
      });
      showToast?.(
        `تم رفع وحفظ الملف الصوتي "${file.name}" (${formatBytesLabel(
          file.size
        )}) بنجاح`
      );
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAttachExternalAudioUrl = async () => {
    const cleanUrl = externalAudioUrlDraft.trim();
    if (!cleanUrl) {
      setRecordingError('يرجى إدخال رابط ملف صوتي صحيح أولاً.');
      return;
    }
    const normalizedUrl =
      cleanUrl.startsWith('http://') ||
      cleanUrl.startsWith('https://') ||
      cleanUrl.startsWith('data:audio/')
        ? cleanUrl
        : `https://${cleanUrl}`;

    // If replacing a local IndexedDB recording with an external link, remove old IDB record
    if (currentMediaIdbKey) {
      await deleteLocalMediaRecord(currentMediaIdbKey);
    }

    setAudioUrl(normalizedUrl);
    setCurrentMediaIdbKey('');
    setSizeBytes(0);
    setExternalAudioUrlDraft('');
    setRecordingError(null);
    setIsBottomSheetOpen(false);
    setSheetMode('menu');

    onChange?.({
      mediaUrl: normalizedUrl,
      mediaIdbKey: undefined,
      titleEn,
      titleAr
    });
    showToast?.('تم إرفاق الرابط الصوتي بنجاح');
  };

  const handleDeleteAudio = async () => {
    if (isPlaying && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);

    if (currentMediaIdbKey) {
      await deleteLocalMediaRecord(currentMediaIdbKey);
    }

    setAudioUrl('');
    setCurrentMediaIdbKey('');
    setDurationSeconds(0);
    setSizeBytes(0);
    setRecordingError(null);

    onChange?.({
      mediaUrl: '',
      mediaIdbKey: undefined,
      mediaDurationSeconds: 0,
      mediaSizeBytes: 0,
      titleEn,
      titleAr
    });
    showToast?.('تم حذف الملف الصوتي فعلياً من الموضوع ومن الذاكرة المحلية');
  };

  const togglePlayPause = () => {
    const player = audioPlayerRef.current;
    if (!player || !audioUrl) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          showToast?.(
            'تعذر تشغيل الملف الصوتي. تأكد من صلاحية الرابط أو الصيغة.',
            'info'
          );
        });
    }
  };

  const handleDownloadAudio = async () => {
    if (!audioUrl) return;
    const safeBase = (titleEn || 'clinical-voice-note').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    if (audioUrl.startsWith('data:')) {
      const commaIdx = audioUrl.indexOf(',');
      const header = commaIdx !== -1 ? audioUrl.slice(5, commaIdx) : '';
      const dataPart = commaIdx !== -1 ? audioUrl.slice(commaIdx + 1) : '';
      const mime = header.split(';')[0] || 'audio/webm';
      const ext = mime.includes('mp4')
        ? 'm4a'
        : mime.includes('mpeg') || mime.includes('mp3')
          ? 'mp3'
          : mime.includes('ogg')
            ? 'ogg'
            : mime.includes('wav')
              ? 'wav'
              : 'webm';
      const bytes = header.includes('base64')
        ? base64ToUint8Array(dataPart)
        : new TextEncoder().encode(decodeURIComponent(dataPart));
      const res = await prepareAndDownloadFile({
        filename: `${safeBase}.${ext}`,
        content: bytes,
        mime
      });
      showToast?.(
        res.messageAr,
        res.verified ? 'success' : 'info'
      );
      return;
    }

    if (typeof window !== 'undefined') {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `${safeBase}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (readOnly && !audioUrl) {
    return null;
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 space-y-3 max-w-full overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.aac"
        onChange={handleAudioFileUpload}
        className="hidden"
      />

      {/* Header Row: Icon + Bilingual Titles + Status/Actions */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {readOnly ? (
              <>
                <p
                  dir="ltr"
                  className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white break-words text-left"
                >
                  {titleEn}
                </p>
                {titleAr && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                    {titleAr}
                  </p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={titleEn}
                  onChange={(e) => {
                    const nextEn = e.target.value;
                    setTitleEn(nextEn);
                    onChange?.({
                      mediaUrl: audioUrl,
                      mediaIdbKey: currentMediaIdbKey || undefined,
                      mediaDurationSeconds: durationSeconds,
                      mediaSizeBytes: sizeBytes,
                      titleEn: nextEn,
                      titleAr
                    });
                  }}
                  placeholder="Audio Title (English)..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={titleAr}
                  onChange={(e) => {
                    const nextAr = e.target.value;
                    setTitleAr(nextAr);
                    onChange?.({
                      mediaUrl: audioUrl,
                      mediaIdbKey: currentMediaIdbKey || undefined,
                      mediaDurationSeconds: durationSeconds,
                      mediaSizeBytes: sizeBytes,
                      titleEn,
                      titleAr: nextAr
                    });
                  }}
                  placeholder="عنوان التسجيل الصوتي بالعربية..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300"
                />
              </div>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                setRecordingError(null);
                setSheetMode('menu');
                setIsBottomSheetOpen(true);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-colors flex-1 sm:flex-initial"
            >
              {audioUrl ? (
                <>
                  <Mic className="w-4 h-4 shrink-0" />
                  <span>تغيير التسجيل الصوتي</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>إضافة صوت (تسجيل / ملف / رابط)</span>
                </>
              )}
            </button>

            {audioUrl && (
              <button
                type="button"
                onClick={() => void handleDeleteAudio()}
                className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                title="حذف الملف الصوتي نهائياً"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">حذف</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Clear Error Banner if IndexedDB or Microphone fails */}
      {recordingError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <span className="leading-relaxed break-words flex-1">
            {recordingError}
          </span>
        </div>
      )}

      {/* Responsive Audio Player */}
      {audioUrl && (
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <audio
            ref={audioPlayerRef}
            src={audioUrl}
            preload="metadata"
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime || 0);
            }}
            onLoadedMetadata={(e) => {
              const dur = e.currentTarget.duration;
              if (Number.isFinite(dur) && dur > 0) {
                setDurationSeconds(Math.round(dur));
              }
            }}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlayPause}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 flex items-center justify-center shrink-0 transition-colors shadow-xs"
              aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل التسجيل الصوتي'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <div className="flex-1 min-w-[140px] space-y-1">
              <input
                type="range"
                dir="ltr"
                min={0}
                max={Math.max(1, durationSeconds)}
                step={0.1}
                value={Math.min(currentTime, Math.max(1, durationSeconds))}
                onChange={(e) => {
                  const nextSec = Number(e.target.value);
                  setCurrentTime(nextSec);
                  if (audioPlayerRef.current) {
                    audioPlayerRef.current.currentTime = nextSec;
                  }
                }}
                className="w-full accent-emerald-600 dark:accent-emerald-400 cursor-pointer h-2 rounded-lg"
              />
              <div
                dir="ltr"
                className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400"
              >
                <span>{formatTime(currentTime)}</span>
                <div className="flex items-center gap-2">
                  {sizeBytes > 0 && <span>{formatBytesLabel(sizeBytes)}</span>}
                  {currentMediaIdbKey && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                      محفوظ محلياً
                    </span>
                  )}
                  <span>{formatTime(durationSeconds)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleDownloadAudio()}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
              title="تنزيل الملف الصوتي"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">تنزيل</span>
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          MOBILE BOTTOM SHEET / DESKTOP MODAL FOR AUDIO OPTIONS
          Options: 1. تسجيل مباشر  2. رفع ملف  3. إضافة رابط
         ==================================================================== */}
      {isBottomSheetOpen && !readOnly && (
        <div
          onClick={() => {
            if (!isRecording && !isSavingAudio) {
              setIsBottomSheetOpen(false);
            }
          }}
          className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 pb-7 sm:p-6 space-y-4 shadow-2xl max-h-[88dvh] overflow-y-auto"
          >
            {/* Mobile Bottom Sheet Handle */}
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto sm:hidden" />

            {/* Sheet Header */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  إضافة أو تسجيل ملف صوتي للشرح
                </h3>
              </div>
              <button
                type="button"
                disabled={isRecording || isSavingAudio}
                onClick={() => setIsBottomSheetOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option Tabs */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isRecording || isSavingAudio}
                onClick={() => {
                  setRecordingError(null);
                  setSheetMode('record');
                }}
                className={`min-h-[48px] px-2.5 py-2 rounded-2xl border text-xs font-extrabold flex flex-col items-center justify-center gap-1 transition-colors ${
                  sheetMode === 'record' || sheetMode === 'menu'
                    ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>تسجيل مباشر</span>
              </button>

              <button
                type="button"
                disabled={isRecording || isSavingAudio}
                onClick={() => {
                  setRecordingError(null);
                  setSheetMode('upload');
                }}
                className={`min-h-[48px] px-2.5 py-2 rounded-2xl border text-xs font-extrabold flex flex-col items-center justify-center gap-1 transition-colors ${
                  sheetMode === 'upload'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>رفع ملف</span>
              </button>

              <button
                type="button"
                disabled={isRecording || isSavingAudio}
                onClick={() => {
                  setRecordingError(null);
                  setSheetMode('url');
                }}
                className={`min-h-[48px] px-2.5 py-2 rounded-2xl border text-xs font-extrabold flex flex-col items-center justify-center gap-1 transition-colors ${
                  sheetMode === 'url'
                    ? 'bg-sky-500/10 border-sky-500 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>إضافة رابط</span>
              </button>
            </div>

            {recordingError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span className="leading-relaxed break-words flex-1">
                  {recordingError}
                </span>
              </div>
            )}

            {/* Mode 1: Live Microphone Recording */}
            {(sheetMode === 'menu' || sheetMode === 'record') && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    تسجيل صوتي مباشر من الميكروفون
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    يُحفظ التسجيل في قاعدة البيانات المحلية (IndexedDB) ويبقى متاحاً دون إنترنت وبعد إعادة تشغيل التطبيق.
                  </p>
                </div>

                <div
                  dir="ltr"
                  className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white tracking-wider"
                >
                  {formatTime(recordingSeconds)}
                </div>

                {!isRecording ? (
                  <button
                    type="button"
                    disabled={isSavingAudio}
                    onClick={() => void startRecording()}
                    className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 disabled:opacity-50 transition-colors"
                  >
                    <Mic className="w-5 h-5" />
                    <span>
                      {isSavingAudio
                        ? 'جاري حفظ التسجيل والتحقق...'
                        : 'بدء التسجيل الصوتي الآن'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-rose-600 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 animate-pulse shadow-lg shadow-rose-600/30"
                  >
                    <Square className="w-5 h-5" />
                    <span>إيقاف التسجيل وحفظه محلياً ({formatTime(recordingSeconds)})</span>
                  </button>
                )}
              </div>
            )}

            {/* Mode 2: Upload Audio File from Device */}
            {sheetMode === 'upload' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-center">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    رفع ملف صوتي من ذاكرة الجهاز
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    يدعم صيغ MP3, WAV, M4A, OGG, WEBM, AAC حتى 15 ميجابايت مع الحفظ المحلي الدائم.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSavingAudio}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-5 h-5" />
                  <span>
                    {isSavingAudio
                      ? 'جاري حفظ الملف والتحقق...'
                      : 'اختيار ملف صوتي من الهاتف / الكمبيوتر'}
                  </span>
                </button>
              </div>
            )}

            {/* Mode 3: External Audio URL */}
            {sheetMode === 'url' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    إضافة رابط ملف صوتي مباشر
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    أدخل رابطاً مباشراً لملف صوتي (مثل https://example.com/lecture.mp3).
                  </p>
                </div>

                <input
                  type="url"
                  dir="ltr"
                  value={externalAudioUrlDraft}
                  onChange={(e) => setExternalAudioUrlDraft(e.target.value)}
                  placeholder="https://example.com/audio.mp3"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-left focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="button"
                  onClick={() => void handleAttachExternalAudioUrl()}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إرفاق الرابط الصوتي</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
