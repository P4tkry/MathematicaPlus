import { runComputeAi, runNotebookAuditV2 } from './contentScriptLogic.js';

const timestamp = new Date().toLocaleTimeString();
console.log(`Content script zaladowany o ${timestamp}`);

 if (!(window as unknown as { __mathematicaListenerAttached?: boolean }).__mathematicaListenerAttached) {
  (window as unknown as { __mathematicaListenerAttached?: boolean }).__mathematicaListenerAttached = true;

  chrome.runtime.onMessage.addListener((request) => {
    if (request?.type !== "runContentAction") {
      return;
    }

  if (request.action === "audit") {
    runNotebookAuditV2();
    return;
  }

    runComputeAi();
  });
}
