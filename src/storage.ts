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
      resolve(result?.processingMode === 'v1' ? 'v1' : 'v2');
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

export async function getStoredChatRoomId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('chatRoomId', (result) => {
      resolve(result?.chatRoomId || '');
    });
  });
}

export async function setStoredChatRoomId(chatRoomId: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ chatRoomId }, () => {
      resolve();
    });
  });
}

export async function getStoredChatUsername(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('chatUsername', (result) => {
      resolve(result?.chatUsername || '');
    });
  });
}

export async function setStoredChatUsername(chatUsername: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ chatUsername }, () => {
      resolve();
    });
  });
}
