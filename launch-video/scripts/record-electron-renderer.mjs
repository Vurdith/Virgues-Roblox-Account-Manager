import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const outputDir = process.argv[2];
const fps = Number(process.argv[3] ?? 15);
const durationSeconds = Number(process.argv[4] ?? 20);

if (!outputDir) {
  throw new Error("Pass an output directory.");
}

fs.mkdirSync(outputDir, { recursive: true });

const targets = await (await fetch("http://localhost:9222/json/list")).json();
const target = targets.find((item) => item.type === "page");
if (!target) {
  throw new Error("No Electron renderer target was found on port 9222.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

socket.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

const clickNav = async (wanted) => {
  const expression = `(() => {
    const wanted = ${JSON.stringify(wanted)};
    const candidates = Array.from(document.querySelectorAll("button, [role=button]"));
    const element = candidates.find((node) => {
      const label = (node.textContent || "").replace(/\\s+/g, " ").trim();
      return label === wanted || label.startsWith(wanted + " ") || label.includes(wanted);
    });
    if (!element) return { ok: false };
    element.click();
    return { ok: true };
  })()`;

  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (!result.result?.value?.ok) {
    throw new Error(`Could not navigate to ${wanted}.`);
  }
};

const capture = async (frame) => {
  const result = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const fileName = `frame-${String(frame).padStart(6, "0")}.png`;
  fs.writeFileSync(path.join(outputDir, fileName), Buffer.from(result.data, "base64"));
};

await clickNav("Accounts");
await sleep(900);

const actions = [
  { at: 2.6, view: "Games" },
  { at: 6.6, view: "Sessions" },
  { at: 10.6, view: "Accounts" },
  { at: 14.5, view: "Games" },
  { at: 17.4, view: "Accounts" },
];

const totalFrames = Math.ceil(durationSeconds * fps);
const startedAt = performance.now();
let actionIndex = 0;

for (let frame = 0; frame < totalFrames; frame += 1) {
  const elapsed = (performance.now() - startedAt) / 1000;
  while (actionIndex < actions.length && actions[actionIndex].at <= elapsed) {
    await clickNav(actions[actionIndex].view);
    actionIndex += 1;
    await sleep(120);
  }

  await capture(frame);

  const targetTime = startedAt + ((frame + 1) * 1000) / fps;
  const waitFor = targetTime - performance.now();
  if (waitFor > 0) await sleep(waitFor);
}

console.log(JSON.stringify({ outputDir, fps, durationSeconds, totalFrames }));
socket.close();
