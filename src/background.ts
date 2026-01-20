import { handleValidateAccessToken, handleAiAnswer, handleOneChatGet, handleOneChatSend } from './messageHandlers.js';
import { checkURLIfWolframCloud } from './utils.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Background service worker ready.');
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "validateAccessToken") {
    return handleValidateAccessToken(request, sender, sendResponse);
  }
  if (request.type === "aiAnswer") {
    return handleAiAnswer(request, sender, sendResponse);
  }
  if (request.type === "onechatGet") {
    return handleOneChatGet(request, sender, sendResponse);
  }
  if (request.type === "onechatSend") {
    return handleOneChatSend(request, sender, sendResponse);
  }
});

// Keyboard shortcut listener
chrome.commands.onCommand.addListener(function (command) {
  if (command !== "activate-ai-math" && command !== "audit-notebook-v2" && command !== "open-chat-modal") {
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    if (!activeTab.url || !checkURLIfWolframCloud(activeTab.url)) {
      return;
    }

    // Inject content script file instead of function
    chrome.scripting.executeScript({
      target: { tabId: activeTab.id! },
      files: ['content.js']
    }, () => {
      chrome.tabs.sendMessage(activeTab.id!, {
        type: "runContentAction",
        action: command === "audit-notebook-v2" ? "audit" : command === "open-chat-modal" ? "chat" : "compute"
      });
    });
  });
});
