import { useCallback, useRef, useState } from 'react';
import { TITLE_MAX_LENGTH, TITLE_WARN_LENGTH, type Task } from '@todo-app/shared';
import { createTask } from '../../services/task.service.js';
import { useUIStore } from '../../stores/ui.store.js';

export interface QuickCaptureInputProps {
  /** Called after a task is successfully created */
  onTaskCreated?: (task: Task) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * QuickCaptureInput — single-line task capture component for web/desktop.
 *
 * AC 1: Prominently placed on home screen (Today/Inbox views).
 * AC 2: Enter key or "Add" button saves the task — title is the only required field.
 * AC 5: Input clears and refocuses immediately after save.
 * AC 6: Character counter hidden until 480 chars; amber at 480–499; red + blocked at 500+.
 */
export function QuickCaptureInput({
  onTaskCreated,
  placeholder = 'Add a task…',
  className = '',
}: QuickCaptureInputProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUserId = useUIStore((s) => s.currentUserId);

  const charCount = value.length;
  const isOverLimit = charCount > TITLE_MAX_LENGTH;
  const isNearLimit = charCount >= TITLE_WARN_LENGTH;
  const canSubmit = value.trim().length > 0 && !isOverLimit && !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    if (!currentUserId) {
      setError('Not logged in');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // createTask is synchronous — local DB write completes before this returns (AC 3, 4)
      const task = createTask({ title: value.trim(), user_id: currentUserId });

      // AC 5: clear input and refocus immediately
      setValue('');
      inputRef.current?.focus();

      onTaskCreated?.(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, currentUserId, value, onTaskCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const charCounterColor =
    charCount >= TITLE_MAX_LENGTH ? 'text-red-500' : charCount >= TITLE_WARN_LENGTH ? 'text-amber-500' : '';

  return (
    <div className={`quick-capture ${className}`} data-testid="quick-capture">
      <div className="quick-capture__row">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={TITLE_MAX_LENGTH + 1} // +1 so user can type over the limit (we block submit, not input)
          aria-label="Add a task"
          aria-describedby={isNearLimit ? 'char-counter' : undefined}
          className="quick-capture__input"
          data-testid="quick-capture-input"
          autoComplete="off"
          spellCheck
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label="Add task"
          className="quick-capture__button"
          data-testid="quick-capture-submit"
        >
          Add
        </button>
      </div>

      {/* Character counter — hidden until 480 chars (AC 6) */}
      {isNearLimit && (
        <p
          id="char-counter"
          className={`quick-capture__counter ${charCounterColor}`}
          aria-live="polite"
          data-testid="char-counter"
        >
          {charCount}/{TITLE_MAX_LENGTH}
          {isOverLimit && <span className="quick-capture__counter--over"> — title too long</span>}
        </p>
      )}

      {/* Error state */}
      {error && (
        <p className="quick-capture__error" role="alert" data-testid="quick-capture-error">
          {error}
        </p>
      )}
    </div>
  );
}
