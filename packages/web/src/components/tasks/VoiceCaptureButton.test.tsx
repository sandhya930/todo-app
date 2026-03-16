/**
 * Unit tests — VoiceCaptureButton component (Story 1.2, Task 3)
 *
 * All external services (voice, createTask) are mocked so tests are
 * fully synchronous / deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceCaptureButton } from './VoiceCaptureButton.js';
import { useUIStore } from '../../stores/ui.store.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/voice.service.js', () => ({
  isVoiceCaptureSupported: vi.fn(() => true),
  checkMicPermission: vi.fn(async () => 'granted'),
  requestMicPermission: vi.fn(async () => 'granted'),
  createVoiceCaptureService: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    getTranscript: vi.fn(() => ''),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../services/task.service.js', () => ({
  createTask: vi.fn((input: { title: string; user_id: string }) => ({
    id: 'mock-task-id',
    title: input.title,
    user_id: input.user_id,
    status: 'inbox',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pending_sync: true,
    synced_at: null,
    due_date: null,
    project_id: null,
    energy_level: null,
    notes: null,
    estimated_duration_minutes: null,
    assignee_user_id: null,
    source: 'manual',
    pinned_today: false,
    today_sort_order: null,
    deferred_count: 0,
    last_deferred_at: null,
    deferral_prompt_shown: false,
    completed_at: null,
    last_interacted_at: new Date().toISOString(),
  })),
}));

vi.mock('../../lib/date-extraction.js', () => ({
  extractDateFromText: vi.fn((text: string) => ({ cleanTitle: text, dueDate: null })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

// Import mocked modules for programmatic control in tests.
import * as voiceService from '../../services/voice.service.js';
import * as taskService from '../../services/task.service.js';
import * as dateExtraction from '../../lib/date-extraction.js';

function setup() {
  const onTaskCreated = vi.fn();
  const result = render(<VoiceCaptureButton onTaskCreated={onTaskCreated} />);
  return { onTaskCreated, ...result };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('VoiceCaptureButton', () => {
  beforeEach(() => {
    useUIStore.setState({ currentUserId: TEST_USER_ID });
    // Clear privacy notice flag so each test starts clean.
    localStorage.removeItem('voice_privacy_notice_seen');
    vi.clearAllMocks();
    // Reset mocks to defaults.
    vi.mocked(voiceService.isVoiceCaptureSupported).mockReturnValue(true);
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('granted');
    vi.mocked(voiceService.requestMicPermission).mockResolvedValue('granted');
    vi.mocked(dateExtraction.extractDateFromText).mockImplementation((text) => ({
      cleanTitle: text,
      dueDate: null,
    }));
  });

  afterEach(() => {
    useUIStore.setState({ currentUserId: null });
    localStorage.removeItem('voice_privacy_notice_seen');
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  it('renders the mic button when supported', () => {
    setup();
    expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument();
  });

  it('renders nothing when voice capture is not supported', () => {
    vi.mocked(voiceService.isVoiceCaptureSupported).mockReturnValue(false);
    const { container } = render(<VoiceCaptureButton onTaskCreated={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('mic button has correct aria-label (AC: accessibility)', () => {
    setup();
    expect(screen.getByLabelText('Start voice capture')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // First-use privacy notice
  // -------------------------------------------------------------------------

  it('shows privacy notice on first mic tap', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    expect(screen.getByTestId('voice-privacy-notice')).toBeInTheDocument();
  });

  it('skips privacy notice on subsequent taps', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    const mockSvc = { start: vi.fn(), stop: vi.fn(), getTranscript: vi.fn(() => ''), destroy: vi.fn() };
    vi.mocked(voiceService.createVoiceCaptureService).mockReturnValue(mockSvc);

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    expect(screen.queryByTestId('voice-privacy-notice')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
  });

  it('accepting privacy notice stores the flag and starts recording', async () => {
    const mockSvc = { start: vi.fn(), stop: vi.fn(), getTranscript: vi.fn(() => ''), destroy: vi.fn() };
    vi.mocked(voiceService.createVoiceCaptureService).mockReturnValue(mockSvc);

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await user.click(screen.getByTestId('voice-privacy-accept-btn'));

    expect(localStorage.getItem('voice_privacy_notice_seen')).toBe('1');
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    expect(mockSvc.start).toHaveBeenCalledOnce();
  });

  it('cancelling privacy notice returns to idle', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await user.click(screen.getByTestId('voice-privacy-cancel-btn'));

    expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-privacy-notice')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Permission denied (AC: 6)
  // -------------------------------------------------------------------------

  it('shows permission-denied UI when mic permission is denied', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('denied');

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-permission-denied')).toBeInTheDocument(),
    );
  });

  it('shows permission-denied after prompt is declined', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('prompt');
    vi.mocked(voiceService.requestMicPermission).mockResolvedValue('denied');

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-permission-denied')).toBeInTheDocument(),
    );
  });

  it('permission-denied screen has Open Settings link', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('denied');

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-open-settings-link')).toBeInTheDocument(),
    );
  });

  it('cancel on permission-denied returns to idle', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('denied');

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-permission-denied')).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId('voice-permission-cancel-btn'));
    expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Recording state (AC: 1, 4)
  // -------------------------------------------------------------------------

  it('shows recording UI with Listening… label after capture starts', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    const mockSvc = { start: vi.fn(), stop: vi.fn(), getTranscript: vi.fn(() => ''), destroy: vi.fn() };
    vi.mocked(voiceService.createVoiceCaptureService).mockReturnValue(mockSvc);

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    expect(screen.getByTestId('voice-pulse-indicator')).toBeInTheDocument();
  });

  it('stop button calls service.stop()', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');
    const mockSvc = { start: vi.fn(), stop: vi.fn(), getTranscript: vi.fn(() => ''), destroy: vi.fn() };
    vi.mocked(voiceService.createVoiceCaptureService).mockReturnValue(mockSvc);

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-stop-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('voice-stop-btn'));
    expect(mockSvc.stop).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Review state (AC: 4, 7)
  // -------------------------------------------------------------------------

  it('shows review screen with editable input after recognition ends', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Buy groceries'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());

    // Simulate recognition ending.
    capturedCallbacks!.onEnd();

    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());
    const input = screen.getByTestId('voice-review-input') as HTMLInputElement;
    expect(input.value).toBe('Buy groceries');
  });

  it('review input is editable (AC: 4)', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Buy groceries'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    const input = screen.getByTestId('voice-review-input');
    await user.clear(input);
    await user.type(input, 'Buy oat milk');
    expect(input).toHaveValue('Buy oat milk');
  });

  it('Save button calls createTask and fires onTaskCreated (AC: 8)', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Walk the dog'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    const { onTaskCreated } = setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    await user.click(screen.getByTestId('voice-save-btn'));

    expect(taskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Walk the dog', user_id: TEST_USER_ID }),
    );
    expect(onTaskCreated).toHaveBeenCalledOnce();
    // Returns to idle after save.
    await waitFor(() => expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument());
  });

  it('Save is disabled when review input is empty', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => ''), // empty audio
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    expect(screen.getByTestId('voice-save-btn')).toBeDisabled();
  });

  it('Try again restarts the capture flow (AC: 7)', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => ''),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    await user.click(screen.getByTestId('voice-try-again-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    expect(mockSvc.start).toHaveBeenCalledTimes(2);
  });

  it('Cancel from review dismisses without saving (AC: 4)', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Some task'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    const { onTaskCreated } = setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    await user.click(screen.getByTestId('voice-cancel-btn'));

    expect(taskService.createTask).not.toHaveBeenCalled();
    expect(onTaskCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument();
  });

  it('due date chip renders when dueDate is extracted', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    vi.mocked(dateExtraction.extractDateFromText).mockImplementation((text) => ({
      cleanTitle: 'Buy milk',
      dueDate: '2024-12-25T09:00:00.000Z',
    }));

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Buy milk on Christmas'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();

    await waitFor(() => expect(screen.getByTestId('voice-due-chip')).toBeInTheDocument());
    expect(screen.getByTestId('voice-review-input')).toHaveValue('Buy milk');
  });

  it('due date chip can be dismissed', async () => {
    localStorage.setItem('voice_privacy_notice_seen', '1');

    vi.mocked(dateExtraction.extractDateFromText).mockImplementation(() => ({
      cleanTitle: 'Buy milk',
      dueDate: '2024-12-25T09:00:00.000Z',
    }));

    let capturedCallbacks: Parameters<typeof voiceService.createVoiceCaptureService>[0] | null = null;
    const mockSvc = {
      start: vi.fn(),
      stop: vi.fn(),
      getTranscript: vi.fn(() => 'Buy milk on Christmas'),
      destroy: vi.fn(),
    };
    vi.mocked(voiceService.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });

    const user = userEvent.setup();
    setup();

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());
    capturedCallbacks!.onEnd();
    await waitFor(() => expect(screen.getByTestId('voice-due-chip')).toBeInTheDocument());

    await user.click(screen.getByTestId('voice-due-chip-dismiss'));
    expect(screen.queryByTestId('voice-due-chip')).not.toBeInTheDocument();
  });
});
