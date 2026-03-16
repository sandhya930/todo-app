import type { Task } from '@todo-app/shared';
import { QuickCaptureInput } from '../tasks/QuickCaptureInput.js';
import { VoiceCaptureButton } from '../tasks/VoiceCaptureButton.js';
import { useInboxTasks } from '../../hooks/useTaskList.js';

/**
 * Formats a timestamp as a relative time string.
 * "just now" | "2 minutes ago" | "1 hour ago" | "Mar 16"
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TaskCard({ task }: { task: Task }) {
  return (
    <li
      className="task-card"
      data-testid="task-card"
      data-task-id={task.id}
      aria-label={task.title}
    >
      <div className="task-card__checkbox" aria-hidden="true" />
      <div className="task-card__body">
        <span className="task-card__title">{task.title}</span>
        <span className="task-card__meta" data-testid="task-meta">
          <span className="task-card__status">{task.status}</span>
          <span className="task-card__time">{formatRelativeTime(task.created_at)}</span>
          {task.pending_sync && (
            <span
              className="task-card__sync-indicator"
              aria-label="Pending sync"
              title="Waiting to sync"
              data-testid="pending-sync-indicator"
            >
              ↑
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * InboxView — displays captured tasks and the quick-capture input.
 *
 * AC 2, 3: Newly created tasks appear at the top of the Inbox immediately
 *          after save (optimistic update — no wait for network sync).
 * AC 4: Task list populated from local SQLite (offline-first).
 */
export function InboxView() {
  const { tasks, refresh } = useInboxTasks();

  const handleTaskCreated = (_task: Task) => {
    // Refresh the list immediately — task is already in SQLite (AC 3)
    refresh();
  };

  return (
    <div className="inbox-view" data-testid="inbox-view">
      <h1 className="inbox-view__heading">Inbox</h1>

      {/* Quick capture always visible at top of Inbox (AC 1) */}
      <div className="inbox-view__capture-row" data-testid="inbox-capture-row">
        <QuickCaptureInput
          onTaskCreated={handleTaskCreated}
          className="inbox-view__capture"
        />
        {/* Voice capture alongside text input (Story 1.2 AC 1) */}
        <VoiceCaptureButton
          onTaskCreated={handleTaskCreated}
          className="inbox-view__voice"
        />
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="inbox-view__empty" data-testid="inbox-empty">
          <p>Your inbox is empty.</p>
          <p>Capture your first task above.</p>
        </div>
      ) : (
        <ul className="inbox-view__list" aria-label="Inbox tasks" data-testid="inbox-list">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}
