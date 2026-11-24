(function () {
  "use strict";

  const api = globalThis.LoadDiagnostics;
  if (!api) {
    return;
  }
  const report = api.classifyLocation({
    hostname: location.hostname,
    pathname: location.pathname,
  });
  if (!report.scriptInjects) {
    return;
  }
  try {
    chrome.runtime.sendMessage({
      type: "load-diagnostics-ping",
      code: report.code,
    });
  } catch (err) {
    // 不把页面地址写进日志。
  }
})();
