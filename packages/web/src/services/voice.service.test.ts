/**
 * Unit tests — VoiceCaptureService (Story 1.2)
 *
 * The Web Speech API does not exist in jsdom. All tests mock the relevant
 * browser globals before exercising the service functions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMicPermission,
  createVoiceCaptureService,
  isVoiceCaptureSupported,
  requestMicPermission,
} from './voice.service.js';

// ---------------------------------------------------------------------------
// Local minimal types — SpeechRecognitionEvent / ErrorEvent are DOM globals
// that are not guaranteed in the test TypeScript compilation context.
// ---------------------------------------------------------------------------

type MockSpeechResultEvent = {
  resultIndex: number;
  results: Array<Array<{ transcript: string }> & { isFinal: boolean; length: number }>;
};
type MockSpeechErrorEvent = { error: string };
type SpeechResultHandler = (e: MockSpeechResultEvent) => void;
type SpeechErrorHandler = (e: MockSpeechErrorEvent) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SpeechRecognition mock that records calls and fires events. */
function makeMockRecognition() {
  const instance = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null as SpeechResultHandler | null,
    onerror: null as SpeechErrorHandler | null,
    onend: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
  const Ctor = vi.fn(() => instance);
  return { Ctor, instance };
}

/** Install a mock SpeechRecognition constructor on window. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installMockSpeechRecognition(Ctor: (...args: any[]) => any) {
  Object.defineProperty(window, 'SpeechRecognition', {
    value: Ctor,
    writable: true,
    configurable: true,
  });
}

/** Remove window.SpeechRecognition. */
function removeSpeechRecognition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).SpeechRecognition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).webkitSpeechRecognition;
}

// ---------------------------------------------------------------------------
// isVoiceCaptureSupported
// ---------------------------------------------------------------------------

describe('isVoiceCaptureSupported', () => {
  afterEach(removeSpeechRecognition);

  it('returns false when SpeechRecognition is absent (default jsdom)', () => {
    removeSpeechRecognition();
    expect(isVoiceCaptureSupported()).toBe(false);
  });

  it('returns true when window.SpeechRecognition is present', () => {
    installMockSpeechRecognition(vi.fn());
    expect(isVoiceCaptureSupported()).toBe(true);
  });

  it('returns true when window.webkitSpeechRecognition is present', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    expect(isVoiceCaptureSupported()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkMicPermission
// ---------------------------------------------------------------------------

describe('checkMicPermission', () => {
  // jsdom does not implement navigator.permissions — install a mock object.
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQuery = vi.fn();
    Object.defineProperty(navigator, 'permissions', {
      value: { query: mockQuery },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "granted" when permission state is granted', async () => {
    mockQuery.mockResolvedValueOnce({ state: 'granted' });
    expect(await checkMicPermission()).toBe('granted');
  });

  it('returns "denied" when permission state is denied', async () => {
    mockQuery.mockResolvedValueOnce({ state: 'denied' });
    expect(await checkMicPermission()).toBe('denied');
  });

  it('returns "prompt" when permission state is prompt', async () => {
    mockQuery.mockResolvedValueOnce({ state: 'prompt' });
    expect(await checkMicPermission()).toBe('prompt');
  });

  it('returns "prompt" when Permissions API throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('unsupported'));
    expect(await checkMicPermission()).toBe('prompt');
  });
});

// ---------------------------------------------------------------------------
// requestMicPermission
// ---------------------------------------------------------------------------

describe('requestMicPermission', () => {
  // jsdom does not implement navigator.mediaDevices.getUserMedia — install mock.
  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "granted" when getUserMedia resolves', async () => {
    const mockTrack = { stop: vi.fn() };
    mockGetUserMedia.mockResolvedValueOnce({ getTracks: () => [mockTrack] });

    expect(await requestMicPermission()).toBe('granted');
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('returns "denied" on NotAllowedError', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    expect(await requestMicPermission()).toBe('denied');
  });

  it('returns "denied" on PermissionDeniedError', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'PermissionDeniedError' }),
    );
    expect(await requestMicPermission()).toBe('denied');
  });

  it('returns "denied" on other errors (e.g. NotFoundError)', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { name: 'NotFoundError' }),
    );
    expect(await requestMicPermission()).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// createVoiceCaptureService
