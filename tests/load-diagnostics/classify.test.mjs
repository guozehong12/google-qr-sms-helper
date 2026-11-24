import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const diag = require("../../load-diagnostics/diagnose.js");
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/pages.json", import.meta.url), "utf8"));
const originalContent = fs.readFileSync(new URL("../../content.js", import.meta.url), "utf8");

function originalPanelMounts(hostname, pathname) {
  let mounted = false;
  const sandbox = {
    location: {
      hostname,
      pathname,
      search: "?TL=HARNESS_SECRET",
      href: "https://invalid.example/harness?TL=HARNESS_SECRET",
    },
    document: {
      body: {
        appendChild() {
          mounted = true;
        },
      },
      createElement() {
        return {
          style: {},
          appendChild() {},
          textContent: "",
        };
      },
    },
  };
  vm.runInNewContext(originalContent, sandbox, { filename: "content.js" });
  return mounted;
}

function manifestWouldInject(url) {
  if (url.protocol !== "https:") return false;
  return url.hostname === "accounts.google.com" || url.hostname === "console.cloud.google.com";
}

test("synthetic pages match the original mount gate and do not leak", () => {
  for (const fixture of fixtures) {
    const url = new URL(fixture.url);
    const classified = diag.classifyUrl(fixture.url);
    const rendered = diag.renderDiagnosis(classified, { seen: true, code: classified.code });
    assert.equal(classified.code, fixture.code, fixture.name);
    assert.equal(rendered.code, fixture.code, fixture.name);
    if (manifestWouldInject(url)) {
      assert.equal(classified.scriptInjects, true, fixture.name);
      assert.equal(classified.originalPanel, originalPanelMounts(url.hostname, url.pathname), fixture.name);
    } else {
      assert.equal(classified.scriptInjects, false, fixture.name);
      assert.equal(classified.originalPanel, false, fixture.name);
    }
    const packed = JSON.stringify(classified) + "\n" + rendered.text;
    for (const secret of fixture.forbidden) {
      assert.equal(packed.includes(secret), false, `${fixture.name} leaked ${secret}`);
    }
    assert.equal(rendered.text.includes(fixture.url), false, fixture.name);
    assert.equal(rendered.text.includes("?"), false, fixture.name);
  }
});

test("ignored extra fields cannot change the rendered text", () => {
  const classified = diag.classifyUrl("https://accounts.google.com/v3/signin/identifier");
  const poisoned = {
    code: classified.code,
    reason: "LEAKED_REASON_TOKEN",
    search: "?TL=LEAKED_REASON_TOKEN",
  };
  const text = diag.renderDiagnosis(poisoned, {
    seen: true,
    code: classified.code,
    url: "https://accounts.google.com/?TL=LEAKED_REASON_TOKEN",
  }).text;
  assert.equal(text.includes("LEAKED_REASON_TOKEN"), false);
  assert.match(text, /诊断脚本：已在此页运行。/);
  assert.match(text, /不恢复短信验证。/);
});

test("a mismatched probe does not echo the foreign code", () => {
  const classified = diag.classifyUrl("https://accounts.google.com/v3/signin/challenge/iap/qrcode?TL=MISMATCHLEAK");
  const text = diag.renderDiagnosis(classified, { seen: true, code: "accounts-panel-hidden" }).text;
  assert.match(text, /诊断脚本有回报，但和当前地址判断不一致/);
  assert.equal(text.includes("MISMATCHLEAK"), false);
  assert.equal(text.includes("accounts-panel-hidden"), false);
});

test("probe messages only accept known injected states", () => {
  assert.deepEqual(diag.acceptProbe({
    type: "load-diagnostics-ping",
    code: "accounts-panel-hidden",
    url: "https://accounts.google.com/?TL=PROBELEAK",
  }), { seen: true, code: "accounts-panel-hidden" });
  assert.equal(diag.acceptProbe({ type: "load-diagnostics-ping", code: "short-link-no-script" }), null);
  assert.equal(diag.acceptProbe({ type: "load-diagnostics-ping", code: "https://accounts.google.com/?TL=PROBELEAK" }), null);
  assert.equal(diag.acceptProbe({ type: "load-diagnostics-ping", code: "__proto__" }), null);
  assert.equal(diag.acceptProbe({ type: "load-diagnostics-query", code: "qrcode-panel" }), null);
  assert.equal(diag.badgeForCode("accounts-panel-hidden"), "HID");
  assert.equal(diag.badgeForCode("qrcode-panel"), "UI");
  assert.equal(diag.badgeForCode("cloud-console-panel"), "UI");
  assert.equal(diag.badgeForCode("outside-declared-host"), "");
});

test("empty and unparseable addresses stay unreadable", () => {
  for (const value of ["", "not a url", null, undefined]) {
    const rendered = diag.renderDiagnosis(diag.classifyUrl(value), null);
    assert.equal(rendered.code, "unreadable");
    assert.equal(rendered.text.includes("http"), false);
  }
});
