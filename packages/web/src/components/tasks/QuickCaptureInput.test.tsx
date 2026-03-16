import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickCaptureInput } from './QuickCaptureInput.js';
import { useUIStore } from '../../stores/ui.store.js';
import { initDb, MIGRATIONS_SQL } from '../../lib/db.js';
import { TITLE_MAX_LENGTH, TITLE_WARN_LENGTH } from '@todo-app/shared';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function setupTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(MIGRATIONS_SQL);
  initDb(sqlite);
  return sqlite;
}

describe('QuickCaptureInput', () => {
  let sqlite: ReturnType<typeof Database>;

  beforeEach(() => {
    sqlite = setupTestDb();
    // Set a logged-in user in the store
    useUIStore.setState({ currentUserId: TEST_USER_ID });
  });

  afterEach(() => {
    sqlite.close();
    useUIStore.setState({ currentUserId: null });
  });

  it('renders an input field with placeholder text', () => {
    render(<QuickCaptureInput />);
    expect(screen.getByTestId('quick-capture-input')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument();
  });

  it('renders an Add button', () => {
    render(<QuickCaptureInput />);
    expect(screen.getByTestId('quick-capture-submit')).toBeInTheDocument();
  });

  it('Add button is disabled when input is empty', () => {
    render(<QuickCaptureInput />);
    expect(screen.getByTestId('quick-capture-submit')).toBeDisabled();
  });

  it('Add button is enabled when input has text', async () => {
    const user = userEvent.setup();
    render(<QuickCaptureInput />);
    await user.type(screen.getByTestId('quick-capture-input'), 'Buy milk');
    expect(screen.getByTestId('quick-capture-submit')).not.toBeDisabled();
  });

  it('submits task and clears input on Enter key (AC 2, 5)', async () => {
    const user = userEvent.setup();
    const onTaskCreated = vi.fn();
    render(<QuickCaptureInput onTaskCreated={onTaskCreated} />);

    const input = screen.getByTestId('quick-capture-input');
    await user.type(input, 'Buy groceries');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onTaskCreated).toHaveBeenCalledOnce();
      expect(onTaskCreated.mock.calls[0]?.[0]).toMatchObject({ title: 'Buy groceries', status: 'inbox' });
    });

    // AC 5: input clears after save
    expect(input).toHaveValue('');
  });

  it('submits task on Add button click (AC 2)', async () => {
    const user = userEvent.setup();
    const onTaskCreated = vi.fn();
    render(<QuickCaptureInput onTaskCreated={onTaskCreated} />);

    await user.type(screen.getByTestId('quick-capture-input'), 'Walk the dog');
    await user.click(screen.getByTestId('quick-capture-submit'));

    await waitFor(() => {
      expect(onTaskCreated).toHaveBeenCalledOnce();
    });
  });

  it('does not submit on Enter when input is empty', async () => {
    const user = userEvent.setup();
    const onTaskCreated = vi.fn();
    render(<QuickCaptureInput onTaskCreated={onTaskCreated} />);

    await user.keyboard('{Enter}');
    expect(onTaskCreated).not.toHaveBeenCalled();
  });

  describe('character counter (AC 6)', () => {
    it('hides counter below 480 characters', async () => {
      const user = userEvent.setup();
      render(<QuickCaptureInput />);
      await user.type(screen.getByTestId('quick-capture-input'), 'Short title');
      expect(screen.queryByTestId('char-counter')).not.toBeInTheDocument();
    });

    it('shows amber counter at 480 characters', async () => {
      const user = userEvent.setup();
      render(<QuickCaptureInput />);
      await user.type(screen.getByTestId('quick-capture-input'), 'a'.repeat(TITLE_WARN_LENGTH));
      const counter = screen.getByTestId('char-counter');
      expect(counter).toBeInTheDocument();
      expect(counter).toHaveTextContent(`${TITLE_WARN_LENGTH}/${TITLE_MAX_LENGTH}`);
      expect(counter).toHaveClass('text-amber-500');
    });

    it('shows red counter at max length (500)', async () => {
      const user = userEvent.setup();
      render(<QuickCaptureInput />);
      await user.type(screen.getByTestId('quick-capture-input'), 'a'.repeat(TITLE_MAX_LENGTH));
      const counter = screen.getByTestId('char-counter');
      expect(counter).toHaveClass('text-red-500');
    });

    it('disables submit button when over limit (AC 6)', async () => {
      const user = userEvent.setup();
      render(<QuickCaptureInput />);
      // Type 501 chars (input allows +1 over limit so user can see the error)
      await user.type(screen.getByTestId('quick-capture-input'), 'a'.repeat(TITLE_MAX_LENGTH + 1));
      expect(screen.getByTestId('quick-capture-submit')).toBeDisabled();
    });

    it('allows submit at exactly 500 characters', async () => {
      const user = userEvent.setup();
      const onTaskCreated = vi.fn();
      render(<QuickCaptureInput onTaskCreated={onTaskCreated} />);
      await user.type(screen.getByTestId('quick-capture-input'), 'a'.repeat(TITLE_MAX_LENGTH));
      await user.click(screen.getByTestId('quick-capture-submit'));
      await waitFor(() => expect(onTaskCreated).toHaveBeenCalledOnce());
    });
  });

  it('refocuses input after successful submission (AC 5)', async () => {
    const user = userEvent.setup();
    render(<QuickCaptureInput />);
    const input = screen.getByTestId('quick-capture-input');
    await user.type(input, 'Task to focus test');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });
});
