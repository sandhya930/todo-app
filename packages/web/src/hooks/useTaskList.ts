import { useCallback, useEffect, useState } from 'react';
import type { Task } from '@todo-app/shared';
import { getInboxTasks } from '../services/task.service.js';
import { useUIStore } from '../stores/ui.store.js';

/**
 * Hook: returns the current user's Inbox tasks.
 *
 * Reads from local SQLite (offline-first).
 * Exposes a `refresh` callback for optimistic updates after task creation.
 */
export function useInboxTasks() {
  const currentUserId = useUIStore((s) => s.currentUserId);
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = useCallback(() => {
    if (!currentUserId) {
      setTasks([]);
      return;
    }
    setTasks(getInboxTasks(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, refresh };
}