// ---------------------------------------------------------------------------

describe('createVoiceCaptureService', () => {
  afterEach(removeSpeechRecognition);

  it('throws when SpeechRecognition is not supported', () => {
    removeSpeechRecognition();
    expect(() =>
      createVoiceCaptureService({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      }),
    ).toThrow('Web Speech API is not supported in this browser.');
  });

  describe('with mock SpeechRecognition', () => {
    let mock: ReturnType<typeof makeMockRecognition>;
    let onInterimTranscript: ReturnType<typeof vi.fn>;
    let onFinalTranscript: ReturnType<typeof vi.fn>;
    let onError: ReturnType<typeof vi.fn>;
    let onEnd: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mock = makeMockRecognition();
      installMockSpeechRecognition(mock.Ctor);
      onInterimTranscript = vi.fn();
      onFinalTranscript = vi.fn();
      onError = vi.fn();
      onEnd = vi.fn();
    });

    function makeService() {
      return createVoiceCaptureService({ onInterimTranscript, onFinalTranscript, onError, onEnd });
    }

    it('calls recognition.start() on start()', () => {
      const svc = makeService();
      svc.start();
      expect(mock.instance.start).toHaveBeenCalledOnce();
    });

    it('calls recognition.stop() on stop()', () => {
      const svc = makeService();
      svc.stop();
      expect(mock.instance.stop).toHaveBeenCalledOnce();
    });

    it('calls recognition.abort() on destroy()', () => {
      const svc = makeService();
      svc.destroy();
      expect(mock.instance.abort).toHaveBeenCalledOnce();
    });

    it('returns empty string from getTranscript() before any speech', () => {
      const svc = makeService();
      expect(svc.getTranscript()).toBe('');
    });

    it('fires onFinalTranscript and updates getTranscript() on final result', () => {
      const svc = makeService();

      // Simulate a final SpeechRecognitionEvent
      const event = {
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Buy groceries' }], { isFinal: true, length: 1 })],
      } satisfies MockSpeechResultEvent;

      mock.instance.onresult!(event);

      expect(onFinalTranscript).toHaveBeenCalledWith('Buy groceries');
      expect(svc.getTranscript()).toBe('Buy groceries');
      expect(onInterimTranscript).not.toHaveBeenCalled();
    });

    it('fires onInterimTranscript for non-final results', () => {
      makeService();

      const event = {
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Buy gro' }], { isFinal: false, length: 1 })],
      } satisfies MockSpeechResultEvent;

      mock.instance.onresult!(event);

      expect(onInterimTranscript).toHaveBeenCalledWith('Buy gro');
      expect(onFinalTranscript).not.toHaveBeenCalled();
    });

    it('clears previous transcript on start()', () => {
      const svc = makeService();

      // Simulate a previous final result
      const event = {
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'Old task' }], { isFinal: true, length: 1 })],
      } satisfies MockSpeechResultEvent;
      mock.instance.onresult!(event);
      expect(svc.getTranscript()).toBe('Old task');

      // Start again — should clear
      svc.start();
      expect(svc.getTranscript()).toBe('');
    });

    it('fires onError with human-readable message for "network" error', () => {
      makeService();
      const event = { error: 'network' } satisfies MockSpeechErrorEvent;
      mock.instance.onerror!(event);
      expect(onError).toHaveBeenCalledWith(
        'network',
        'Voice capture requires an internet connection on this browser.',
      );
    });

    it('fires onError with human-readable message for "no-speech" error', () => {
      makeService();
      const event = { error: 'no-speech' } satisfies MockSpeechErrorEvent;
      mock.instance.onerror!(event);
      expect(onError).toHaveBeenCalledWith('no-speech', 'No speech was detected. Please try again.');
    });

    it('fires onEnd when recognition ends', () => {
      makeService();
      mock.instance.onend!();
      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('handles empty audio gracefully (onEnd fires, no transcript, no error)', () => {
      const svc = makeService();
      // Recognition ends with no results — empty audio scenario
      mock.instance.onend!();
      expect(svc.getTranscript()).toBe('');
      expect(onFinalTranscript).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });
});
