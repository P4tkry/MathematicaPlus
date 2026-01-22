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
export type AiModel =
  | 'gpt-4.1'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-5-mini';

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

export async function getStoredAiModel(): Promise<AiModel> {
  return new Promise((resolve) => {
    chrome.storage.local.get('aiModel', (result) => {
      const model = result?.aiModel;
      resolve(
        model === 'gpt-4o' ||
          model === 'gpt-4o-mini' ||
          model === 'gpt-3.5-turbo-0125' ||
          model === 'gpt-5-mini' ||
          model === 'gpt-4.1'
          ? model
          : 'gpt-4.1'
      );
    });
  });
}

export async function setStoredAiModel(model: AiModel): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ aiModel: model }, () => {
      resolve();
    });
  });
}
