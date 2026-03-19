import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@todo-app/shared';
import {
  checkMicPermission,
  createVoiceCaptureService,
  isVoiceCaptureSupported,
  requestMicPermission,
  type VoiceCaptureService,
} from '../../services/voice.service.js';
import { extractDateFromText } from '../../lib/date-extraction.js';
import { createTask } from '../../services/task.service.js';
import { useUIStore } from '../../stores/ui.store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CapturePhase =
  | 'idle'
  | 'privacy-notice'      // First-use: show privacy modal before starting
  | 'recording'           // Mic is active; showing live transcript
  | 'processing'          // Recognition ended; extracting date
  | 'review'              // Editable transcript + Save / Cancel / Try again
  | 'permission-denied';  // Mic permission was refused

const PRIVACY_NOTICE_KEY = 'voice_privacy_notice_seen';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VoiceCaptureButtonProps {
  onTaskCreated: (task: Task) => void;
  className?: string;
}

export function VoiceCaptureButton({ onTaskCreated, className }: VoiceCaptureButtonProps) {
  const currentUserId = useUIStore((s) => s.currentUserId);

  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [interimText, setInterimText] = useState('');
  const [reviewTitle, setReviewTitle] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const serviceRef = useRef<VoiceCaptureService | null>(null);
  const reviewInputRef = useRef<HTMLInputElement>(null);

  // Focus review input when entering review phase.
  useEffect(() => {
    if (phase === 'review') {
      reviewInputRef.current?.focus();
    }
  }, [phase]);

  // Cleanup service on unmount.
  useEffect(() => {
    return () => {
      serviceRef.current?.destroy();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Core capture logic
  // -------------------------------------------------------------------------

  const startRecording = useCallback(() => {
    if (!isVoiceCaptureSupported()) {
      // Should not reach here normally — button is hidden when unsupported.
      return;
    }

    setInterimText('');
    setPhase('recording');

    const svc = createVoiceCaptureService({
      onInterimTranscript: (text) => setInterimText(text),
      onFinalTranscript: () => {
        // Handled in onEnd once recognition fully stops.
      },
      onError: (code, message) => {
        if (code === 'not-allowed') {
          setPhase('permission-denied');
        } else if (code === 'aborted') {
          setPhase('idle');
        } else {
          // Surface error in review so user can try again.
          setReviewTitle('');
          setDueDate(null);
          setSaveError(message);
          setPhase('review');
        }
      },
      onEnd: () => {
        setPhase('processing');
        const raw = svc.getTranscript();
        if (!raw) {
          // Empty audio — go to review with empty state (Try again visible).
          setReviewTitle('');
          setDueDate(null);
        } else {
          const extracted = extractDateFromText(raw);
          setReviewTitle(extracted.cleanTitle);
          setDueDate(extracted.dueDate);
        }
        setPhase('review');
      },
    });

    serviceRef.current = svc;
    svc.start();
  }, []);

  const beginCapture = useCallback(async () => {
    const permission = await checkMicPermission();
    if (permission === 'denied') {
      setPhase('permission-denied');
      return;
    }
    if (permission === 'prompt') {
      const result = await requestMicPermission();
      if (result === 'denied') {
        setPhase('permission-denied');
        return;
      }
    }
    startRecording();
  }, [startRecording]);

  const handleMicClick = useCallback(async () => {
    const seen = localStorage.getItem(PRIVACY_NOTICE_KEY);
    if (!seen) {
      setPhase('privacy-notice');
      return;
    }
    await beginCapture();
  }, [beginCapture]);

  const handlePrivacyAccept = useCallback(async () => {
    localStorage.setItem(PRIVACY_NOTICE_KEY, '1');
    await beginCapture();
  }, [beginCapture]);

  const handleStopRecording = useCallback(() => {
    serviceRef.current?.stop();
  }, []);

  const handleTryAgain = useCallback(async () => {
    setSaveError(null);
    await beginCapture();
  }, [beginCapture]);

  const handleCancel = useCallback(() => {
    serviceRef.current?.destroy();
    serviceRef.current = null;
    setInterimText('');
    setReviewTitle('');
    setDueDate(null);
    setSaveError(null);
    setPhase('idle');
  }, []);

  const handleSave = useCallback(() => {
    const title = reviewTitle.trim();
    if (!title || !currentUserId) return;

    try {
      const task = createTask({
        title,
        user_id: currentUserId,
        ...(dueDate ? { due_date: dueDate } : {}),
      });
      onTaskCreated(task);
      handleCancel();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save task.');
    }
  }, [reviewTitle, dueDate, currentUserId, onTaskCreated, handleCancel]);

  // -------------------------------------------------------------------------
  // Not supported
  // -------------------------------------------------------------------------

  if (!isVoiceCaptureSupported()) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={`voice-capture${className ? ` ${className}` : ''}`} data-testid="voice-capture">

      {/* ------------------------------------------------------------------ */}
      {/* Idle — mic button                                                   */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'idle' && (
        <button
          type="button"
          className="voice-capture__mic-btn"
          aria-label="Start voice capture"
          data-testid="voice-capture-mic-btn"
          onClick={handleMicClick}
        >
          🎤
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* First-use privacy notice                                            */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'privacy-notice' && (
        <div
          className="voice-capture__privacy-notice"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-notice-title"
          data-testid="voice-privacy-notice"
        >
          <p id="privacy-notice-title" className="voice-capture__privacy-title">
            Voice is processed on your device only.
          </p>
          <p className="voice-capture__privacy-body">
            On some browsers, your device may use a network-based speech service.
            No audio or transcript is sent to our servers.
          </p>
          <div className="voice-capture__privacy-actions">
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--primary"
              data-testid="voice-privacy-accept-btn"
              onClick={handlePrivacyAccept}
            >
              Got it, start recording
            </button>
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--ghost"
              data-testid="voice-privacy-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Recording                                                           */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'recording' && (
        <div
          className="voice-capture__recording"
          role="status"
          aria-live="polite"
          aria-label="Recording in progress"
          data-testid="voice-recording"
        >
          <span
            className="voice-capture__pulse"
            aria-hidden="true"
            data-testid="voice-pulse-indicator"
          />
          <span className="voice-capture__listening-label">Listening…</span>
          {interimText && (
            <span className="voice-capture__interim" data-testid="voice-interim-text">
              {interimText}
            </span>
          )}
          <button
            type="button"
            className="voice-capture__btn voice-capture__btn--stop"
            aria-label="Stop recording"
            data-testid="voice-stop-btn"
            onClick={handleStopRecording}
          >
            Stop
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Processing                                                          */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'processing' && (
        <div
          className="voice-capture__processing"
          role="status"
          aria-label="Processing speech"
          data-testid="voice-processing"
        >
          <span aria-hidden="true">⏳</span> Processing…
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Review                                                              */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'review' && (
        <div
          className="voice-capture__review"
          role="form"
          aria-label="Review voice capture"
          data-testid="voice-review"
        >
          <input
            ref={reviewInputRef}
            type="text"
            className="voice-capture__review-input"
            aria-label="Edit transcribed task title"
            data-testid="voice-review-input"
            value={reviewTitle}
            onChange={(e) => setReviewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && reviewTitle.trim()) handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />

          {dueDate && (
            <div className="voice-capture__due-chip" data-testid="voice-due-chip">
              <span>📅 {new Date(dueDate).toLocaleDateString()}</span>
              <button
                type="button"
                aria-label="Remove due date"
                data-testid="voice-due-chip-dismiss"
                onClick={() => setDueDate(null)}
              >
                ×
              </button>
            </div>
          )}

          {saveError && (
            <p className="voice-capture__error" role="alert" data-testid="voice-save-error">
              {saveError}
            </p>
          )}

          <div className="voice-capture__review-actions">
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--primary"
              aria-label="Save voice task"
              data-testid="voice-save-btn"
              disabled={!reviewTitle.trim()}
              onClick={handleSave}
            >
              Save
            </button>
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--ghost"
              aria-label="Try voice capture again"
              data-testid="voice-try-again-btn"
              onClick={handleTryAgain}
            >
              Try again
            </button>
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--ghost"
              aria-label="Cancel voice capture"
              data-testid="voice-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Permission denied                                                   */}
      {/* ------------------------------------------------------------------ */}
      {phase === 'permission-denied' && (
        <div
          className="voice-capture__permission-denied"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permission-denied-title"
          data-testid="voice-permission-denied"
        >
          <p id="permission-denied-title" className="voice-capture__permission-title">
            Microphone access is needed for voice capture.
          </p>
          <p className="voice-capture__permission-body">
            Please allow microphone access in your browser settings, then try again.
          </p>
          <p className="voice-capture__permission-hint">
            Click the lock icon in your browser's address bar and allow
            microphone access, then try again.
          </p>
          <div className="voice-capture__permission-actions">
            <span
              className="voice-capture__btn voice-capture__btn--primary"
              aria-label="Open browser settings"
              data-testid="voice-open-settings-link"
            >
              Allow mic in browser settings
            </span>
            <button
              type="button"
              className="voice-capture__btn voice-capture__btn--ghost"
              data-testid="voice-permission-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
