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
