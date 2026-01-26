// Content script logic for processing Math+ directives
import katex from 'katex';
import katexStyles from 'katex/dist/katex.min.css';
import {
  getStoredProcessingMode,
  getStoredChatRoomId,
  setStoredChatRoomId,
  getStoredChatUsername,
  getStoredToken,
  getStoredAiModel,
  setStoredAiModel,
  type AiModel
} from './storage.js';

interface Directive {
  directive: string;
  object: HTMLElement;
  content: string;
}

export function getAllMathPlusDirectives(): Directive[] {
  const notebookDiv = document.querySelector('.notebook');
  if (!notebookDiv) {
    console.error("Nie znaleziono div'a notebook");
    return [];
  }

  const spans: NodeListOf<HTMLSpanElement> = notebookDiv.querySelectorAll('span');
  const mathSpans: HTMLSpanElement[] = [];
  const wolframSpans: HTMLSpanElement[] = [];
  const explainSpans: HTMLSpanElement[] = [];
  const mathMatches: string[] = [];
  const wolframMatches: string[] = [];
  const explainMatches: string[] = [];

  const directives: Directive[] = [];

  // Find all strings [Math: ...], [Wolfram: ...], [Explain: ...]
  const notebookText = getNotebookCells().join(' ');
  const mathRegex = /\[\s*Math\s*:\s*(.*?)\]/g;
  const wolframRegex = /\[\s*Wolfram\s*:\s*(.*?)\]/g;
  const explainRegex = /\[\s*Explain\s*:\s*(.*?)\]/g;
  
  let match;
  while ((match = mathRegex.exec(notebookText)) !== null) {
    mathMatches.push(match[1].trim());
  }

  while ((match = wolframRegex.exec(notebookText)) !== null) {
    wolframMatches.push(match[1].trim());
  }
  
  while ((match = explainRegex.exec(notebookText)) !== null) {
    explainMatches.push(match[1].trim());
  }

  spans.forEach((span: HTMLSpanElement) => {
    if (span.textContent) {
      if (span.textContent.includes("Math")) {
        mathSpans.push(span);
      }
      if (span.textContent.includes("Wolfram")) {
        wolframSpans.push(span);
      }
      if (span.textContent.includes("Explain")) {
        explainSpans.push(span);
      }
    }
  });

  mathMatches.forEach((content, index) => {
    directives.push({ directive: "Math", object: mathSpans[index], content: content });
  });

  wolframMatches.forEach((content, index) => {
    directives.push({ directive: "Wolfram", object: wolframSpans[index], content: content });
  });
  
  explainMatches.forEach((content, index) => {
    directives.push({ directive: "Explain", object: explainSpans[index], content: content });
  });

  return directives;
}

export async function fetchAIResponse(prompt: string, model: AiModel = 'gpt-4.1'): Promise<string | null> {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "aiAnswer", model, content: prompt }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('AI request error:', chrome.runtime.lastError.message);
        resolve({ status: "error" });
        return;
      }
      resolve(response);
    });
  });
  
  if (response && (response as { status: string }).status === "success") {
    return (response as { status: string; answer?: string }).answer || null;
  } else {
    return null;
  }
}

// Show error popup in bottom left corner
function showErrorPopup(message: string = "Mathematica+ error"): void {
  // Check if error popup already exists
  if (document.querySelector('#mathematica-error-popup')) {
    return;
  }

  const errorDiv = document.createElement('div');
  errorDiv.id = 'mathematica-error-popup';
  errorDiv.textContent = message;

  // Styling
  errorDiv.style.position = 'fixed';
  errorDiv.style.bottom = '10px';
  errorDiv.style.left = '10px';
  errorDiv.style.backgroundColor = '#f8d7da';
  errorDiv.style.color = '#721c24';
  errorDiv.style.border = '1px solid #f5c6cb';
  errorDiv.style.borderRadius = '5px';
  errorDiv.style.padding = '8px 12px';
  errorDiv.style.fontSize = '14px';
  errorDiv.style.zIndex = '10000';
  errorDiv.style.boxShadow = '0px 4px 6px rgba(0, 0, 0, 0.1)';
  errorDiv.style.transition = 'opacity 0.5s';

  document.body.appendChild(errorDiv);

  // Auto-remove after 5 seconds with fade out
  setTimeout(() => {
    errorDiv.style.opacity = '0';
    setTimeout(() => {
      errorDiv.remove();
    }, 500);
  }, 5000);
}

function attachEscapeClose(close: () => void): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', handler, true);
  return () => {
    document.removeEventListener('keydown', handler, true);
  };
}

async function ensureCredentials(): Promise<boolean> {
  const [token, username] = await Promise.all([getStoredToken(), getStoredChatUsername()]);
  if (!token || !username) {
    showErrorPopup("Brak poswiadczen. Ustaw token i nazwe uzytkownika w oknie wtyczki.");
    return false;
  }
  return true;
}

// Show loading spinner in bottom left corner
function showLoadingSpinner(): void {
  if (document.querySelector('#mathematica-loading-spinner')) {
    return;
  }

  const spinner = document.createElement('div');
  spinner.id = 'mathematica-loading-spinner';
  spinner.style.position = 'fixed';
  spinner.style.bottom = '10px';
  spinner.style.left = '10px';
  spinner.style.width = '18px';
  spinner.style.height = '18px';
  spinner.style.border = '3px solid #ddd';
  spinner.style.borderTopColor = '#DD1100';
  spinner.style.borderRadius = '50%';
  spinner.style.zIndex = '10000';
  spinner.style.animation = 'mathematica-spin 0.9s linear infinite';

  if (!document.querySelector('#mathematica-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'mathematica-spinner-style';
    style.textContent = '@keyframes mathematica-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  document.body.appendChild(spinner);
}

function hideLoadingSpinner(): void {
  const spinner = document.querySelector('#mathematica-loading-spinner');
  if (spinner) {
    spinner.remove();
  }
}

// Render LaTeX in text without running Markdown inside math blocks
function renderLatex(text: string): string {
  const tokens: Array<{ token: string; tex: string; display: boolean }> = [];
  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '$') {
      const isDisplay = text[i + 1] === '$';
      const start = i + (isDisplay ? 2 : 1);
      const end = isDisplay ? text.indexOf('$$', start) : text.indexOf('$', start);
      if (end !== -1) {
        const tex = text.slice(start, end);
        const token = `__MATH_${tokens.length}__`;
        tokens.push({ token, tex, display: isDisplay });
        result += token;
        i = end + (isDisplay ? 2 : 1);
        continue;
      }
    }
    result += text[i];
    i += 1;
  }

  let rendered = renderMarkdown(result);

  for (const item of tokens) {
    let replacement = item.token;
    try {
      replacement = katex.renderToString(item.tex.trim(), { displayMode: item.display, throwOnError: false });
    } catch (e) {
      replacement = item.display ? `$$${item.tex}$$` : `$${item.tex}$`;
    }
    rendered = rendered.replace(item.token, replacement);
  }

  return rendered;
}

