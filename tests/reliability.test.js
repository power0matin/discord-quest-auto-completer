const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "quest_completer.js"), "utf8");
const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;

const document = {
  getElementById() { return null; },
  createElement() { return { style: {}, appendChild() {}, remove() {} }; },
  head: { appendChild() {} },
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
};

const ctx = {
  console,
  window: { DiscordNative: {} },
  document,
  __QUESTMASTER_TEST__: true,
  globalThis: null,
  setTimeout: (fn, ms) => realSetTimeout(fn, Math.min(ms, 25)),
  clearTimeout: realClearTimeout,
  Date,
  Math,
  Promise,
  Set,
  Map,
  Object,
  Number,
  String,
  Error,
  RegExp,
  URL,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ctx.__QuestMasterHooks;

(async () => {
  assert(H, "test hooks should be exported");

  // Quest type routing must distinguish PLAY_ACTIVITY from PLAY_ON_DESKTOP.
  assert.equal(H.T.detect({ tasks: { PLAY_ACTIVITY: { target: 10 } } }, "1").type, "ACTIVITY");
  assert.equal(H.T.detect({ tasks: { PLAY_ON_DESKTOP: { target: 10 } } }, "1").type, "GAME");
  assert.equal(H.T.detect({ tasks: { ACHIEVEMENT_IN_ACTIVITY: { target: 1 } } }, "1").type, "ACHIEVEMENT");

  // Progress must be server-authoritative; missing progress must not be fabricated.
  assert.equal(H.T.prog({}, "PLAY_ACTIVITY", ["PLAY_ACTIVITY"]), null);
  assert.equal(H.T.prog({ progress: { PLAY_ACTIVITY: { value: 22 } } }, "PLAY_ACTIVITY"), 22);

  // A permanently hung operation must time out.
  let timedOut = false;
  try {
    await H.timeout(new Promise(() => {}), 5, "hung");
  } catch (e) {
    timedOut = e.code === "ETIMEDOUT";
  }
  assert(timedOut, "hung request should reject with ETIMEDOUT");

  // A hung request must not permanently block the request queue.
  let calls = 0;
  H.setMods({
    API: {
      post() {
        calls++;
        return calls === 1 ? new Promise(() => {}) : Promise.resolve({ body: { ok: true } });
      },
    },
  });
  H.R.running = true;
  H.Net.stopped = false;
  H.Net.busy = false;
  H.Net.q = [];
  const first = H.Net.req("post", "/hung", {}, { retries: 0 }).then(() => false, () => true);
  const second = H.Net.req("post", "/next", {}, { retries: 0 });
  assert(await first, "first request should fail after timeout");
  assert((await second).body.ok, "queue should continue to the next request");

  // Transient HTTP failures should retry and recover without killing the run.
  calls = 0;
  H.setMods({
    API: {
      post() {
        calls++;
        return calls < 3
          ? Promise.reject({ status: 500, body: { message: "temp" } })
          : Promise.resolve({ body: { ok: true } });
      },
    },
  });
  H.Net.stopped = false;
  H.Net.busy = false;
  H.Net.q = [];
  assert((await H.Net.req("post", "/retry", {}, { retries: 4 })).body.ok);
  assert.equal(calls, 3, "request should recover on third attempt");

  // Discord store patching must restore the exact original functions.
  const store = {
    getRunningGames() { return [{ pid: 1 }]; },
    getGameForPID(pid) { return pid === 1 ? { pid: 1 } : null; },
  };
  const dispatcher = { dispatch() {} };
  H.setMods({ RunStore: store, Dispatcher: dispatcher });
  assert(H.Patch.init(store));
  const originalGetRunningGames = store.getRunningGames;
  H.Patch.add({ pid: 9 });
  assert(store.getRunningGames().some((x) => x.pid === 9));
  H.Patch.clean();
  assert.strictEqual(store.getRunningGames, originalGetRunningGames);
  assert(!store.getRunningGames().some((x) => x.pid === 9));

  // Error classification must separate recoverable and terminal failures.
  assert(H.EH.classify({ status: 500 }).retry);
  assert(H.EH.classify({ status: 403 }).terminal);
  assert(H.EH.classify({ code: "ETIMEDOUT", message: "timed out" }).retry);

  // Static regression guards for the reliability properties above.
  assert(!src.includes("cur + 20"), "synthetic activity progress must not return");
  assert(src.includes("ETIMEDOUT"), "request timeout protection must exist");
  assert(src.indexOf('"PLAY_ACTIVITY","ACTIVITY"') < src.indexOf('"PLAY_ON_DESKTOP","GAME"'));
  assert(src.includes("R.done") && src.includes("R.terminal") && src.includes("R.inflight"));
  assert(src.includes("finally{R.inflight.delete(q.id)}"), "one failed task must release its in-flight slot");
  assert(src.includes("Promise.all([concurrent(v,2),concurrent(o,1)])"), "multi-quest processing should remain independent");

  H.R.running = false;
  H.Net.stop();
  console.log("reliability.test.js: PASS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
