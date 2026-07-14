export interface PromptRequest {
  title: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

type Listener = (request: PromptRequest | null) => void;

let listener: Listener | null = null;

/** Replaces window.prompt(), which Electron's renderer does not support. */
export function requestPrompt(title: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    listener?.({
      title,
      defaultValue,
      resolve: (value) => {
        resolve(value);
        listener?.(null);
      },
    });
  });
}

export function subscribePromptRequests(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