function renderMarkdown(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const output: string[] = [];
  let inList = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        output.push('</ul>');
        inList = false;
      }
      const level = headingMatch[1].length;
      output.push(`<div class="md-h md-h${level}">${headingMatch[2].trim()}</div>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        output.push('<ul class="md-list">');
        inList = true;
      }
      output.push(`<li>${listMatch[1].trim()}</li>`);
      continue;
    }

    if (inList) {
      output.push('</ul>');
      inList = false;
    }

    if (line.trim().length === 0) {
      output.push('<div class="md-line md-line-empty"></div>');
    } else {
      output.push(`<div class="md-line">${line}</div>`);
    }
  }

  if (inList) {
    output.push('</ul>');
  }

  let result = output.join('');
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return result;
}

export async function createResponsePopup(response: string, targetElement: HTMLElement): Promise<void> {
  const scroller = document.querySelector('.scroller');
  if (!scroller) {
    console.error('Nie znaleziono scrollera');
    return;
  }

  // Inject KaTeX CSS if not already present
  if (!document.querySelector('#katex-css')) {
    const style = document.createElement('style');
    style.id = 'katex-css';
    // Fix font paths to point to local fonts
    const cssWithLocalFonts = katexStyles.replace(/fonts\//g, chrome.runtime.getURL('fonts/'));
    // Add custom font size for KaTeX elements
    style.textContent = cssWithLocalFonts + '\n.katex-display { font-size: 10px !important; }';
    document.head.appendChild(style);
  }

  ensureMarkdownStyles();

// Create popup container
const popup = document.createElement('div');
popup.style.position = 'absolute';
popup.style.backgroundColor = 'white';
popup.style.maxWidth = '500px';
popup.style.zIndex = '9999';
popup.style.padding = '2px';
popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
popup.style.borderRadius = '6px';
popup.style.paddingRight = '8px';

// Create close button
const closeBtn = document.createElement('button');
closeBtn.innerHTML = '✕';
closeBtn.style.position = 'absolute';
closeBtn.style.top = '6px';
closeBtn.style.right = '6px';
closeBtn.style.border = 'none';
closeBtn.style.background = 'transparent';
closeBtn.style.fontSize = '5px';

  let detachEscape: (() => void) | null = null;
  const closePopup = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    popup.remove();
  };

// Close popup on click
closeBtn.addEventListener('click', closePopup);
  detachEscape = attachEscapeClose(closePopup);

// Render LaTeX if available
const renderedContent = renderLatex(response);

// Insert content
popup.innerHTML = renderedContent;
popup.appendChild(closeBtn);

// Position popup relative to scroller
const targetRect = targetElement.getBoundingClientRect();
const scrollerRect = scroller.getBoundingClientRect();

const topPosition = targetRect.top - scrollerRect.top + scroller.scrollTop;
const leftPosition = targetRect.left - scrollerRect.left + scroller.scrollLeft;

popup.style.top = `${topPosition}px`;
popup.style.left = `${leftPosition}px`;

scroller.appendChild(popup);



}

interface ModalItem {
  directive: string;
  content: string;
  response: string;
}

interface AuditErrorItem {
  error: string;
  current: string;
  fix: string;
  explanation: string;
}

interface OneChatMessage {
  username: string;
  content: string;
  timestamp: string;
}

interface ChatPayload {
  type: string;
  content: string;
}

const allowedAiModels: AiModel[] = [
  'gpt-4.1',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-3.5-turbo-0125',
  'gpt-5-mini'
];

function buildAuditBody(item: AuditErrorItem): string {
  const error = renderLatex(item.error || "-");
  const current = renderLatex(item.current || "-");
  const fix = renderLatex(item.fix || "-");
  const explanation = renderLatex(item.explanation || "-");

  return [
    `<div class="audit-section">`,
    `<div class="audit-label">Blad</div>`,
    `<div class="audit-body">${error}</div>`,
    `</div>`,
    `<div class="audit-section">`,
    `<div class="audit-label">Obecnie</div>`,
    `<div class="audit-body audit-muted">${current}</div>`,
    `</div>`,
    `<div class="audit-section">`,
    `<div class="audit-label">Jak poprawic</div>`,
    `<div class="audit-body audit-fix">${fix}</div>`,
    `</div>`,
    `<div class="audit-section">`,
    `<div class="audit-label">Wyjasnienie</div>`,
    `<div class="audit-body">${explanation}</div>`,
    `</div>`
  ].join('');
}

function buildResultBody(item: ModalItem): string {
  const response = renderLatex(item.response || "-");

  return [
    `<div class="result-card">`,
    `<div class="result-label">Odpowiedz</div>`,
    `<div class="result-body">${response}</div>`,
    `</div>`
  ].join('');
}

function createAskAiModal(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'mathematica-ask-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  overlay.style.zIndex = '10000';
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '12px';
  modal.style.maxWidth = '680px';
  modal.style.width = '92%';
  modal.style.border = '1px solid #e6e6e6';
  modal.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.18)';
  modal.style.padding = '16px 18px 14px';
  modal.style.position = 'relative';
  modal.style.fontSize = '14px';
  modal.style.color = '#222';
  modal.style.pointerEvents = 'auto';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.gap = '10px';
  modal.style.maxHeight = '80vh';
  modal.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '6px';
  header.style.borderBottom = '1px solid #eee';

  const title = document.createElement('div');
  title.textContent = 'Pytanie do AI';
  title.style.fontWeight = 'bold';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '14px';

  let detachEscape: (() => void) | null = null;
  const closeModal = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    overlay.remove();
    document.removeEventListener('mousedown', handleOutsideClick, true);
  };

  closeBtn.addEventListener('click', closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const modelRow = document.createElement('div');
  modelRow.style.display = 'flex';
  modelRow.style.alignItems = 'center';
  modelRow.style.gap = '10px';

  const modelLabel = document.createElement('div');
  modelLabel.textContent = 'Model';
  modelLabel.style.fontSize = '12px';
  modelLabel.style.color = '#444';
  modelLabel.style.minWidth = '46px';

  const modelSelect = document.createElement('select');
  modelSelect.id = 'mathematica-ask-model';
  modelSelect.style.flex = '1';
  modelSelect.style.padding = '8px 10px';
  modelSelect.style.border = '1px solid #ddd';
  modelSelect.style.borderRadius = '8px';
  modelSelect.style.fontSize = '13px';

  for (const model of allowedAiModels) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  }

  modelRow.appendChild(modelLabel);
  modelRow.appendChild(modelSelect);

  const input = document.createElement('textarea');
  input.id = 'mathematica-ask-input';
  input.placeholder = 'Wpisz pytanie...';
  input.rows = 4;
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '10px 12px';
  input.style.border = '1px solid #ddd';
  input.style.borderRadius = '10px';
  input.style.fontSize = '13px';
  input.style.resize = 'vertical';

  const hint = document.createElement('div');
  hint.textContent = 'Ctrl+Enter — wyslij';
  hint.style.fontSize = '11px';
  hint.style.color = '#666';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'space-between';
  actions.style.alignItems = 'center';
  actions.style.gap = '8px';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'mathematica-ask-send';
  sendBtn.textContent = 'Zapytaj';
  sendBtn.style.padding = '8px 12px';
  sendBtn.style.border = '1px solid #f4b9a6';
  sendBtn.style.background = '#ffefe9';
  sendBtn.style.color = '#9a3412';
  sendBtn.style.borderRadius = '8px';

  actions.appendChild(hint);
  actions.appendChild(sendBtn);

  const responseWrap = document.createElement('div');
  responseWrap.id = 'mathematica-ask-response';
  responseWrap.style.maxHeight = '45vh';
  responseWrap.style.overflowY = 'auto';
  responseWrap.style.border = '1px solid #eee';
  responseWrap.style.borderRadius = '10px';
  responseWrap.style.padding = '10px 12px';
  responseWrap.style.background = '#fafafa';

  modal.appendChild(header);
  modal.appendChild(modelRow);
  modal.appendChild(input);
  modal.appendChild(actions);
  modal.appendChild(responseWrap);
  overlay.appendChild(modal);

  const handleOutsideClick = (event: MouseEvent) => {
    if (!modal.contains(event.target as Node)) {
      closeModal();
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);
  detachEscape = attachEscapeClose(closeModal);

  return overlay;
}

export async function runAskAiModal(): Promise<void> {
  if (!(await ensureCredentials())) {
    return;
  }

  const existingOverlay = document.querySelector('#mathematica-ask-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  ensureKatexStyles();
  ensureMarkdownStyles();
  ensureResultStyles();

  const overlay = createAskAiModal();
  const input = overlay.querySelector('#mathematica-ask-input') as HTMLTextAreaElement | null;
  const sendBtn = overlay.querySelector('#mathematica-ask-send') as HTMLButtonElement | null;
  const responseWrap = overlay.querySelector('#mathematica-ask-response') as HTMLDivElement | null;
  const modelSelect = overlay.querySelector('#mathematica-ask-model') as HTMLSelectElement | null;

  if (!input || !sendBtn || !responseWrap || !modelSelect) {
    return;
  }

  const storedModel = await getStoredAiModel();
  modelSelect.value = storedModel;
  modelSelect.addEventListener('change', () => {
    const value = modelSelect.value as AiModel;
    setStoredAiModel(value);
  });

  const setResponse = (text: string) => {
    responseWrap.innerHTML = buildResultBody({ directive: 'Ask', content: input.value.trim(), response: text });
  };

  const handleSend = async () => {
    const question = input.value.trim();
    if (!question) {
      showErrorPopup('Wpisz pytanie.');
      return;
    }
    sendBtn.disabled = true;
    const originalLabel = sendBtn.textContent;
    sendBtn.textContent = 'Generowanie...';
    setResponse('Generowanie odpowiedzi...');
    const selectedModel = (modelSelect.value as AiModel) || 'gpt-4.1';
    const prompt = [
      question,
      "",
      "Zawsze zapisuj wzory LaTeX tylko jako $...$ (inline) lub $$...$$ (display). Nie używaj \\( \\) ani \\[ \\]."
    ].join('\n');
    const response = await fetchAIResponse(prompt, selectedModel);
    sendBtn.disabled = false;
    sendBtn.textContent = originalLabel || 'Zapytaj';
    setResponse(response || 'Błąd podczas pobierania odpowiedzi AI');
  };

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      handleSend();
    }
  });

  document.body.appendChild(overlay);
  input.focus();
}

function createAuditModal(title: string, bodyHtml: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'mathematica-audit-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  overlay.style.zIndex = '10000';
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '10px';
  modal.style.maxWidth = '600px';
  modal.style.width = '90%';
  modal.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.2)';
  modal.style.padding = '16px 18px 14px';
  modal.style.position = 'relative';
  modal.style.fontSize = '14px';
  modal.style.color = '#222';
  modal.style.pointerEvents = 'auto';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.fontWeight = 'bold';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '14px';
  let detachEscape: (() => void) | null = null;
  const closeModal = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    overlay.remove();
    document.removeEventListener('mousedown', handleOutsideClick, true);
  };

  closeBtn.addEventListener('click', closeModal);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.style.maxHeight = '60vh';
  content.style.overflowY = 'auto';
  content.innerHTML = bodyHtml;

  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);

  const handleOutsideClick = (event: MouseEvent) => {
    if (!modal.contains(event.target as Node)) {
      closeModal();
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);
  detachEscape = attachEscapeClose(closeModal);

  return overlay;
}

function buildAuditModalCarousel(items: AuditErrorItem[]): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'mathematica-audit-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  overlay.style.zIndex = '10000';
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '10px';
  modal.style.maxWidth = '600px';
  modal.style.width = '90%';
  modal.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.2)';
  modal.style.padding = '16px 18px 14px';
  modal.style.position = 'relative';
  modal.style.fontSize = '14px';
  modal.style.color = '#222';
  modal.style.pointerEvents = 'auto';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const titleEl = document.createElement('div');
  titleEl.textContent = 'Wolfram - Audit';
  titleEl.style.fontWeight = 'bold';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '14px';
  let detachEscape: (() => void) | null = null;
  const closeModal = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    overlay.remove();
    document.removeEventListener('mousedown', handleOutsideClick, true);
  };

  closeBtn.addEventListener('click', closeModal);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const meta = document.createElement('div');
  meta.style.fontSize = '12px';
  meta.style.color = '#666';
  meta.style.marginBottom = '10px';

  const content = document.createElement('div');
  content.style.maxHeight = '60vh';
  content.style.overflowY = 'auto';

  const nav = document.createElement('div');
  nav.style.display = 'flex';
  nav.style.justifyContent = 'space-between';
  nav.style.alignItems = 'center';
  nav.style.marginTop = '12px';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Poprzedni';
  prevBtn.style.padding = '6px 10px';
  prevBtn.style.border = '1px solid #ccc';
  prevBtn.style.background = '#f5f5f5';
  prevBtn.style.borderRadius = '6px';

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Następny';
  nextBtn.style.padding = '6px 10px';
  nextBtn.style.border = '1px solid #ccc';
  nextBtn.style.background = '#f5f5f5';
  nextBtn.style.borderRadius = '6px';

  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);

  modal.appendChild(header);
  modal.appendChild(meta);
  modal.appendChild(content);
  modal.appendChild(nav);
  overlay.appendChild(modal);

  let currentIndex = 0;

  const renderItem = (index: number) => {
    const item = items[index];
    meta.textContent = `Blad ${index + 1} z ${items.length}`;
    content.innerHTML = buildAuditBody(item);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
  };

  prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderItem(currentIndex);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentIndex < items.length - 1) {
      currentIndex += 1;
      renderItem(currentIndex);
    }
  });

  const handleOutsideClick = (event: MouseEvent) => {
    if (!modal.contains(event.target as Node)) {
      closeModal();
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);
  detachEscape = attachEscapeClose(closeModal);

  renderItem(currentIndex);

  const existingOverlay = document.querySelector('#mathematica-audit-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  return overlay;
}

function ensureKatexStyles(): void {
  if (!document.querySelector('#katex-css')) {
    const style = document.createElement('style');
    style.id = 'katex-css';
    const cssWithLocalFonts = katexStyles.replace(/fonts\//g, chrome.runtime.getURL('fonts/'));
    style.textContent = cssWithLocalFonts + '\n.katex-display { font-size: 14px !important; }';
    document.head.appendChild(style);
  }
}

function ensureMarkdownStyles(): void {
  if (document.querySelector('#mathematica-markdown-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mathematica-markdown-style';
  style.textContent =
    '.md-h { font-weight: 700; margin: 6px 0 4px; }' +
    '.md-h1 { font-size: 16px; }' +
    '.md-h2 { font-size: 15px; }' +
    '.md-h3 { font-size: 14px; }' +
    '.md-h4 { font-size: 13px; }' +
    '.md-h5 { font-size: 12px; }' +
    '.md-h6 { font-size: 12px; }' +
    '.md-line { margin: 2px 0; }' +
    '.md-line-empty { margin: 6px 0; }' +
    '.md-list { margin: 6px 0 6px 18px; padding: 0; }' +
    '.md-list li { margin: 2px 0; }';
  document.head.appendChild(style);
}

function ensureAuditStyles(): void {
  if (document.querySelector('#mathematica-audit-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mathematica-audit-style';
  style.textContent =
    '.audit-section { margin: 10px 0; padding: 8px 10px; border-radius: 8px; background: #f8f8f8; }' +
    '.audit-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px; }' +
    '.audit-body { font-size: 14px; color: #222; line-height: 1.4; }' +
    '.audit-muted { background: #ffffff; border: 1px solid #eee; padding: 6px 8px; border-radius: 6px; }' +
    '.audit-fix { background: #f0f8ff; border: 1px solid #dbeafe; padding: 6px 8px; border-radius: 6px; }';
  document.head.appendChild(style);
}

function ensureResultStyles(): void {
  if (document.querySelector('#mathematica-result-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mathematica-result-style';
  style.textContent =
    '.result-card { margin: 10px 0; padding: 10px 12px; border-radius: 10px; background: #f8f8f8; border: 1px solid #eeeeee; }' +
    '.result-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 6px; }' +
    '.result-body { font-size: 14px; color: #222; line-height: 1.5; background: #ffffff; border: 1px solid #f0f0f0; border-radius: 8px; padding: 8px 10px; }';
  document.head.appendChild(style);
}

function createChatModalContainer(onClose?: () => void): { overlay: HTMLElement; close: () => void; leaveRoomBtn: HTMLButtonElement } {
  const overlay = document.createElement('div');
  overlay.id = 'mathematica-chat-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  overlay.style.zIndex = '10000';
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '14px';
  modal.style.maxWidth = '780px';
  modal.style.width = '92%';
  modal.style.border = '1px solid #e6e6e6';
  modal.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.18)';
  modal.style.padding = '16px 18px 16px';
  modal.style.position = 'relative';
  modal.style.fontSize = '14px';
  modal.style.color = '#222';
  modal.style.pointerEvents = 'auto';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.gap = '10px';
  modal.style.maxHeight = '80vh';
  modal.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.paddingBottom = '6px';
  header.style.borderBottom = '1px solid #eee';
  header.style.background = 'linear-gradient(90deg, #fff7ed, #ffffff)';
  header.style.margin = '-16px -18px 8px';
  header.style.padding = '12px 18px';
  header.style.gap = '10px';

  const leftHeader = document.createElement('div');
  leftHeader.style.display = 'flex';
  leftHeader.style.alignItems = 'center';
  leftHeader.style.gap = '10px';

  const leaveRoomBtn = document.createElement('button');
  leaveRoomBtn.textContent = '⤺ Opuść pokój';
  leaveRoomBtn.style.padding = '6px 10px';
  leaveRoomBtn.style.border = '1px solid #e5e7eb';
  leaveRoomBtn.style.background = '#ffffff';
  leaveRoomBtn.style.borderRadius = '6px';
  leaveRoomBtn.style.fontSize = '12px';
  leaveRoomBtn.style.color = '#6b7280';

  const title = document.createElement('div');
  title.textContent = 'MathematicaPlus inChat';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '15px';
  title.style.color = '#111827';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '14px';

  leftHeader.appendChild(leaveRoomBtn);
  leftHeader.appendChild(title);
  header.appendChild(leftHeader);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.id = 'mathematica-chat-content';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '10px';
  content.style.padding = '0 2px 2px';

  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);

  let detachEscape: (() => void) | null = null;
  const close = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    if (onClose) {
      onClose();
    }
    overlay.remove();
    document.removeEventListener('mousedown', handleOutsideClick, true);
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (!modal.contains(event.target as Node)) {
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  document.addEventListener('mousedown', handleOutsideClick, true);
  detachEscape = attachEscapeClose(close);

  return { overlay, close, leaveRoomBtn };
}

async function oneChatGet(roomId: string): Promise<OneChatMessage[]> {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "onechatGet", roomId }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ status: "error" });
        return;
      }
      resolve(response);
    });
  });

  if (response && (response as { status: string }).status === "success") {
    const data = (response as { status: string; data?: { messages?: OneChatMessage[] } }).data;
    return Array.isArray(data?.messages) ? data!.messages! : [];
  }

  return [];
}

async function oneChatSend(roomId: string, username: string, message: string): Promise<boolean> {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "onechatSend", roomId, username, content: message }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ status: "error" });
        return;
      }
      resolve(response);
    });
  });

  return response && (response as { status: string }).status === "success";
}

function formatChatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function parseChatPayload(raw: string): ChatPayload | null {
  try {
    const parsed = JSON.parse(raw) as ChatPayload;
    if (parsed && typeof parsed.type === 'string' && typeof parsed.content === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function renderChatMessages(
  container: HTMLElement,
  messages: OneChatMessage[],
  currentUsername: string,
  onJoinRoom?: (roomName: string) => void
): void {
  container.innerHTML = '';
  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'Brak wiadomosci.';
    empty.style.color = '#666';
    empty.style.fontSize = '13px';
    container.appendChild(empty);
    return;
  }

  for (const msg of messages) {
    const isSelf = currentUsername && msg.username === currentUsername;
    const item = document.createElement('div');
    item.style.alignSelf = isSelf ? 'flex-end' : 'flex-start';
    item.style.maxWidth = '85%';
    item.style.padding = '9px 11px';
    item.style.border = '1px solid #e8e8e8';
    item.style.borderRadius = '12px';
    item.style.background = isSelf ? '#fff1eb' : '#f8fafc';
    item.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)';
    item.style.display = 'flex';
    item.style.gap = '8px';
    item.style.alignItems = 'flex-start';

    const getInitials = (username: string): string => {
      const parts = username.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
      }
      const word = parts[0] ?? '';
      return word.slice(0, 2).toUpperCase();
    };

    const getAvatarColor = (username: string): string => {
      let hash = 2166136261;
      for (let i = 0; i < username.length; i += 1) {
        hash ^= username.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const hue = Math.abs(hash) % 360;
      const sat = 55 + (Math.abs(hash >> 8) % 25);
      const light = 70 + (Math.abs(hash >> 16) % 16);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    };

    const avatar = document.createElement('div');
    avatar.textContent = getInitials(msg.username || '?');
    avatar.style.width = '28px';
    avatar.style.height = '28px';
    avatar.style.borderRadius = '999px';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.fontSize = '11px';
    avatar.style.fontWeight = '600';
    avatar.style.color = '#111827';
    avatar.style.background = getAvatarColor(msg.username || '');
    avatar.style.flex = '0 0 auto';

    const contentWrap = document.createElement('div');
    contentWrap.style.display = 'flex';
    contentWrap.style.flexDirection = 'column';
    contentWrap.style.gap = '4px';

    const meta = document.createElement('div');
    meta.textContent = `${msg.username} • ${formatChatTimestamp(msg.timestamp)}`;
    meta.style.fontSize = '11px';
    meta.style.color = '#666';
    meta.style.marginBottom = '4px';

    const payload = parseChatPayload(msg.content);

    const body = document.createElement('div');
    body.style.fontSize = '14px';
    body.style.whiteSpace = 'pre-wrap';

    const buildCodeBlock = (code: string): HTMLElement => {
      const codeBox = document.createElement('pre');
      codeBox.textContent = code;
      codeBox.style.margin = '0';
      codeBox.style.padding = '28px 36px 10px 12px';
      codeBox.style.background = '#ffffff';
      codeBox.style.color = '#111827';
      codeBox.style.borderRadius = '8px';
      codeBox.style.fontSize = '12px';
      codeBox.style.lineHeight = '1.45';
      codeBox.style.whiteSpace = 'pre-wrap';
      codeBox.style.fontFamily = 'Consolas, "Courier New", monospace';

      const codeWrap = document.createElement('div');
      codeWrap.style.position = 'relative';
      codeWrap.style.display = 'block';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.setAttribute('aria-label', 'Kopiuj kod');
      copyBtn.textContent = '📋';
      copyBtn.style.position = 'absolute';
      copyBtn.style.top = '8px';
      copyBtn.style.right = '8px';
      copyBtn.style.border = '1px solid #e5e7eb';
      copyBtn.style.background = '#ffffff';
      copyBtn.style.color = '#111827';
      copyBtn.style.borderRadius = '6px';
      copyBtn.style.fontSize = '12px';
      copyBtn.style.padding = '2px 6px';
      copyBtn.style.cursor = 'pointer';
      copyBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';

      const copyText = async () => {
        try {
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = '✓';
          setTimeout(() => {
            copyBtn.textContent = '📋';
          }, 1200);
        } catch (error) {
          console.error('Copy failed:', error);
        }
      };

      copyBtn.addEventListener('click', () => {
        void copyText();
      });

      codeWrap.appendChild(codeBox);
      codeWrap.appendChild(copyBtn);
      return codeWrap;
    };

    const renderTextWithCodeFences = (text: string): void => {
      const parts: Array<{ type: 'text' | 'code'; value: string }> = [];
      const regex = /```([\s\S]*?)```/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'code', value: match[1] });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push({ type: 'text', value: text.slice(lastIndex) });
      }

      const renderTextWithChatLinks = (value: string, containerEl: HTMLElement): void => {
        const chatRegex = /\[\s*Chat\s*->\s*([^\]]+)\s*\]/g;
        let textIndex = 0;
        let chatMatch: RegExpExecArray | null;
        while ((chatMatch = chatRegex.exec(value)) !== null) {
          if (chatMatch.index > textIndex) {
            const textNode = document.createElement('span');
            textNode.textContent = value.slice(textIndex, chatMatch.index);
            containerEl.appendChild(textNode);
          }
          const roomName = chatMatch[1].trim();
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `Chat → ${roomName}`;
          button.style.margin = '0 4px';
          button.style.padding = '3px 8px';
          button.style.border = '1px solid #f4b9a6';
          button.style.background = '#ffefe9';
          button.style.color = '#9a3412';
          button.style.borderRadius = '999px';
          button.style.fontSize = '12px';
          button.style.cursor = 'pointer';
          if (onJoinRoom) {
            button.addEventListener('click', () => {
              onJoinRoom(roomName);
            });
          } else {
            button.disabled = true;
            button.style.opacity = '0.6';
            button.style.cursor = 'not-allowed';
          }
          containerEl.appendChild(button);
          textIndex = chatMatch.index + chatMatch[0].length;
        }
        if (textIndex < value.length) {
          const textNode = document.createElement('span');
          textNode.textContent = value.slice(textIndex);
          containerEl.appendChild(textNode);
        }
      };

      for (const part of parts) {
        if (part.type === 'code') {
          body.appendChild(buildCodeBlock(part.value.trim()));
        } else if (part.value.trim().length > 0) {
          const textBlock = document.createElement('div');
          textBlock.style.whiteSpace = 'pre-wrap';
          renderTextWithChatLinks(part.value, textBlock);
          body.appendChild(textBlock);
        }
      }
    };

    if (payload?.type === 'notebook') {
      const label = document.createElement('div');
      label.textContent = 'Notebook';
      label.style.fontSize = '11px';
      label.style.textTransform = 'uppercase';
      label.style.letterSpacing = '0.6px';
      label.style.color = '#9a3412';
      label.style.marginBottom = '6px';

      body.appendChild(label);
      body.appendChild(buildCodeBlock(payload.content));
    } else {
      if (msg.content.includes('!important')) {
        item.style.border = '1px solid #ef4444';
        item.style.background = '#fef2f2';
        item.style.boxShadow = '0 6px 14px rgba(239, 68, 68, 0.25)';
        const cleanedText = msg.content.replace(/!important/g, '').trim();
        renderTextWithCodeFences(cleanedText);
      } else {
        renderTextWithCodeFences(msg.content);
      }
    }

    contentWrap.appendChild(meta);
    contentWrap.appendChild(body);

    item.appendChild(avatar);
    item.appendChild(contentWrap);
    container.appendChild(item);
  }
}

function buildModalElement(items: ModalItem[]): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'mathematica-modal-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
  overlay.style.zIndex = '10000';
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#ffffff';
  modal.style.borderRadius = '10px';
  modal.style.maxWidth = '600px';
  modal.style.width = '90%';
  modal.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.2)';
  modal.style.padding = '16px 18px 14px';
  modal.style.position = 'relative';
  modal.style.fontSize = '14px';
  modal.style.color = '#222';
  modal.style.pointerEvents = 'auto';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('div');
  title.textContent = 'Wolfram';
  title.style.fontWeight = 'bold';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.fontSize = '14px';
  let detachEscape: (() => void) | null = null;
  const closeModal = () => {
    if (detachEscape) {
      detachEscape();
      detachEscape = null;
    }
    overlay.remove();
    document.removeEventListener('mousedown', handleOutsideClick, true);
  };

  closeBtn.addEventListener('click', closeModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const meta = document.createElement('div');
  meta.style.fontSize = '12px';
  meta.style.color = '#666';
  meta.style.marginBottom = '10px';

  const content = document.createElement('div');
  content.style.maxHeight = '60vh';
  content.style.overflowY = 'auto';

  const nav = document.createElement('div');
  nav.style.display = 'flex';
  nav.style.justifyContent = 'space-between';
  nav.style.alignItems = 'center';
  nav.style.marginTop = '12px';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Poprzednie';
  prevBtn.style.padding = '6px 10px';
  prevBtn.style.border = '1px solid #ccc';
  prevBtn.style.background = '#f5f5f5';
  prevBtn.style.borderRadius = '6px';

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Następne';
  nextBtn.style.padding = '6px 10px';
  nextBtn.style.border = '1px solid #ccc';
  nextBtn.style.background = '#f5f5f5';
  nextBtn.style.borderRadius = '6px';

  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);

  modal.appendChild(header);
  modal.appendChild(meta);
  modal.appendChild(content);
  modal.appendChild(nav);
  overlay.appendChild(modal);

  let currentIndex = 0;

  const renderItem = (index: number) => {
    const item = items[index];
    meta.textContent = `Pytanie ${index + 1} z ${items.length} • ${item.directive}: ${item.content}`;
    content.innerHTML = buildResultBody(item);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === items.length - 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
  };

  prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderItem(currentIndex);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentIndex < items.length - 1) {
      currentIndex += 1;
      renderItem(currentIndex);
    }
  });

  const handleOutsideClick = (event: MouseEvent) => {
    if (!modal.contains(event.target as Node)) {
      closeModal();
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);
  detachEscape = attachEscapeClose(closeModal);

  renderItem(currentIndex);

  const existingOverlay = document.querySelector('#mathematica-modal-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  return overlay;
}

function getNotebookCells(): string[] {
  const kernels = Array.from(document.querySelectorAll('div.session-kernel'));
  const nodes = kernels
    .map((kernel) => {
      const codeMirrorElement = kernel.querySelectorAll('.CodeMirror-lines')[0];
      if (!codeMirrorElement) {
        return null;
      }
      const lineNodes = codeMirrorElement.childNodes[0]?.childNodes ?? [];
      const filteredNodes = Array.from(lineNodes).filter((node) => {
        const className = (node as HTMLElement).className;
        return className ? !className : true;
      });
      return filteredNodes[0] ?? null;
    })
    .filter((node): node is ChildNode => node !== null);

  const texts = nodes.map((node) => {
    const childNodes = Array.from(node.childNodes);
    const text = childNodes
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\uf522/g, "->")
      .replace(/\u00a0/g, " ")
      .replace(/\u2264/g, "<=")
      .replace(/\u2265/g, ">=")
      .trim()
      .split(/\u200b/g);
    return text;
  });

  return texts
    .flat();
}

function getNotebookTextForChat(): string | null {
  const cells = getNotebookCells();
  if (cells.length === 0) {
    showErrorPopup("Nie znaleziono notebooka");
    return null;
  }
  const text = cells.join('\n').trim();
  if (!text) {
    showErrorPopup("Notebook jest pusty");
    return null;
  }
  return text;
}

function getAllDirectivesFromNotebookCells(cells: string[]): Directive[] {
  const mathRegex = /\[\s*Math\s*:\s*(.*?)\]/g;
  const wolframRegex = /\[\s*Wolfram\s*:\s*(.*?)\]/g;
  const explainRegex = /\[\s*Explain\s*:\s*(.*?)\]/g;
  const directives: Directive[] = [];

  for (const cell of cells) {
    let match;
    while ((match = mathRegex.exec(cell)) !== null) {
      directives.push({ directive: "Math", object: document.body, content: match[1].trim() });
    }
    while ((match = wolframRegex.exec(cell)) !== null) {
      directives.push({ directive: "Wolfram", object: document.body, content: match[1].trim() });
    }
    while ((match = explainRegex.exec(cell)) !== null) {
      directives.push({ directive: "Explain", object: document.body, content: match[1].trim() });
    }
  }

  return directives;
}

async function runComputeAiV2(): Promise<void> {
  const notebookCells = getNotebookCells();
  console.log("Mathematica+ V2 notebookCells:", JSON.stringify(notebookCells));
  const notebookText = notebookCells.join(' ');
  const directives = getAllDirectivesFromNotebookCells([notebookText]);

  if (directives.length === 0) {
    showErrorPopup("Nie znaleziono dyrektyw Math+");
    return;
  }

  showLoadingSpinner();
  try {
    const results: ModalItem[] = [];

    for (const dir of directives) {
      let prompt = "";
      if (dir.directive === "Math") {
        prompt = `Podaj wzór matematyczny w formacie LaTeX (otoczony $$...$$) dla: ${dir.content}. Zwróć tylko wzór LaTeX, bez dodatkowych wyjaśnień.`;
      } else if (dir.directive === "Wolfram") {
        prompt = `Napisz kod w języku Wolfram Language dla: ${dir.content}. Podaj tylko kod, bez dodatkowych wyjaśnień.`;
      } else if (dir.directive === "Explain") {
        prompt = `Wyjaśnij po polsku w prosty sposób: ${dir.content}. Użyj prostego języka. Zawsze zapisuj wzory LaTeX tylko jako $...$ (inline) lub $$...$$ (display). Nie używaj \\( \\) ani \\[ \\].`;
      } else {
        continue;
      }

      const response = await fetchAIResponse(prompt);
      if (response) {
        results.push({ directive: dir.directive, content: dir.content, response });
      } else {
        results.push({ directive: dir.directive, content: dir.content, response: "Błąd podczas pobierania odpowiedzi AI" });
      }
    }

  ensureKatexStyles();
  ensureMarkdownStyles();
  ensureResultStyles();
  const overlay = buildModalElement(results);
  document.body.appendChild(overlay);
  } finally {
    hideLoadingSpinner();
  }
}

export async function runComputeAi(): Promise<void> {
  console.log("Mathematica+ AI aktywowane");

  if (!(await ensureCredentials())) {
    return;
  }

  const processingMode = await getStoredProcessingMode();
  if (processingMode === 'v2') {
    await runComputeAiV2();
    return;
  }

  const directives = getAllMathPlusDirectives();

  if (directives.length === 0) {
    showErrorPopup("Nie znaleziono dyrektyw Math+");
    return;
  }

  showLoadingSpinner();
  try {
    for (const dir of directives) {
      let prompt = "";
      if (dir.directive === "Math") {
        prompt = `Podaj wzór matematyczny w formacie LaTeX (otoczony $$...$$) dla: ${dir.content}. Zwróć tylko wzór LaTeX, bez dodatkowych wyjaśnień.`;
      } else if (dir.directive === "Wolfram") {
        prompt = `Napisz kod w języku Wolfram Language dla: ${dir.content}. Podaj tylko kod, bez dodatkowych wyjaśnień.`;
      } else if (dir.directive === "Explain") {
        prompt = `Wyjaśnij po polsku w prosty sposób: ${dir.content}. Użyj prostego języka. Zawsze zapisuj wzory LaTeX tylko jako $...$ (inline) lub $$...$$ (display). Nie używaj \\( \\) ani \\[ \\].`;
      } else {
        continue;
      }
      
      const response = await fetchAIResponse(prompt);
      
      if (response) {
        createResponsePopup(response, dir.object);
      } else {
        showErrorPopup("Błąd podczas pobierania odpowiedzi AI");
      }
    }
  } finally {
    hideLoadingSpinner();
  }
}

export async function runNotebookAuditV2(): Promise<void> {
  if (!(await ensureCredentials())) {
    return;
  }


  const notebookCells = getNotebookCells();
  console.log("Mathematica+ V2 audit notebookCells:", JSON.stringify(notebookCells));
  const notebookText = notebookCells.join(' ');
  if (!notebookText.trim()) {
    showErrorPopup("Notebook jest pusty");
    return;
  }

  showLoadingSpinner();
  try {
    const prompt = [
      "Przeanalizuj zawartosc notebooka tylko pod katem poprawnosci Wolfram Language i matematyki w stylu Wolfram.",
      "Ignoruj kwestie jezykowe, stylistyczne i organizacyjne.",
      "Zwracaj wynik w JSON bez dodatkowego tekstu.",
      "Schemat JSON:",
      "{",
      "  \"errors\": [",
      "    {",
      "      \"error\": \"krotki opis bledu\",",
      "      \"current\": \"co jest obecnie\",",
      "      \"fix\": \"jak poprawic\",",
      "      \"explanation\": \"wyjasnienie dlaczego to blad\"",
      "    }",
      "  ]",
      "}",
      "Jesli nie ma bledow, zwroc {\"errors\": []}.",
      "",
      "Notebook:",
      notebookText
    ].join('\n');

    const response = await fetchAIResponse(prompt);
    if (!response) {
      showErrorPopup("Blad podczas pobierania odpowiedzi AI");
      return;
    }

    let parsed: { errors: AuditErrorItem[] } | null = null;
    try {
      parsed = JSON.parse(response);
    } catch (error) {
      parsed = null;
    }

    ensureKatexStyles();
    ensureMarkdownStyles();
    ensureAuditStyles();

    if (!parsed || !Array.isArray(parsed.errors)) {
      const overlay = createAuditModal(
        "Wolfram - Blad formatu",
        `<div class="audit-section"><div class="audit-body">${renderLatex("Nie udalo sie odczytac JSON z odpowiedzi AI.")}</div></div>`
      );
      document.body.appendChild(overlay);
      return;
    }

    if (parsed.errors.length === 0) {
      const overlay = createAuditModal(
        "Wolfram - Audit",
        `<div class="audit-section"><div class="audit-body">${renderLatex("Nie znaleziono bledow.")}</div></div>`
      );
      document.body.appendChild(overlay);
      return;
    }

    const overlay = buildAuditModalCarousel(parsed.errors);
    document.body.appendChild(overlay);
  } finally {
    hideLoadingSpinner();
  }
}

export async function runChatModal(): Promise<void> {
  if (!(await ensureCredentials())) {
    return;
  }

  const existingOverlay = document.querySelector('#mathematica-chat-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  let pollingId: number | null = null;
  let currentRoomId = await getStoredChatRoomId();
  let currentUsername = await getStoredChatUsername();
  let isLoading = false;
  let lastMessagesSignature = '';
  let autoScrollEnabled = true;
  let isInitialLoad = true;
  const restoreScrollRoomId = currentRoomId;
  let didRestoreScroll = false;
  let scrollSaveTimeout: number | null = null;

  const stopPolling = () => {
    if (pollingId !== null) {
      clearInterval(pollingId);
      pollingId = null;
    }
  };

  const { overlay, leaveRoomBtn } = createChatModalContainer(stopPolling);
  const content = overlay.querySelector('#mathematica-chat-content') as HTMLDivElement | null;
  if (!content) {
    return;
  }

  const chatView = document.createElement('div');
  chatView.style.display = 'flex';
  chatView.style.flexDirection = 'column';
  chatView.style.gap = '10px';

  const roomRow = document.createElement('div');
  roomRow.style.display = 'flex';
  roomRow.style.gap = '8px';
  roomRow.style.alignItems = 'center';

  const roomInput = document.createElement('input');
  roomInput.type = 'text';
  roomInput.placeholder = 'Chat ID';
  roomInput.value = currentRoomId || '';
  roomInput.style.flex = '1';
  roomInput.style.padding = '8px 10px';
  roomInput.style.border = '1px solid #ddd';
  roomInput.style.borderRadius = '8px';
  roomInput.style.fontSize = '13px';

  const saveRoomBtn = document.createElement('button');
  saveRoomBtn.textContent = 'Dolacz';
  saveRoomBtn.style.padding = '8px 12px';
  saveRoomBtn.style.border = '1px solid #ddd';
  saveRoomBtn.style.background = '#f8fafc';
  saveRoomBtn.style.borderRadius = '6px';

  roomRow.appendChild(roomInput);
  roomRow.appendChild(saveRoomBtn);

  const statusRow = document.createElement('div');
  statusRow.style.display = 'flex';
  statusRow.style.alignItems = 'center';
  statusRow.style.justifyContent = 'space-between';
  statusRow.style.gap = '8px';

  const status = document.createElement('div');
  status.style.fontSize = '12px';
  status.style.color = '#666';
  status.style.background = '#f8fafc';
  status.style.border = '1px solid #e6e6e6';
  status.style.padding = '6px 8px';
  status.style.borderRadius = '6px';
  status.style.flex = '1';
  status.textContent = 'Podaj Chat ID, aby rozpoczac.';

  const autoScrollWrap = document.createElement('label');
  autoScrollWrap.style.display = 'flex';
  autoScrollWrap.style.alignItems = 'center';
  autoScrollWrap.style.gap = '6px';
  autoScrollWrap.style.fontSize = '12px';
  autoScrollWrap.style.color = '#444';

  const autoScrollToggle = document.createElement('input');
  autoScrollToggle.type = 'checkbox';
  autoScrollToggle.checked = autoScrollEnabled;

  const autoScrollLabel = document.createElement('span');
  autoScrollLabel.textContent = 'Auto-scroll';

  autoScrollToggle.addEventListener('change', () => {
    autoScrollEnabled = autoScrollToggle.checked;
  });

  autoScrollWrap.appendChild(autoScrollToggle);
  autoScrollWrap.appendChild(autoScrollLabel);
  statusRow.appendChild(status);
  statusRow.appendChild(autoScrollWrap);

  const landing = document.createElement('div');
  landing.style.display = 'flex';
  landing.style.flexDirection = 'column';
  landing.style.alignItems = 'center';
  landing.style.justifyContent = 'center';
  landing.style.gap = '12px';
  landing.style.padding = '18px 10px 6px';

  const landingTitle = document.createElement('div');
  landingTitle.textContent = 'Wybierz pokój czatu';
  landingTitle.style.fontWeight = 'bold';
  landingTitle.style.fontSize = '15px';
  landingTitle.style.color = '#111827';

  const landingHint = document.createElement('div');
  landingHint.textContent = 'Dolacz do glownego pokoju lub wpisz Chat ID powyzej.';
  landingHint.style.fontSize = '12px';
  landingHint.style.color = '#6b7280';

  const landingCard = document.createElement('button');
  landingCard.type = 'button';
  landingCard.textContent = '⭐ Dolacz do glownego chatu (mat2)';
  landingCard.style.padding = '10px 14px';
  landingCard.style.border = '1px solid #f4b9a6';
  landingCard.style.background = '#ffefe9';
  landingCard.style.color = '#9a3412';
  landingCard.style.borderRadius = '10px';
  landingCard.style.cursor = 'pointer';
  landingCard.style.boxShadow = '0 8px 16px rgba(154,52,18,0.12)';

  landing.appendChild(landingTitle);
  landing.appendChild(landingHint);
  landing.appendChild(landingCard);

  const messagesContainer = document.createElement('div');
  messagesContainer.style.display = 'flex';
  messagesContainer.style.flexDirection = 'column';
  messagesContainer.style.gap = '8px';
  messagesContainer.style.maxHeight = '45vh';
  messagesContainer.style.overflowY = 'auto';
  messagesContainer.style.border = '1px solid #e6e6e6';
  messagesContainer.style.borderRadius = '8px';
  messagesContainer.style.padding = '10px';
  messagesContainer.style.background = 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)';

  const inputRow = document.createElement('div');
  inputRow.style.display = 'flex';
  inputRow.style.gap = '8px';
  inputRow.style.alignItems = 'center';

  const messageInput = document.createElement('textarea');
  messageInput.placeholder = 'Wpisz wiadomosc...';
  messageInput.rows = 2;
  messageInput.style.flex = '1';
  messageInput.style.padding = '8px 10px';
  messageInput.style.border = '1px solid #ddd';
  messageInput.style.borderRadius = '8px';
  messageInput.style.fontSize = '13px';
  messageInput.style.resize = 'vertical';

  const inputHint = document.createElement('div');
  inputHint.textContent = 'Ctrl+Enter — wyslij';
  inputHint.style.fontSize = '11px';
  inputHint.style.color = '#6b7280';
  inputHint.style.marginTop = '4px';
  inputHint.style.marginLeft = '2px';

  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Wyslij';
  sendBtn.style.padding = '8px 12px';
  sendBtn.style.border = '1px solid #f4b9a6';
  sendBtn.style.background = '#ffefe9';
  sendBtn.style.color = '#9a3412';
  sendBtn.style.borderRadius = '6px';

  const attachBtn = document.createElement('button');
  attachBtn.textContent = 'Zalacz kod';
  attachBtn.style.padding = '8px 12px';
  attachBtn.style.border = '1px solid #ddd';
  attachBtn.style.background = '#f8fafc';
  attachBtn.style.borderRadius = '6px';
  attachBtn.style.whiteSpace = 'nowrap';

  const inputWrap = document.createElement('div');
  inputWrap.style.display = 'flex';
  inputWrap.style.flexDirection = 'column';
  inputWrap.style.flex = '1';
  inputWrap.appendChild(messageInput);
  inputWrap.appendChild(inputHint);
  inputRow.appendChild(inputWrap);
  inputRow.appendChild(attachBtn);
  inputRow.appendChild(sendBtn);

  chatView.appendChild(roomRow);
  chatView.appendChild(statusRow);
  chatView.appendChild(landing);
  chatView.appendChild(messagesContainer);
  chatView.appendChild(inputRow);

  content.appendChild(chatView);

  const setStatus = (text: string, isError = false) => {
    status.textContent = text;
    status.style.color = isError ? '#b91c1c' : '#666';
    status.style.background = isError ? '#fef2f2' : '#f8fafc';
    status.style.border = isError ? '1px solid #fecaca' : '1px solid #e6e6e6';
  };

  const setChatEnabled = (enabled: boolean) => {
    roomInput.disabled = !enabled;
    saveRoomBtn.disabled = !enabled;
    messageInput.disabled = !enabled;
    attachBtn.disabled = !enabled;
    sendBtn.disabled = !enabled;
    messagesContainer.style.opacity = enabled ? '1' : '0.6';
  };

  const getChatScrollPositions = async (): Promise<Record<string, number>> => {
    return new Promise((resolve) => {
      chrome.storage.local.get('chatScrollPositions', (result) => {
        const value = result?.chatScrollPositions;
        if (value && typeof value === 'object') {
          resolve(value as Record<string, number>);
        } else {
          resolve({});
        }
      });
    });
  };

  const setChatScrollPosition = async (roomId: string, scrollTop: number): Promise<void> => {
    const positions = await getChatScrollPositions();
    positions[roomId] = scrollTop;
    return new Promise((resolve) => {
      chrome.storage.local.set({ chatScrollPositions: positions }, () => resolve());
    });
  };

  const loadChatScrollPosition = async (roomId: string): Promise<number | null> => {
    const positions = await getChatScrollPositions();
    const value = positions[roomId];
    return typeof value === 'number' ? value : null;
  };

  messagesContainer.addEventListener('scroll', () => {
    if (!currentRoomId) {
      return;
    }
    if (scrollSaveTimeout !== null) {
      clearTimeout(scrollSaveTimeout);
    }
    scrollSaveTimeout = window.setTimeout(() => {
      void setChatScrollPosition(currentRoomId!, messagesContainer.scrollTop);
    }, 200);
  });

  const updateJoinButton = () => {
    const nextValue = roomInput.value.trim();
    const canJoin = !!nextValue && nextValue !== (currentRoomId || '');
    saveRoomBtn.disabled = !canJoin;
    saveRoomBtn.style.opacity = canJoin ? '1' : '0.5';
    saveRoomBtn.style.cursor = canJoin ? 'pointer' : 'not-allowed';
    saveRoomBtn.style.background = canJoin ? '#ffefe9' : '#f8fafc';
    saveRoomBtn.style.border = canJoin ? '1px solid #f4b9a6' : '1px solid #ddd';
    saveRoomBtn.style.color = canJoin ? '#9a3412' : '#6b7280';
  };

  const updateView = () => {
    const hasRoom = !!currentRoomId;
    landing.style.display = hasRoom ? 'none' : 'flex';
    messagesContainer.style.display = hasRoom ? 'flex' : 'none';
    inputRow.style.display = hasRoom ? 'flex' : 'none';
    leaveRoomBtn.disabled = !hasRoom;
    leaveRoomBtn.style.opacity = hasRoom ? '1' : '0.5';
    leaveRoomBtn.style.cursor = hasRoom ? 'pointer' : 'not-allowed';
    updateJoinButton();
  };

  const loadMessages = async (scrollToBottom: boolean, forceRender = false) => {
    if (!currentRoomId || isLoading) {
      return;
    }
    isLoading = true;
    const messages = await oneChatGet(currentRoomId);
    const signature = messages.length === 0
      ? `empty:${currentRoomId}`
      : messages
          .map((msg) => `${msg.username}|${msg.timestamp}|${msg.content}`)
          .join('\n');
    if (forceRender || signature !== lastMessagesSignature) {
      lastMessagesSignature = signature;
      renderChatMessages(messagesContainer, messages, currentUsername, (roomName) => {
        roomInput.value = roomName;
        applyRoom();
      });
      if (!didRestoreScroll && restoreScrollRoomId && currentRoomId === restoreScrollRoomId) {
        const savedPos = await loadChatScrollPosition(currentRoomId);
        if (savedPos !== null) {
          messagesContainer.scrollTop = savedPos;
        }
        didRestoreScroll = true;
      } else if (!isInitialLoad && (scrollToBottom || autoScrollEnabled)) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
    if (isInitialLoad) {
      isInitialLoad = false;
    }
    isLoading = false;
  };

  const startPolling = () => {
    stopPolling();
    pollingId = window.setInterval(() => {
      loadMessages(false);
    }, 500);
  };

  const applyRoom = async () => {
    const value = roomInput.value.trim();
    if (!value) {
      setStatus('Chat ID jest wymagane.', true);
      return;
    }
    if (value === currentRoomId) {
      lastMessagesSignature = '';
      await loadMessages(true, true);
      updateView();
      return;
    }
    didRestoreScroll = true;
    currentRoomId = value;
    await setStoredChatRoomId(value);
    setStatus(`Polaczono z: ${value}`);
    lastMessagesSignature = '';
    await loadMessages(true);
    startPolling();
    updateView();
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  };

  saveRoomBtn.addEventListener('click', applyRoom);
  roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyRoom();
    }
  });
  roomInput.addEventListener('input', updateJoinButton);

  leaveRoomBtn.addEventListener('click', async () => {
    stopPolling();
    currentRoomId = '';
    await setStoredChatRoomId('');
    roomInput.value = '';
    messagesContainer.innerHTML = '';
    setStatus('Rozlaczono z pokojem.');
    updateView();
  });

  landingCard.addEventListener('click', () => {
    roomInput.value = 'mat2';
    applyRoom();
  });


  sendBtn.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (!currentRoomId) {
      setStatus('Najpierw ustaw Chat ID.', true);
      return;
    }
    if (!currentUsername) {
      setStatus('Ustaw nazwę użytkownika w oknie wtyczki.', true);
      return;
    }
    if (!message) {
      setStatus('Wiadomosc nie moze byc pusta.', true);
      return;
    }
    sendBtn.disabled = true;
    const ok = await oneChatSend(currentRoomId, currentUsername, message);
    sendBtn.disabled = false;
    if (!ok) {
      setStatus('Nie udalo sie wyslac wiadomosci.', true);
      return;
    }
    messageInput.value = '';
    await loadMessages(true);
  });

  attachBtn.addEventListener('click', async () => {
    if (!currentRoomId) {
      setStatus('Najpierw ustaw Chat ID.', true);
      return;
    }
    if (!currentUsername) {
      setStatus('Ustaw nazwę użytkownika w oknie wtyczki.', true);
      return;
    }
    const notebookText = getNotebookTextForChat();
    if (!notebookText) {
      return;
    }
    attachBtn.disabled = true;
    const payload = JSON.stringify({ type: "notebook", content: notebookText });
    const ok = await oneChatSend(currentRoomId, currentUsername, payload);
    attachBtn.disabled = false;
    if (!ok) {
      setStatus('Nie udalo sie wyslac kodu.', true);
      return;
    }
    await loadMessages(true);
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      sendBtn.click();
    }
  });

  setChatEnabled(!!currentUsername);
  document.body.appendChild(overlay);

  if (currentRoomId && currentUsername) {
    setStatus(`Polaczono z: ${currentRoomId}`);
    await loadMessages(true);
    startPolling();
  }

  updateView();
}
