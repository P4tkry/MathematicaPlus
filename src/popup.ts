import { checkURLIfWolframCloud } from './utils.js';

const tokenInput = document.querySelector<HTMLInputElement>('#token');
const chatUsernameInput = document.querySelector<HTMLInputElement>('#chatUsername');
const saveButton = document.querySelector<HTMLButtonElement>('#saveBtn');
const openChatButton = document.querySelector<HTMLButtonElement>('#openChatBtn');
const askAiButton = document.querySelector<HTMLButtonElement>('#askAiBtn');
const statusEl = document.querySelector<HTMLDivElement>('#status');
const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="processingMode"]');

type ProcessingMode = 'v1' | 'v2';

const setModeSelection = (mode: ProcessingMode) => {
  modeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
};

const getSelectedMode = (): ProcessingMode => {
  const selected = Array.from(modeInputs).find((input) => input.checked);
  return selected?.value === 'v2' ? 'v2' : 'v1';
};

const storeProcessingMode = (mode: ProcessingMode): void => {
  chrome.storage.local.set({ processingMode: mode });
};

const showStatus = (message: string, isSuccess: boolean) => {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status ${isSuccess ? 'success' : 'error'}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 3000);
  }
};

const validateToken = (token: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000);

    chrome.runtime.sendMessage({ type: 'validateAccessToken', token }, (response) => {
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        console.error('Token validation error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }

      resolve(response?.status === 'success');
    });
  });

// Load saved token and processing mode on popup open
chrome.storage.local.get(['token', 'processingMode', 'chatUsername'], (result) => {
  if (result?.token && tokenInput) {
    tokenInput.value = result.token;
  }
  if (result?.chatUsername && chatUsernameInput) {
    chatUsernameInput.value = result.chatUsername;
  }

  const savedMode = result?.processingMode === 'v1' ? 'v1' : 'v2';
  setModeSelection(savedMode);

  if (!result?.processingMode) {
    storeProcessingMode(savedMode);
  }
});

modeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    storeProcessingMode(getSelectedMode());
  });
});

// Save button click handler
saveButton?.addEventListener('click', async () => {
  const token = tokenInput?.value?.trim() || '';
  const username = chatUsernameInput?.value?.trim() || '';
  
  if (!token) {
    showStatus('Wprowadź token!', false);
    return;
  }
  if (!username) {
    showStatus('Wpisz nazwę użytkownika!', false);
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Sprawdzam...';
  }

  const isValid = await validateToken(token);

  if (isValid) {
    chrome.storage.local.set({ chatUsername: username }, () => {
      showStatus('✓ Poświadczenia zapisane!', true);
    });
  } else {
    showStatus('✗ Nieprawidłowy token', false);
  }

  if (saveButton) {
    saveButton.disabled = false;
    saveButton.textContent = 'Zapisz poświadczenia';
  }
});

openChatButton?.addEventListener('click', () => {
  if (openChatButton) {
    openChatButton.disabled = true;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id || !activeTab.url || !checkURLIfWolframCloud(activeTab.url)) {
      showStatus('Otworz Wolfram Cloud, aby uruchomic czat.', false);
      if (openChatButton) {
        openChatButton.disabled = false;
      }
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Nie udalo sie uruchomic czatu.', false);
        if (openChatButton) {
          openChatButton.disabled = false;
        }
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, {
        type: "runContentAction",
        action: "chat"
      }, () => {
        if (chrome.runtime.lastError) {
          showStatus('Nie udalo sie wyslac polecenia czatu.', false);
        } else {
          showStatus('Czat uruchomiony.', true);
        }
        if (openChatButton) {
          openChatButton.disabled = false;
        }
      });
    });
  });
});

askAiButton?.addEventListener('click', () => {
  if (askAiButton) {
    askAiButton.disabled = true;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id || !activeTab.url || !checkURLIfWolframCloud(activeTab.url)) {
      showStatus('Otworz Wolfram Cloud, aby uruchomic AI.', false);
      if (askAiButton) {
        askAiButton.disabled = false;
      }
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Nie udalo sie uruchomic AI.', false);
        if (askAiButton) {
          askAiButton.disabled = false;
        }
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, {
        type: "runContentAction",
        action: "ask"
      }, () => {
        if (chrome.runtime.lastError) {
          showStatus('Nie udalo sie wyslac polecenia AI.', false);
        } else {
          showStatus('AI uruchomione.', true);
        }
        if (askAiButton) {
          askAiButton.disabled = false;
        }
      });
    });
  });
});

// Enter key support
tokenInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveButton?.click();
  }
});

