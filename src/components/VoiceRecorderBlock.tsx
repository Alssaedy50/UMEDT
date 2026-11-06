import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Upload, Trash2, Volume2 } from 'lucide-react';
import {
  saveLocalMediaRecord,
  getLocalMediaRecord,
  formatBytesLabel
} from '../services/mediaStorageService';

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
    mediaFileName?: string;
    mediaSizeBytes?: number;
    mediaDurationSeconds?: number;
    titleEn?: string;
    titleAr?: string;
  }) => void;
  showToast: (msg: string, type?: string) => void;
}

export const VoiceRecorderBlock: React.FC<VoiceRecorderBlockProps> = ({
  topicId,
  sectionId,
  blockId,
  initialAudioUrl,
  initialMediaIdbKey,
  initialDurationSeconds,
  initialTitleEn,
  initialTitleAr,
  readOnly = false,
  onChange,
  showToast
}) => {
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string>(initialAudioUrl || '');
  const [durationSec, setDurationSec] = useState<number>(initialDurationSeconds || 0);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [externalAudioUrlInput, setExternalAudioUrlInput] = useState<string>('');
  const [sizeLabel, setSizeLabel] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    if (initialMediaIdbKey) {
      void getLocalMediaRecord(initialMediaIdbKey).then((rec) => {
        if (active && rec?.dataUrl) {
          setResolvedAudioUrl(rec.dataUrl);
          if (rec.durationSeconds) setDurationSec(rec.durationSeconds);
          if (rec.sizeBytes) setSizeLabel(formatBytesLabel(rec.sizeBytes));
        }
      });
    } else if (initialAudioUrl) {
      setResolvedAudioUrl(initialAudioUrl);
    }
    return () => {
      active = false;
    };
  }, [initialMediaIdbKey, initialAudioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const startVoiceRecording = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      showToast('المتصفح الحالي لا يدعم التسجيل الصوتي المباشر، يمكنك رفع ملف صوتي', 'info');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : typeof MediaRecorder !== 'undefined' &&
              MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      setRecordingSeconds(0);
      setIsRecording(true);

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 500);

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          audioChunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());

        const finalDuration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });

        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!dataUrl) return;
          const idbKey = `voice-${blockId}-${Date.now()}`;
          const fileName = `Voice_Note_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;

          const saved = await saveLocalMediaRecord({
            id: idbKey,
            topicId,
            sectionId,
            blockId,
            mediaType: 'audio_recording',
            fileName,
            mimeType,
            sizeBytes: blob.size,
            durationSeconds: finalDuration,
            dataUrl,
            createdAt: new Date().toISOString()
          });

          if (!saved.success) {
            showToast(saved.errorAr || 'تعذر حفظ التسجيل الصوتي', 'info');
            return;
          }

          setResolvedAudioUrl(dataUrl);
          setDurationSec(finalDuration);
          setSizeLabel(formatBytesLabel(blob.size));
          onChange?.({
            mediaUrl: dataUrl,
            mediaIdbKey: idbKey,
            mediaMimeType: mimeType,
            mediaFileName: fileName,
            mediaSizeBytes: blob.size,
            mediaDurationSeconds: finalDuration,
            titleEn: initialTitleEn || 'Recorded Clinical Audio Note',
            titleAr: initialTitleAr || 'تسجيل صوتي للشرح الطبي'
          });
          showToast(`تم حفظ التسجيل الصوتي محلياً (${formatTime(finalDuration)})`);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      showToast('تعذر الوصول للميكروفون. تأكد من منح صلاحية الميكروفون للتطبيق', 'info');
    }
  };

  const stopVoiceRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `audiofile-${blockId}-${Date.now()}`;
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

      if (!saved.success) {
        showToast(saved.errorAr || 'حجم الملف الصوتي كبير جداً', 'info');
        return;
      }

      setResolvedAudioUrl(dataUrl);
      setSizeLabel(formatBytesLabel(file.size));
      onChange?.({
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaMimeType: file.type || 'audio/mpeg',
        mediaFileName: file.name,
        mediaSizeBytes: file.size,
        titleEn: initialTitleEn || file.name,
        titleAr: initialTitleAr || 'ملف صوتي مرفق'
      });
      showToast(`تم إرفاق الملف الصوتي "${file.name}" بنجاح`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSetExternalAudioUrl = () => {
    const clean = externalAudioUrlInput.trim();
    if (!clean) return;
    const normalized =
      clean.startsWith('http://') || clean.startsWith('https://')
        ? clean
        : `https://${clean}`;
    setResolvedAudioUrl(normalized);
    setExternalAudioUrlInput('');
    onChange?.({
      mediaUrl: normalized,
      titleEn: initialTitleEn || 'External Audio Lecture',
      titleAr: initialTitleAr || 'تسجيل صوتي خارجي'
    });
    showToast('تم ربط التسجيل الصوتي الخارجي');
  };

  const togglePlayAudio = () => {
    const el = audioElementRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <h4 dir="ltr" className="text-xs font-bold text-slate-900 dark:text-white text-left">
              {initialTitleEn || 'Clinical Voice Note / Audio Explanation'}
            </h4>
            {initialTitleAr && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {initialTitleAr}
              </p>
            )}
          </div>
        </div>
        <div className="text-[11px] font-mono tabular-nums text-slate-500">
          {durationSec > 0 ? formatTime(durationSec) : ''}
          {sizeLabel ? ` · ${sizeLabel}` : ''}
        </div>
      </div>

      {resolvedAudioUrl && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={togglePlayAudio}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 flex items-center justify-center shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <audio
            ref={audioElementRef}
            src={resolvedAudioUrl}
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              const dur = e.currentTarget.duration;
              if (Number.isFinite(dur) && dur > 0) {
                setDurationSec(Math.round(dur));
              }
            }}
            className="w-full h-9"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                setResolvedAudioUrl('');
                setDurationSec(0);
                onChange?.({ mediaUrl: '' });
              }}
              className="min-h-[40px] min-w-[40px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center shrink-0"
              title="حذف الصوت"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="space-y-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => void startVoiceRecording()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Mic className="w-4 h-4" />
                <span>تسجيل صوتي مباشر من الميكروفون</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopVoiceRecording}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 text-xs font-extrabold flex items-center gap-2"
              >
                <Square className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span>إيقاف وحفظ التسجيل ({formatTime(recordingSeconds)})</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>رفع ملف صوتي</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="url"
              dir="ltr"
              value={externalAudioUrlInput}
              onChange={(e) => setExternalAudioUrlInput(e.target.value)}
              placeholder="https://example.com/lecture-audio.mp3"
              className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button
              type="button"
              onClick={handleSetExternalAudioUrl}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-bold shrink-0"
            >
              ربط رابط صوتي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
