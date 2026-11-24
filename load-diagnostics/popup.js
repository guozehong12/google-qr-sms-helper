(function () {
  "use strict";

  const out = document.getElementById("out");

  function paint(classification, probe) {
    out.textContent = globalThis.LoadDiagnostics.renderDiagnosis(classification, probe).text;
  }

  chrome.tabs.query({ active: true, currentWindow: true }).then(async function (tabs) {
    const tab = tabs && tabs[0];
    const classification = globalThis.LoadDiagnostics.classifyUrl(tab && tab.url);
    let probe = { seen: false, code: null, failed: false };
    if (tab && Number.isInteger(tab.id)) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "load-diagnostics-query",
          tabId: tab.id,
        });
        if (response && response.seen === true) {
          probe = { seen: true, code: response.code, failed: false };
        }
      } catch (err) {
        probe = { seen: false, code: null, failed: true };
      }
    }
    paint(classification, probe);
  }).catch(function () {
    paint(globalThis.LoadDiagnostics.classifyUrl(""), { seen: false, code: null, failed: true });
  });
})();
