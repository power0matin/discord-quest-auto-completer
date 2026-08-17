const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "quest_completer.js"),
  "utf8",
);
const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;

const elements = new Map();
const document = {
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) {
    return {
      id: "",
      tagName: tag,
      style: {},
      children: [],
      classList: { add(){}, remove(){}, contains(){return false;}, toggle(){} },
      appendChild(x) { this.children.push(x); if (x.id) elements.set(x.id, x); return x; },
      remove() { if (this.id) elements.delete(this.id); },
      addEventListener(){},
      removeEventListener(){},
      querySelector(){ return null; },
      querySelectorAll(){ return []; },
      set innerHTML(v) { this._innerHTML = v; },
      get innerHTML() { return this._innerHTML || ""; },
      set textContent(v) { this._textContent = v; },
      get textContent() { return this._textContent || ""; },
    };
  },
  head: { appendChild(x) { if (x.id) elements.set(x.id, x); } },
  body: { appendChild(x) { if (x.id) elements.set(x.id, x); } },
  addEventListener(){},
  removeEventListener(){},
};

const ctx = {
  console,
  window: { DiscordNative: {} },
  document,
  __QUESTMASTER_TEST__: true,
  globalThis: null,
  setTimeout: (fn, ms) => realSetTimeout(fn, Math.min(ms, 20)),
  clearTimeout: realClearTimeout,
  setInterval: (fn, ms) => realSetTimeout(fn, Math.min(ms, 20)),
  clearInterval: realClearTimeout,
  Date,
  Math,
  Promise,
  Set,
  Map,
  Object,
  Number,
  String,
  Error,
  TypeError,
  RegExp,
  URL,
  AbortController,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.__QuestMasterHooks;
assert(H, "QuestMaster test hooks not exported");

(async () => {
  // 1) Preserve full product surface: this must not regress into the minified rewrite.
  assert(src.length > 90000, "full-featured source unexpectedly shrank");
  for (const marker of [
    "showQuestPicker",
    "orion-options-panel",
    "Sound",
    "Notification",
    "randomDelay",
    "Consent",
    "Vencord",
  ]) {
    assert(src.includes(marker), `feature marker missing: ${marker}`);
  }

  // 2) Version and task routing.
  assert.equal(H.CONFIG.VERSION, "v1.1.0");
  assert.equal(H.Tasks.detectType({ tasks: { PLAY_ACTIVITY: { target: 10 } } }).type, "ACTIVITY");
  assert.equal(H.Tasks.detectType({ tasks: { PLAY_ON_DESKTOP: { target: 10 } } }).type, "GAME");
  assert.equal(H.Tasks.detectType({ tasks: { ACHIEVEMENT_IN_ACTIVITY: { target: 1 } } }).type, "ACHIEVEMENT");
  assert.equal(H.Tasks.detectType({ tasks: { FUTURE_UNKNOWN: { target: 9 } } }), null);

  // 3) Progress is server-authoritative.
  assert.equal(H.Tasks.readProgress({}, "PLAY_ACTIVITY", ["PLAY_ACTIVITY"]), null);
  assert.equal(H.Tasks.readProgress({ progress: { PLAY_ACTIVITY: { value: 22 } } }, "PLAY_ACTIVITY"), 22);
  assert(!src.includes("cur + 20"), "synthetic activity progress returned");

  // 4) A permanently hung operation times out.
  let timedOut = false;
  try {
    await H.withTimeout(new Promise(() => {}), 5, "hung");
  } catch (e) {
    timedOut = e.code === "ETIMEDOUT";
  }
  assert(timedOut, "hung operation did not time out");

  // 5) A hung request cannot permanently lock the Traffic queue.
  let calls = 0;
  H.setMods({
    API: {
      post({ url }) {
        calls++;
        return url === "/hung"
          ? new Promise(() => {})
          : Promise.resolve({ body: { ok: true } });
      },
    },
  });
  H.RUNTIME.running = true;
  H.Traffic.stopped = false;
  H.Traffic.processing = false;
  H.Traffic.queue = [];
  const first = H.Traffic.enqueue("/hung", {}).then(() => false, () => true);
  const second = H.Traffic.enqueue("/next", {});
  assert(await first, "hung request should reject");
  assert((await second).body.ok, "queue did not recover after timeout");

  // 6) Transient errors retry and recover.
  calls = 0;
  H.setMods({
    API: {
      post() {
        calls++;
        return calls < 3
          ? Promise.reject({ status: 500, body: { message: "temporary" } })
          : Promise.resolve({ body: { ok: true } });
      },
    },
  });
  H.Traffic.stopped = false;
  H.Traffic.processing = false;
  H.Traffic.queue = [];
  const recovered = await H.Traffic.enqueue("/retry", {});
  assert(recovered.body.ok);
  assert.equal(calls, 3, "transient retry count mismatch");

  // 7) Retryable vs terminal failures are distinct.
  assert(H.ErrorHandler.classify({ status: 500 }).isRetryable);
  assert(H.ErrorHandler.classify({ status: 403 }).isTerminalQuestError);
  assert(H.ErrorHandler.classify({ code: "ETIMEDOUT", message: "timed out" }).isRetryable);

  // 8) Transient task failure is deferred; terminal failure is skipped.
  const qTransient = { id: "qt" };
  const task = { name: "Transient Quest", type: "VIDEO", target: 10 };
  H.Tasks.failTask(qTransient, task, "temporary");
  assert(!H.Tasks.skipped.has("qt"), "transient quest was permanently skipped");
  assert(H.Tasks.retryAfter.has("qt"), "transient quest has no retry schedule");

  const qTerminal = { id: "qp" };
  H.Tasks.failTask(qTerminal, task, "forbidden", { permanent: true });
  assert(H.Tasks.skipped.has("qp"), "terminal quest was not skipped");

  // 9) RunningGameStore patch is fully restored.
  const store = {
    getRunningGames() { return [{ pid: 1 }]; },
    getGameForPID(pid) { return pid === 1 ? { pid: 1 } : null; },
  };
  const origGames = store.getRunningGames;
  const origPid = store.getGameForPID;
  H.setMods({ RunStore: store, Dispatcher: { dispatch() {} } });
  assert(H.Patcher.init(store));
  H.Patcher.add({ pid: 9 });
  assert(store.getRunningGames().some((g) => g.pid === 9));
  H.Patcher.clean();
  assert.strictEqual(store.getRunningGames, origGames);
  assert.strictEqual(store.getGameForPID, origPid);

  // 10) One concurrent task rejecting must not abort siblings.
  const order = [];
  H.RUNTIME.running = true;
  await H.runConcurrent([
    async () => { order.push("a"); throw new Error("boom"); },
    async () => { order.push("b"); },
    async () => { order.push("c"); },
  ], 2);
  assert.deepEqual(order.sort(), ["a", "b", "c"], "one task failure aborted the batch");

  // 10b) VIDEO handler only completes from server-confirmed progress.
  H.RUNTIME.autoClaim = false;
  H.RUNTIME.running = true;
  H.Tasks.completed.delete("video-q");
  let videoCalls = 0;
  H.setMods({
    API: {
      post({ url }) {
        if (url.includes("/video-progress")) {
          videoCalls++;
          return Promise.resolve({
            body: {
              progress: { WATCH_VIDEO: { value: videoCalls >= 2 ? 3 : 0 } },
              completed_at: videoCalls >= 2 ? "now" : null,
            },
          });
        }
        return Promise.resolve({ body: {} });
      },
    },
  });
  H.Traffic.stopped = false;
  H.Traffic.processing = false;
  H.Traffic.queue = [];
  await H.Tasks.VIDEO(
    { id: "video-q", userStatus: {} },
    { name: "Video", type: "WATCH_VIDEO", keyName: "WATCH_VIDEO", target: 3 },
    {},
  );
  assert(H.Tasks.completed.has("video-q"), "server-confirmed video quest did not finish");
  assert(videoCalls >= 2);

  // 10c) GAME handler cleans up its patch and awaits completion.
  H.RUNTIME.running = true;
  H.RUNTIME.autoClaim = false;
  H.Tasks.completed.delete("game-q");
  let heartbeatHandler = null;
  const gameStore = {
    getRunningGames() { return []; },
    getGameForPID() { return null; },
  };
  const dispatcher2 = {
    dispatch() {},
    subscribe(_event, fn) { heartbeatHandler = fn; },
    unsubscribe(_event, fn) { if (heartbeatHandler === fn) heartbeatHandler = null; },
  };
  H.setMods({
    API: {
      get() {
        return Promise.resolve({
          body: [{ name: "Mock Game", executables: [{ os: "win32", name: "mock.exe" }] }],
        });
      },
      post() { return Promise.resolve({ body: {} }); },
    },
    RunStore: gameStore,
    Dispatcher: dispatcher2,
  });
  assert(H.Patcher.init(gameStore));
  const originalGameGetter = gameStore.getRunningGames;
  const gp = H.Tasks.GAME(
    { id: "game-q", userStatus: {} },
    { name: "Game", type: "GAME", keyName: "PLAY_ON_DESKTOP", target: 5, appId: "123" },
    {},
  );
  await new Promise((r) => realSetTimeout(r, 5));
  assert.equal(typeof heartbeatHandler, "function", "game heartbeat subscription missing");
  heartbeatHandler({
    questId: "game-q",
    userStatus: { progress: { PLAY_ON_DESKTOP: { value: 5 } } },
  });
  await gp;
  assert(H.Tasks.completed.has("game-q"), "game quest did not complete from heartbeat");
  assert.strictEqual(gameStore.getRunningGames, originalGameGetter, "game store was not restored");
  assert.equal(heartbeatHandler, null, "heartbeat listener leaked after game completion");

  // 11) finish() is deduplicated and awaited through auto-claim.
  H.Tasks.completed.delete("finish-q");
  H.RUNTIME.autoClaim = true;
  let claimCalls = 0;
  H.setMods({
    API: {
      post({ url }) {
        if (url.includes("claim-reward")) {
          claimCalls++;
          return Promise.resolve({ body: { claimed_at: "now" } });
        }
        return Promise.resolve({ body: {} });
      },
    },
  });
  H.Traffic.stopped = false;
  H.Traffic.processing = false;
  H.Traffic.queue = [];
  const fq = { id: "finish-q" };
  const ft = { name: "Finish Quest", type: "VIDEO", target: 1 };
  const f1 = H.Tasks.finish(fq, ft);
  const f2 = H.Tasks.finish(fq, ft);
  await Promise.all([f1, f2]);
  assert(H.Tasks.completed.has("finish-q"));
  assert.equal(claimCalls, 1, "finish deduplication failed / reward claimed twice");

  // 12) Long target gets target + grace rather than a fixed 25m hard cut.
  const longMs = H.taskTimeoutMs({ target: 60 * 60 });
  assert(longMs > 60 * 60 * 1000, "long quest runtime does not include grace");
  assert(H.taskTimeoutMs({ target: 10 }) >= H.SYS.MAX_TIME);

  // 13) Static lifecycle guards.
  for (const marker of [
    "Tasks.inFlight.add(q.id)",
    "Tasks.inFlight.delete(q.id)",
    "Tasks.completed.has(q.id)",
    "Tasks.canRun(q.id)",
    "await this.finish(q, t)",
    "cancelRuntimeTimers()",
    "Traffic.stop()",
  ]) {
    assert(src.includes(marker), `lifecycle guard missing: ${marker}`);
  }

  H.RUNTIME.autoClaim = false;
  H.RUNTIME.running = false;
  H.Traffic.stop();
  console.log("reliability.test.js: PASS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
