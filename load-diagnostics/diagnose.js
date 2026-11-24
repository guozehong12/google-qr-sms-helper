(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.LoadDiagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REASONS = Object.assign(Object.create(null), {
    unreadable: {
      scriptInjects: false,
      originalPanel: false,
      reason: "读不到当前页的位置。原版没有工具栏按钮，这种页面上也不会出现面板。",
    },
    "non-https": {
      scriptInjects: false,
      originalPanel: false,
      reason: "当前页不是 https。原版内容脚本只匹配 https，所以这里不会出现面板。",
    },
    "outside-declared-host": {
      scriptInjects: false,
      originalPanel: false,
      reason: "当前站点不在原版内容脚本的站点里。原版没有工具栏按钮，脚本不注入时页面上就什么都没有，因此只会表现为无效。",
    },
    "short-link-no-script": {
      scriptInjects: false,
      originalPanel: false,
      reason: "这是 g.co 短链接站点。原版声明了该站点权限，但没有在这里注入内容脚本，也没有工具栏按钮，所以看不到面板。本诊断包不声明该站点权限，也不会跟随短链接。",
    },
    "cloud-console-panel": {
      scriptInjects: true,
      originalPanel: true,
      reason: "原版会在 Cloud Console 显示自己的面板。本诊断包只说明这一点，不会点击页面上的任何按钮。",
    },
    "qrcode-panel": {
      scriptInjects: true,
      originalPanel: true,
      reason: "原版会在二维码验证路径显示自己的面板。本诊断包只说明这一点，不会读取码，也不会提交验证。",
    },
    "accounts-panel-hidden": {
      scriptInjects: true,
      originalPanel: false,
      reason: "原版内容脚本会在这个账号页加载，但路径不是二维码验证页，脚本会立刻退出。原版又没有工具栏按钮，所以页面上没有任何提示，看起来就像无效。",
    },
  });

  const FOOTER = "本包不发送网络请求，不修改请求头或设备标识，也不恢复短信验证。";

  function specFor(code) {
    if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(REASONS, code)) {
      return null;
    }
    return REASONS[code];
  }

  function resultFor(code) {
    const spec = specFor(code) || REASONS.unreadable;
    const resolved = specFor(code) ? code : "unreadable";
    return {
      code: resolved,
      scriptInjects: spec.scriptInjects,
      originalPanel: spec.originalPanel,
    };
  }

  function classifyLocation(input) {
    const protocol = input && typeof input.protocol === "string" ? input.protocol : "https:";
    if (protocol !== "https:") {
      return resultFor("non-https");
    }
    const hostname = input && typeof input.hostname === "string" ? input.hostname.toLowerCase() : "";
    const pathname = input && typeof input.pathname === "string" ? input.pathname : "";
    if (!hostname) {
      return resultFor("unreadable");
    }
    if (hostname === "g.co") {
      return resultFor("short-link-no-script");
    }
    if (hostname === "console.cloud.google.com") {
      return resultFor("cloud-console-panel");
    }
    if (hostname === "accounts.google.com") {
      if (pathname.includes("/challenge/iap/qrcode")) {
        return resultFor("qrcode-panel");
      }
      return resultFor("accounts-panel-hidden");
    }
    return resultFor("outside-declared-host");
  }

  function classifyUrl(urlString) {
    if (typeof urlString !== "string" || urlString.length === 0) {
      return resultFor("unreadable");
    }
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      return resultFor("unreadable");
    }
    return classifyLocation({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    });
  }

  function probeLine(spec, probe) {
    if (probe && probe.failed) {
      return "扩展内部状态暂时读不到。上面的页面判断仍然可用。";
    }
    const seen = Boolean(probe && probe.seen === true && specFor(probe.code));
    if (seen && probe.code !== spec.code) {
      return "诊断脚本有回报，但和当前地址判断不一致。请只刷新页面后再打开本窗口。";
    }
    if (seen) {
      return "诊断脚本：已在此页运行。";
    }
    if (spec.scriptInjects) {
      return "诊断脚本：此页应该会注入，但还没有回报。请等页面加载完再打开一次。";
    }
    return "诊断脚本：不会注入到此页。";
  }

  function renderDiagnosis(classification, probe) {
    const code = classification && specFor(classification.code) ? classification.code : "unreadable";
    const spec = REASONS[code];
    const text = [spec.reason, probeLine({ code: code, scriptInjects: spec.scriptInjects }, probe), FOOTER].join("\n");
    return { code: code, text: text };
  }

  function acceptProbe(message) {
    if (!message || message.type !== "load-diagnostics-ping") {
      return null;
    }
    const spec = specFor(message.code);
    if (!spec || !spec.scriptInjects) {
      return null;
    }
    return { seen: true, code: message.code };
  }

  function badgeForCode(code) {
    if (code === "accounts-panel-hidden") return "HID";
    if (code === "qrcode-panel" || code === "cloud-console-panel") return "UI";
    return "";
  }

  return {
    classifyLocation: classifyLocation,
    classifyUrl: classifyUrl,
    renderDiagnosis: renderDiagnosis,
    acceptProbe: acceptProbe,
    badgeForCode: badgeForCode,
  };
});
