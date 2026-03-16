/**
 * VoiceCaptureService — on-device speech-to-text via the Web Speech API.
 *
 * PRIVACY GUARANTEE: Audio is processed by the browser's native speech
 * recognition engine. No audio or transcript data is transmitted by this
 * application to any server it operates. On Chromium-based browsers the
 * browser itself may route audio to Google's speech service as part of the
 * Web Speech API implementation; users are informed of this on first use.
 *
 * OFFLINE: The Web Speech API is NOT guaranteed to work offline on all
 * browsers. When recognition fails due to a network requirement, a graceful
 * error message is surfaced ("Voice capture requires an internet connection
 * on this browser"). This is a known P2 limitation — mobile (iOS/Android)
 * uses fully on-device STT (Story 1.2 mobile pass).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MicPermissionState = 'granted' | 'denied' | 'prompt';

export interface VoiceCaptureCallbacks {
  /** Called repeatedly with partial (non-final) transcript text. */
  onInterimTranscript: (text: string) => void;
  /** Called once with the final recognised transcript when speech ends. */
  onFinalTranscript: (text: string) => void;
  /** Called on any recognition error with a machine code and human message. */
  onError: (code: string, message: string) => void;
  /** Called when recognition ends (after final or error). */
  onEnd: () => void;
}

export interface VoiceCaptureService {
  /** Begin listening. Clears any previous transcript. */
  start: () => void;
  /** Stop listening gracefully; triggers final result processing. */
  stop: () => void;
  /** Returns the last finalised transcript (empty string if none yet). */
  getTranscript: () => string;
  /** Abort recognition without processing results and release resources. */
  destroy: () => void;
}

// Internal: narrow type for the unprefixed + webkit-prefixed constructors.
type SpeechRecognitionCtor = new () => SpeechRecognition;

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/** Returns the platform SpeechRecognition constructor, or null if unsupported. */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Record<string, unknown>;
  return (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    null;
}

/** Returns true when the current environment supports the Web Speech API. */
export function isVoiceCaptureSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// ---------------------------------------------------------------------------
// Permission helpers (AC: 6)
// ---------------------------------------------------------------------------

/**
 * Returns the current microphone permission state without triggering an OS
 * prompt. Falls back to 'prompt' when the Permissions API is unavailable.
 */
export async function checkMicPermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    // Permissions API may throw for unrecognised permission names on some browsers.
    return 'prompt';
  }
}

/**
 * Triggers the browser's microphone permission prompt by requesting a media
 * stream (then immediately releasing it). Returns the resulting state.
 */
export async function requestMicPermission(): Promise<MicPermissionState> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release immediately — we only needed the permission prompt.
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied';
    // Other errors (NotFoundError etc.) — treat as denied for UX purposes.
    return 'denied';
  }
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  network: 'Voice capture requires an internet connection on this browser.',
  'not-allowed': 'Microphone permission was denied.',
  'no-speech': 'No speech was detected. Please try again.',
  'audio-capture': 'Microphone is not available.',
  'service-not-allowed': 'Speech service is not available.',
  aborted: 'Voice capture was cancelled.',
};

/**
 * Create a VoiceCaptureService instance.
 *
 * Throws if the Web Speech API is not supported in the current environment.
 * The caller is responsible for checking `isVoiceCaptureSupported()` first or
 * catching the thrown error.
 */
export function createVoiceCaptureService(callbacks: VoiceCaptureCallbacks): VoiceCaptureService {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    throw new Error('Web Speech API is not supported in this browser.');
  }

  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let transcript = '';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) {
        final += text;
      } else {
        interim += text;
      }
    }
    if (interim) callbacks.onInterimTranscript(interim);
    if (final) {
      transcript = final;
      callbacks.onFinalTranscript(final);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    const message = ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}`;
    callbacks.onError(event.error, message);
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  return {
    start() {
      transcript = '';
      recognition.start();
    },
    stop() {
      recognition.stop();
    },
    getTranscript() {
      return transcript;
    },
    destroy() {
      recognition.abort();
    },
  };
}
