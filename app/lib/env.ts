declare global {
  interface Window {
    __ENV__?: Partial<Record<string, string>>;
  }
}

export const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    return window.__ENV__?.[key] || '';
  }

  return process.env[key] ?? '';
};
