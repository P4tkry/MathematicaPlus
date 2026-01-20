const tokenInput = document.querySelector<HTMLInputElement>('#token');
const saveButton = document.querySelector<HTMLButtonElement>('#saveBtn');
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
chrome.storage.local.get(['token', 'processingMode'], (result) => {
  if (result?.token && tokenInput) {
    tokenInput.value = result.token;
  }

  const savedMode = result?.processingMode === 'v2' ? 'v2' : 'v1';
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
  
  if (!token) {
    showStatus('Wprowadź token!', false);
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Sprawdzam...';
  }

  const isValid = await validateToken(token);

  if (isValid) {
    showStatus('✓ Token zapisany pomyślnie!', true);
  } else {
    showStatus('✗ Nieprawidłowy token', false);
  }

  if (saveButton) {
    saveButton.disabled = false;
    saveButton.textContent = 'Zapisz Token';
  }
});

// Enter key support
tokenInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveButton?.click();
  }
});

