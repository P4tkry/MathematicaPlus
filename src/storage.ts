// Chrome storage utilities

export async function getStoredToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('token', (result) => {
      resolve(result?.token || '');
    });
  });
}

export async function setStoredToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ token }, () => {
      resolve();
    });
  });
}

export type ProcessingMode = 'v1' | 'v2';

export async function getStoredProcessingMode(): Promise<ProcessingMode> {
  return new Promise((resolve) => {
    chrome.storage.local.get('processingMode', (result) => {
      resolve(result?.processingMode === 'v2' ? 'v2' : 'v1');
    });
  });
}

export async function setStoredProcessingMode(mode: ProcessingMode): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ processingMode: mode }, () => {
      resolve();
    });
  });
}
