import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extensionDir = path.join(root, "load-diagnostics");
const originalManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const diagnosticManifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));

const forbiddenInExtension = [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /declarativeNetRequest/,
  /userAgent/,
  /User-Agent/,
  /idv_xdevice/,
  /batchexecute/,
  /MypxBd/,
  /YDtwf/,
  /localStorage/,
  /sendBeacon/,
  /chrome\.scripting/,
  /\beval\s*\(/,
  /new Function/,
  /Mozilla\/5\.0/,
  /document\.cookie/,
  /location\.search/,
  /location\.href/,
  /location\.hash/,
];

test("original package is unchanged and still has the silent gate", () => {
  assert.equal(originalManifest.version, "1.1.0");
  assert.equal(originalManifest.name, "Google QR 自动降级短信助手");
  assert.equal(Object.hasOwn(originalManifest, "action"), false);
  assert.deepEqual(originalManifest.content_scripts[1].js, ["content.js"]);
  const original = fs.readFileSync(path.join(root, "content.js"), "utf8");
  assert.match(original, /if \(!isCloudConsole && !isQrPage\) \{\s*return;\s*\}/);
});

test("diagnostic manifest is a separately named subset and does not add host access", () => {
  assert.equal(diagnosticManifest.manifest_version, 3);
  assert.equal(diagnosticManifest.name, "加载诊断（不恢复短信）");
  assert.equal(diagnosticManifest.version, "0.1.0");
  assert.notEqual(diagnosticManifest.name, originalManifest.name);
  assert.ok(diagnosticManifest.description.length <= 132);
  assert.match(diagnosticManifest.description, /不恢复短信/);
  assert.deepEqual(diagnosticManifest.permissions, ["activeTab"]);
  assert.deepEqual(diagnosticManifest.host_permissions, [
    "https://accounts.google.com/*",
    "https://console.cloud.google.com/*",
  ]);
  for (const host of diagnosticManifest.host_permissions) {
    assert.ok(originalManifest.host_permissions.includes(host));
  }
  assert.equal(diagnosticManifest.host_permissions.includes("https://g.co/*"), false);
  assert.equal(diagnosticManifest.action.default_popup, "popup.html");
  assert.equal(diagnosticManifest.background.service_worker, "service-worker.js");
  assert.deepEqual(diagnosticManifest.content_scripts[0].matches, diagnosticManifest.host_permissions);
  assert.deepEqual(diagnosticManifest.content_scripts[0].js, ["diagnose.js", "content.js"]);
  assert.equal(diagnosticManifest.content_scripts[0].world, undefined);
  for (const key of ["externally_connectable", "oauth2", "update_url", "devtools_page", "chrome_url_overrides"]) {
    assert.equal(Object.hasOwn(diagnosticManifest, key), false);
  }
});

test("diagnostic sources do not perform network or spoofing actions", () => {
  const files = fs.readdirSync(extensionDir).filter((name) => name.endsWith(".js") || name.endsWith(".html") || name.endsWith(".css"));
  assert.ok(files.length >= 5);
  for (const name of files) {
    const source = fs.readFileSync(path.join(extensionDir, name), "utf8");
    for (const pattern of forbiddenInExtension) {
      assert.equal(pattern.test(source), false, `${name} matched ${pattern}`);
    }
    if (name.endsWith(".js")) {
      execFileSync(process.execPath, ["--check", path.join(extensionDir, name)], { stdio: "pipe" });
    }
  }
  const popup = fs.readFileSync(path.join(extensionDir, "popup.js"), "utf8");
  assert.equal(popup.includes("classifyUrl(tab && tab.url)"), true);
  assert.equal(/textContent\s*=\s*[^;\n]*url/.test(popup), false);
  const content = fs.readFileSync(path.join(extensionDir, "content.js"), "utf8");
  assert.equal(content.includes("appendChild"), false);
  const html = fs.readFileSync(path.join(extensionDir, "popup.html"), "utf8");
  assert.match(html, /不恢复短信/);
  assert.match(html, /HID/);
  assert.equal(html.includes("一键降级"), false);
});

test("packed zip matches the checksum and omits the original extension", () => {
  execFileSync("python3", [path.join(root, "tests/load-diagnostics/pack.py"), "--check"], {
    cwd: root,
    stdio: "pipe",
  });
  const zipName = "qr-helper-load-diagnostics-0.1.0.zip";
  const zipPath = path.join(root, "dist", zipName);
  const bytes = fs.readFileSync(zipPath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const sums = fs.readFileSync(path.join(root, "dist/SHA256SUMS.txt"), "utf8").trim();
  assert.equal(sums, `${hash}  ${zipName}`);
  const listing = execFileSync("python3", ["-c", `
import zipfile
print("\\n".join(sorted(zipfile.ZipFile(${JSON.stringify(zipPath)}).namelist())))
`], { encoding: "utf8" });
  const names = listing.trim().split("\n");
  assert.deepEqual(names, [
    "load-diagnostics/README.md",
    "load-diagnostics/content.js",
    "load-diagnostics/diagnose.js",
    "load-diagnostics/manifest.json",
    "load-diagnostics/popup.css",
    "load-diagnostics/popup.html",
    "load-diagnostics/popup.js",
    "load-diagnostics/service-worker.js",
  ]);
  const bundledManifest = JSON.parse(execFileSync("python3", ["-c", `
import json, zipfile
archive = zipfile.ZipFile(${JSON.stringify(zipPath)})
print(archive.read("load-diagnostics/manifest.json").decode("utf-8"))
`], { encoding: "utf8" }));
  assert.equal(bundledManifest.name, "加载诊断（不恢复短信）");
  assert.equal(JSON.stringify(bundledManifest).includes("declarativeNetRequest"), false);
});
