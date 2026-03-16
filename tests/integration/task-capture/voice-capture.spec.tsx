/**
 * Integration Tests — Story 1.2: Voice Task Capture
 *
 * Uses a real in-memory SQLite database. The Web Speech API is mocked
 * (it doesn't exist in jsdom) so tests drive the service callbacks directly.
 */
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxView } from '../../../packages/web/src/components/views/InboxView.js';
import { initDb, MIGRATIONS_SQL } from '../../../packages/web/src/lib/db.js';
import { useUIStore } from '../../../packages/web/src/stores/ui.store.js';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Mock voice service — lets tests inject STT results via capturedCallbacks
// ---------------------------------------------------------------------------

type ServiceCallbacks = Parameters<
  typeof import('../../../packages/web/src/services/voice.service.js').createVoiceCaptureService
>[0];

let capturedCallbacks: ServiceCallbacks | null = null;
const mockSvc = {
  start: vi.fn(),
  stop: vi.fn(),
  getTranscript: vi.fn(() => ''),
  destroy: vi.fn(),
};

vi.mock('../../../packages/web/src/services/voice.service.js', () => ({
  isVoiceCaptureSupported: vi.fn(() => true),
  checkMicPermission: vi.fn(async () => 'granted'),
  requestMicPermission: vi.fn(async () => 'granted'),
  createVoiceCaptureService: vi.fn((cbs: ServiceCallbacks) => {
    capturedCallbacks = cbs;
    return mockSvc;
  }),
}));

import * as voiceServiceMock from '../../../packages/web/src/services/voice.service.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Voice capture integration', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(MIGRATIONS_SQL);
    initDb(sqlite);
    useUIStore.setState({ currentUserId: TEST_USER_ID });

    localStorage.setItem('voice_privacy_notice_seen', '1'); // skip privacy notice
    capturedCallbacks = null;
    vi.clearAllMocks();
    // Re-establish default implementations that clearAllMocks may have wiped
    // (mockResolvedValue calls in individual tests are not One-time so they
    // persist until explicitly reset here).
    vi.mocked(voiceServiceMock.isVoiceCaptureSupported).mockReturnValue(true);
    vi.mocked(voiceServiceMock.checkMicPermission).mockResolvedValue('granted');
    vi.mocked(voiceServiceMock.requestMicPermission).mockResolvedValue('granted');
    vi.mocked(voiceServiceMock.createVoiceCaptureService).mockImplementation((cbs) => {
      capturedCallbacks = cbs;
      return mockSvc;
    });
    mockSvc.getTranscript.mockReturnValue('');
  });

  afterEach(() => {
    sqlite.close();
    useUIStore.setState({ currentUserId: null });
    localStorage.removeItem('voice_privacy_notice_seen');
  });

  it('voice capture → review → save → task appears in Inbox (AC 8)', async () => {
    const user = userEvent.setup();
    render(<InboxView />);

    // Start capture
    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());

    // Simulate STT returning a transcript
    mockSvc.getTranscript.mockReturnValue('Book dentist appointment');
    capturedCallbacks!.onEnd();

    // Review screen should appear with transcript
    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());
    expect(screen.getByTestId('voice-review-input')).toHaveValue('Book dentist appointment');

    // Save the task
    await user.click(screen.getByTestId('voice-save-btn'));

    // Task should appear in Inbox list
    await waitFor(() => {
      expect(screen.getByTestId('inbox-list')).toBeInTheDocument();
    });
    expect(screen.getByText('Book dentist appointment')).toBeInTheDocument();

    // Voice capture returns to idle
    expect(screen.getByTestId('voice-capture-mic-btn')).toBeInTheDocument();
  });

  it('empty transcript shows review with disabled Save and Try again button (AC 7)', async () => {
    const user = userEvent.setup();
    render(<InboxView />);

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());

    // End with empty transcript
    mockSvc.getTranscript.mockReturnValue('');
    capturedCallbacks!.onEnd();

    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());
    expect(screen.getByTestId('voice-save-btn')).toBeDisabled();
    expect(screen.getByTestId('voice-try-again-btn')).toBeInTheDocument();
  });

  it('permission denied → explanation modal shown, no crash (AC 6)', async () => {
    const voiceService = await import(
      '../../../packages/web/src/services/voice.service.js'
    );
    vi.mocked(voiceService.checkMicPermission).mockResolvedValue('denied');

    const user = userEvent.setup();
    render(<InboxView />);

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('voice-permission-denied')).toBeInTheDocument(),
    );
    // App does not crash; settings link is present
    expect(screen.getByTestId('voice-open-settings-link')).toBeInTheDocument();
  });

  it('user can edit transcript before saving (AC 4)', async () => {
    const user = userEvent.setup();
    render(<InboxView />);

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());

    mockSvc.getTranscript.mockReturnValue('Buy groceries');
    capturedCallbacks!.onEnd();

    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());

    const input = screen.getByTestId('voice-review-input');
    await user.clear(input);
    await user.type(input, 'Buy oat milk');
    await user.click(screen.getByTestId('voice-save-btn'));

    await waitFor(() =>
      expect(screen.getByText('Buy oat milk')).toBeInTheDocument(),
    );
  });

  it('task saved via voice uses same createTask path as Story 1.1 (AC 8)', async () => {
    const user = userEvent.setup();
    render(<InboxView />);

    await user.click(screen.getByTestId('voice-capture-mic-btn'));
    await waitFor(() => expect(screen.getByTestId('voice-recording')).toBeInTheDocument());

    mockSvc.getTranscript.mockReturnValue('Voice task');
    capturedCallbacks!.onEnd();

    await waitFor(() => expect(screen.getByTestId('voice-review')).toBeInTheDocument());
    await user.click(screen.getByTestId('voice-save-btn'));

    await waitFor(() => {
      const cards = screen.getAllByTestId('task-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    // Task card must have a valid task-id (persisted to DB)
    const card = screen.getAllByTestId('task-card')[0]!;
    expect(card.getAttribute('data-task-id')).toBeTruthy();
  });
});
