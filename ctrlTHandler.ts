import readline from 'readline';

export const CtrlTToken = Symbol("CtrlTToken");
export const CreateAgentToken = Symbol("CreateAgentToken");
export const NextAgentToken = Symbol("NextAgentToken");
export const PrevAgentToken = Symbol("PrevAgentToken");
export const AgentSelectorToken = Symbol("AgentSelectorToken");
export const ExitAgentToken = Symbol("ExitAgentToken");
export const DetachAgentToken = Symbol("DetachAgentToken");

type CtrlTCallback = (token: symbol) => void;

let ctrlTPressed = false;
let callback: CtrlTCallback | null = null;
export function setupCtrlTHandler(onCtrlT: CtrlTCallback) {
  callback = onCtrlT;
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', handleKeypress);
  }
}

export function cleanupCtrlTHandler() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.off('data', handleKeypress);
  }
  callback = null;
}

function handleKeypress(data: Buffer) {
  const key = data.toString();
  
  // Ctrl-T is ASCII 20 (0x14)
  if (key === '\x14') {
    if (ctrlTPressed) {
      ctrlTPressed = false;
      callback?.(CtrlTToken);
      return;
    }
    ctrlTPressed = true;
    return;
  }
  
  if (ctrlTPressed) {
    ctrlTPressed = false;
    
    switch (key) {
      case 'c': callback?.(CreateAgentToken); break;
      case 'n': callback?.(NextAgentToken); break;
      case 'p': callback?.(PrevAgentToken); break;
      case 's': callback?.(AgentSelectorToken); break;
      case 'x': callback?.(ExitAgentToken); break;
      case 'd': callback?.(DetachAgentToken); break;
    }
  }
}