// Content script logic for processing Math+ directives
import katex from 'katex';
import katexStyles from 'katex/dist/katex.min.css';

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

// Render LaTeX in text
function renderLatex(text: string): string {
  // Replace display math $$...$$ 
  let result = text.replace(/\$\$([^$]+)\$\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Replace inline math $...$
  result = result.replace(/\$([^$]+)\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

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

export async function runComputeAi(): Promise<void> {
  console.log("Mathematica+ AI aktywowane");

  const directives = getAllMathPlusDirectives();

  if (directives.length === 0) {
    showErrorPopup("Nie znaleziono dyrektyw Math+");
    return;
  }

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
}
