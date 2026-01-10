import { runComputeAi } from './contentScriptLogic.js';

const timestamp = new Date().toLocaleTimeString();
console.log(`Content script zaladowany o ${timestamp}`);

// Auto-run when injected via executeScript
runComputeAi();
