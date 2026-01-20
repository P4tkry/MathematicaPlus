// Content script logic for processing Math+ directives
import katex from 'katex';
import katexStyles from 'katex/dist/katex.min.css';
import { getStoredProcessingMode } from './storage.js';

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
  const notebookText = notebookDiv?.textContent || "";
  const mathRegex = /\[Math:(.*?)\]/g;
  const wolframRegex = /\[Wolfram:(.*?)\]/g;
  const explainRegex = /\[Explain:(.*?)\]/g;
  
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

export async function fetchAIResponse(prompt: string): Promise<string | null> {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "aiAnswer", model: "gpt-4.1", content: prompt }, (response) => {
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
closeBtn.style.cursor = 'pointer';
closeBtn.style.fontSize = '5px';

// Close popup on click
closeBtn.addEventListener('click', () => {
  popup.remove();
});

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
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

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
      overlay.remove();
      document.removeEventListener('mousedown', handleOutsideClick, true);
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);

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
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

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
  prevBtn.style.cursor = 'pointer';
  prevBtn.style.borderRadius = '6px';

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Następny';
  nextBtn.style.padding = '6px 10px';
  nextBtn.style.border = '1px solid #ccc';
  nextBtn.style.background = '#f5f5f5';
  nextBtn.style.cursor = 'pointer';
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
      overlay.remove();
      document.removeEventListener('mousedown', handleOutsideClick, true);
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);

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

function ensureCaretStyle(): void {
  if (document.querySelector('#mathematica-caret-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mathematica-caret-style';
  style.textContent = '.notebook, .notebook * { caret-color: #000000 !important; }';
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

function buildModalElement(items: ModalItem[], notebookDiv: HTMLElement | null): HTMLElement {
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
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

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
  prevBtn.style.cursor = 'pointer';
  prevBtn.style.borderRadius = '6px';

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Następne';
  nextBtn.style.padding = '6px 10px';
  nextBtn.style.border = '1px solid #ccc';
  nextBtn.style.background = '#f5f5f5';
  nextBtn.style.cursor = 'pointer';
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
    content.innerHTML = renderLatex(item.response);
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
      overlay.remove();
      document.removeEventListener('mousedown', handleOutsideClick, true);
    }
  };

  document.addEventListener('mousedown', handleOutsideClick, true);

  renderItem(currentIndex);

  const existingOverlay = document.querySelector('#mathematica-modal-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  return overlay;
}

function getNotebookCells(notebookDiv: HTMLElement): string[] {
  const rawText = notebookDiv.innerText || "";
  return rawText.split(" ").map((cell) => cell.replaceAll("\n", "").trim()).filter((cell) => cell.length > 0);
}

function getAllDirectivesFromNotebookCells(cells: string[]): Directive[] {
  const mathRegex = /\[Math:(.*?)\]/g;
  const wolframRegex = /\[Wolfram:(.*?)\]/g;
  const explainRegex = /\[Explain:(.*?)\]/g;
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
  const notebookDiv = document.querySelector('.notebook') as HTMLElement | null;
  if (!notebookDiv) {
    showErrorPopup("Nie znaleziono notebooka");
    return;
  }

  const notebookCells = getNotebookCells(notebookDiv);
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
        prompt = `Wyjaśnij po polsku w prosty sposób: ${dir.content}. Użyj prostego języka. Jeśli potrzebne, użyj wzorów LaTeX w formacie $...$ (inline) lub $$...$$ (display).`;
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
  const overlay = buildModalElement(results, notebookDiv);
  document.body.appendChild(overlay);
  } finally {
    hideLoadingSpinner();
  }
}

export async function runComputeAi(): Promise<void> {
  console.log("Mathematica+ AI aktywowane");

  const processingMode = await getStoredProcessingMode();
  if (processingMode === 'v2') {
    ensureCaretStyle();
    await runComputeAiV2();
    return;
  }

  ensureCaretStyle();
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
        prompt = `Wyjaśnij po polsku w prosty sposób: ${dir.content}. Użyj prostego języka. Jeśli potrzebne, użyj wzorów LaTeX w formacie $...$ (inline) lub $$...$$ (display).`;
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
  const notebookDiv = document.querySelector('.notebook') as HTMLElement | null;
  if (!notebookDiv) {
    showErrorPopup("Nie znaleziono notebooka");
    return;
  }

  const notebookCells = getNotebookCells(notebookDiv);
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
