// Message handlers for background script

import { validateAccessToken, aiOneAnswer } from './api.js';
import { getStoredToken, setStoredToken } from './storage.js';

export function handleValidateAccessToken(
  request: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): boolean {
  console.log("Validating access token in background script...");

  (async () => {
    try {
      const token = request.token ?? "";
      if (!token) {
        sendResponse({ status: "invalid_token" });
        return;
      }

      const isValid = await validateAccessToken(token);
      if (isValid) {
        await setStoredToken(token);
        sendResponse({ status: "success" });
      } else {
        sendResponse({ status: "invalid_token" });
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      sendResponse({ status: "invalid_token" });
    }
  })();

  return true; // keep the message channel open for async sendResponse
}

export function handleAiAnswer(
  request: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): boolean {
  (async () => {
    try {
      const token = await getStoredToken();
      console.log("Received AI answer request with token:", token);
      if (!token) {
        sendResponse({ status: "invalid_token" });
        return;
      }

      const answer = await aiOneAnswer(token, request.model, request.content);
      sendResponse({ status: "success", answer });
    } catch (error) {
      console.error('AI one request failed:', error);
      sendResponse({ status: "error" });
    }
  })();

  return true; // keep the message channel open for async sendResponse
}
