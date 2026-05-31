import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manifest exposes installable app metadata", async () => {
  const root = new URL("..", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));

  assert.equal(manifest.name, "婴语");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.icons[0].src, "./icon.svg");
});

test("pages register manifest, icon, and service worker script", async () => {
  const root = new URL("..", import.meta.url);
  for (const file of ["index.html", "privacy.html", "report.html", "feedback-report.html"]) {
    const html = await readFile(new URL(file, root), "utf8");
    assert.match(html, /manifest\.webmanifest/, file);
    assert.match(html, /icon\.svg/, file);
    assert.match(html, /pwa\.js/, file);
  }
});

test("main page includes recent feedback surface", async () => {
  const root = new URL("..", import.meta.url);
  const html = await readFile(new URL("index.html", root), "utf8");
  const css = await readFile(new URL("styles.css", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");

  assert.match(html, /recentFeedback/);
  assert.match(html, /最近反馈/);
  assert.match(html, /测试版/);
  assert.match(html, /environmentHint/);
  assert.match(html, /privacy\.html/);
  assert.match(css, /recent-item/);
  assert.match(css, /release-notice/);
  assert.match(css, /info-panel/);
  assert.match(app, /summarizeRecentSessions/);
  assert.match(app, /canUseMicrophone/);
});

test("privacy page explains local audio handling and safety boundary", async () => {
  const root = new URL("..", import.meta.url);
  const html = await readFile(new URL("privacy.html", root), "utf8");

  assert.match(html, /录音默认只在当前浏览器本地分析/);
  assert.match(html, /不是医疗诊断/);
  assert.match(html, /返回婴语/);
});

test("main page app renders action-flow feedback controls", async () => {
  const root = new URL("..", import.meta.url);
  const css = await readFile(new URL("styles.css", root), "utf8");
  const app = await readFile(new URL("app.js", root), "utf8");

  assert.match(css, /action-step/);
  assert.match(css, /step-actions/);
  assert.match(app, /buildActionFlow/);
  assert.match(app, /recordUnresolvedAttempt/);
  assert.match(app, /buildCalibrationItems/);
});

test("service worker caches core app shell resources", async () => {
  const root = new URL("..", import.meta.url);
  const sw = await readFile(new URL("sw.js", root), "utf8");

  for (const asset of [
    "./index.html",
    "./privacy.html",
    "./report.html",
    "./feedback-report.html",
    "./app.js",
    "./audio-core.js",
    "./live-quality.js",
    "./feedback-store.js",
    "./feedback-report.js",
    "./manifest.webmanifest",
    "./icon.svg"
  ]) {
    assert.match(sw, new RegExp(escapeRegExp(asset)), asset);
  }
  assert.match(sw, /cache\.addAll/);
  assert.match(sw, /caches\.match/);
});

test("server serves webmanifest with manifest content type mapping", async () => {
  const root = new URL("..", import.meta.url);
  const server = await readFile(new URL("server.mjs", root), "utf8");

  assert.match(server, /\.webmanifest/);
  assert.match(server, /application\/manifest\+json/);
});

test("static deployment files are configured", async () => {
  const root = new URL("..", import.meta.url);
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const vercel = await readFile(new URL("vercel.json", root), "utf8");
  const netlify = await readFile(new URL("netlify.toml", root), "utf8");
  const deploy = await readFile(new URL("DEPLOY.md", root), "utf8");
  const beta = await readFile(new URL("BETA_TEST_MESSAGE.md", root), "utf8");
  const workflow = await readFile(new URL(".github/workflows/pages.yml", root), "utf8");

  assert.equal(packageJson.scripts.build, "node scripts/build-static.mjs");
  assert.equal(packageJson.scripts["check:release"], "node scripts/check-release.mjs");
  assert.equal(packageJson.scripts["package:release"], "node scripts/package-release.mjs");
  assert.match(vercel, /"outputDirectory": "dist"/);
  assert.match(netlify, /publish = "dist"/);
  assert.match(deploy, /HTTPS/);
  assert.match(deploy, /https:\/\/cloriselvis\.github\.io\/yingyu-app\//);
  assert.match(beta, /测试链接/);
  assert.match(beta, /https:\/\/cloriselvis\.github\.io\/yingyu-app\//);
  assert.doesNotMatch(beta, /替换成你的测试链接/);
  assert.match(beta, /不是医疗诊断/);
  assert.match(workflow, /npm run check:release/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
