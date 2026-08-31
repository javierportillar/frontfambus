import { useEffect, useState } from "react";

export interface DebouncedAction<T> {
  schedule: (value: T) => void;
  cancel: () => void;
}

export function createDebouncedAction<T>(
  callback: (value: T) => void,
  delayMs: number,
): DebouncedAction<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(value) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => callback(value), delayMs);
    },
    cancel() {
      if (timeout) clearTimeout(timeout);
    },
  };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const action = createDebouncedAction(setDebouncedValue, delayMs);
    action.schedule(value);
    return action.cancel;
  }, [delayMs, value]);

  return debouncedValue;
}
