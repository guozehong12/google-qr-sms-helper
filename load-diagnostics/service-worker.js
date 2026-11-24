importScripts("diagnose.js");

const probes = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const accepted = globalThis.LoadDiagnostics.acceptProbe(message);
  if (accepted && sender.tab && Number.isInteger(sender.tab.id)) {
    probes.set(sender.tab.id, accepted);
    const text = globalThis.LoadDiagnostics.badgeForCode(accepted.code);
    if (text) {
      const color = text === "HID" ? "#b06000" : "#5f6368";
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: text });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: color });
    }
    return;
  }
  if (!message || message.type !== "load-diagnostics-query" || !Number.isInteger(message.tabId)) {
    return;
  }
  sendResponse(probes.get(message.tabId) || { seen: false, code: null });
});
