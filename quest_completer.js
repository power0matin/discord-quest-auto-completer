(async () => {
  "use strict";

  /* ── config (Safe for users to edit) ────────────────────────── */

  const CONFIG = {
    NAME: "QuestMaster",
    VERSION: "v1.1.0",
    THEME: "#5865F2", // discord blurple
    SUCCESS: "#3BA55C",
    WARN: "#faa61a",
    ERR: "#f04747",
    HIDE_ACTIVITY: false, // suppress RPC status from friends list
    MAX_LOG_ITEMS: 60, // UI log limit
  };

  /* ── internal system limits (DO NOT EDIT) ─────────────────── */

  const SYS = Object.freeze({
    MAX_TIME: 25 * 60 * 1000, // minimum per-task runtime budget
    TASK_GRACE_TIME: 10 * 60 * 1000,
    STALL_TIME: 8 * 60 * 1000,
    REQUEST_TIMEOUT: 20 * 1000,
    MAX_RETRY_DELAY: 15 * 1000,
    MAX_TASK_FAILURES: 5,
    MAX_RETRIES: 3,
    RELAY_PROBE_TTL: 5 * 1000,
    IS_DESKTOP: typeof window.DiscordNative !== "undefined",
  });

  // mutable runtime state lives here, CONFIG stays read-only
  const RUNTIME = {
    running: true,
    cleanups: new Set(), // tracks active event listeners for safe shutdown
    sleepTimers: new Map(),
    timeoutTimers: new Map(),
    autoEnroll: true, // whether to auto-enroll in quests before execution
    autoClaim: false, // whether to try auto-claiming quest rewards
    playSound: false, // whether to play an audio cue on quest completion
    randomDelay: false, // whether to inject randomized 1-30min idle gaps between quests (anti-detection)
  };

  /* ── audio cue ───────────────────────────────────────────────── */
  const Sound = {
    _ctx: null,
    play(type) {
      if (!RUNTIME.playSound) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!this._ctx || this._ctx.state === "closed") this._ctx = new Ctx();
        const ctx = this._ctx;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        const t0 = ctx.currentTime;
        if (type === "done") {
          o.frequency.setValueAtTime(523.25, t0);
          o.frequency.setValueAtTime(659.25, t0 + 0.12);
          o.frequency.setValueAtTime(783.99, t0 + 0.24);
          g.gain.setValueAtTime(0.55, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
          o.start(t0);
          o.stop(t0 + 0.6);
        } else {
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.45, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
          o.start(t0);
          o.stop(t0 + 0.2);
        }
      } catch (_) {}
    },
  };

  /* ── OAuth consent gate ────────────────────────────────────── */
  const Consent = {
    _granted: new Set(),
    TIMEOUT: 60000,
    SCOPES: ["identify", "applications.commands", "applications.entitlements"],
    ask(appId, appName) {
      if (this._granted.has(appId)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const ov = document.createElement("div");
        ov.id = "orion-consent";
        ov.style.cssText =
          "position:fixed;inset:0;z-index:1002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:var(--font-primary);";
        ov.innerHTML = `<div style="width:420px;max-width:92vw;background:var(--background-base-low);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-button-overlay);color:var(--text-default);overflow:hidden;">
                    <div style="padding:14px 16px;background:var(--background-mod-muted);border-bottom:1px solid var(--border-subtle);font-weight:700;color:var(--text-strong);">Authorize application?</div>
                    <div style="padding:16px;font-size:13px;line-height:1.5;">
                        <div>To complete this achievement quest, QuestMaster needs to OAuth-authorize this app on your Discord account:</div>
                        <div id="oc-app" style="font-weight:700;color:var(--text-strong);margin:6px 0;"></div>
                        <div style="color:var(--text-muted);">Scopes requested:</div>
                        <ul id="oc-scopes" style="margin:4px 0 10px;padding-left:18px;color:var(--text-muted);"></ul>
                        <div style="color:var(--text-feedback-warning);">The app's backend receives a real authorization code. QuestMaster revokes the grant immediately after the quest is marked complete. Discord enforcement against quest automation can affect the whole account.</div>
                        <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;color:var(--text-muted);">
                            <input type="checkbox" id="oc-remember" class="native-cb"> Don't ask again for this app this session</label>
                    </div>
                    <div style="display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--border-subtle);">
                        <button id="oc-no" class="quest-pick-btn deselect" style="flex:1;">Cancel</button>
                        <button id="oc-yes" class="quest-pick-btn start" style="flex:1;">Authorize</button>
                    </div></div>`;
        document.body.appendChild(ov);
        ov.querySelector("#oc-app").textContent = appName
          ? `${appName} (${appId})`
          : `App ${appId}`;
        const ul = ov.querySelector("#oc-scopes");
        this.SCOPES.forEach((s) => {
          const li = document.createElement("li");
          li.textContent = s;
          ul.appendChild(li);
        });
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          document.removeEventListener("keydown", onKey);
          if (v && ov.querySelector("#oc-remember").checked)
            this._granted.add(appId);
          ov.remove();
          resolve(v);
        };
        const onKey = (e) => {
          if (e.key === "Escape") finish(false);
        };
        ov.querySelector("#oc-yes").addEventListener("click", () =>
          finish(true),
        );
        ov.querySelector("#oc-no").addEventListener("click", () =>
          finish(false),
        );
        ov.addEventListener("mousedown", (e) => {
          if (e.target === ov) finish(false);
        });
        document.addEventListener("keydown", onKey);
        const timer = setTimeout(() => finish(false), this.TIMEOUT);
      });
    },
  };

  const ICONS = Object.freeze({
    OPT: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.8-1.37 1.16-2.53.98-.45-.07-.93.18-.99.64a11.1 11.1 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.7-1.43 2.49-1.1.8.33 1.16 1.37.98 2.53-.07.45.18.93.64.99a11.1 11.1 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.8 1.37-1.16 2.53-.98.45.07.93-.18.99-.64a11.1 11.1 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a11.07 11.07 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.8-.33-1.16-1.37-.98-2.53.07-.45-.18-.93-.64-.99a11.1 11.1 0 0 0-2.88 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/></svg>`,
    BOLT: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.29-.62L14.5 3h1l-1 7h3.5c.58 0 .57.32.29.62L11 21z"/></svg>`,
    VIDEO: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
    GAME: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
    STREAM: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    ACTIVITY: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`,
    CHECK: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    CLOCK: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`,
    STOP: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`,
  });

  const CONST = Object.freeze({
    ID: "1412491570820812933", // blacklisted quest — known to break enrollment
    EVT: Object.freeze({
      HEARTBEAT: "QUESTS_SEND_HEARTBEAT_SUCCESS",
      GAME: "RUNNING_GAMES_CHANGE",
      RPC: "LOCAL_ACTIVITY_UPDATE",
    }),
  });

  if (window.orionLock) {
    const existingUI = document.getElementById("orion-ui");
    if (existingUI) existingUI.style.display = "flex";
    return console.warn(`[${CONFIG.NAME}] Already running.`);
  }
  window.orionLock = true;

  /* ── util ──────────────────────────────────────────────────── */

  const sleep = (ms) =>
    new Promise((resolve) => {
      if (!RUNTIME.running) return resolve(false);
      const id = setTimeout(() => {
        RUNTIME.sleepTimers.delete(id);
        resolve(RUNTIME.running);
      }, ms);
      RUNTIME.sleepTimers.set(id, resolve);
    });

  const cancelRuntimeTimers = () => {
    for (const [id, resolve] of RUNTIME.sleepTimers) {
      clearTimeout(id);
      try {
        resolve(false);
      } catch (_) {}
    }
    RUNTIME.sleepTimers.clear();

    for (const [id, reject] of RUNTIME.timeoutTimers) {
      clearTimeout(id);
      try {
        const e = new Error("Shutdown");
        e.code = "ESHUTDOWN";
        reject(e);
      } catch (_) {}
    }
    RUNTIME.timeoutTimers.clear();
  };

  const withTimeout = (promise, ms = SYS.REQUEST_TIMEOUT, label = "operation") =>
    new Promise((resolve, reject) => {
      let settled = false;
      const id = setTimeout(() => {
        if (settled) return;
        settled = true;
        RUNTIME.timeoutTimers.delete(id);
        const e = new Error(`${label} timed out`);
        e.code = "ETIMEDOUT";
        reject(e);
      }, ms);
      RUNTIME.timeoutTimers.set(id, reject);

      Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(id);
          RUNTIME.timeoutTimers.delete(id);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(id);
          RUNTIME.timeoutTimers.delete(id);
          reject(error);
        },
      );
    });

  const fetchWithTimeout = async (
    url,
    options = {},
    ms = SYS.REQUEST_TIMEOUT,
    label = "fetch",
  ) => {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const request = fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
    try {
      return await withTimeout(request, ms, label);
    } catch (e) {
      if (e?.code === "ETIMEDOUT") {
        try {
          controller?.abort();
        } catch (_) {}
      }
      throw e;
    }
  };

  const taskTimeoutMs = (task) => {
    const targetSeconds = Number(task?.target ?? 0);
    const targetBudget =
      Number.isFinite(targetSeconds) && targetSeconds > 0
        ? targetSeconds * 1000 + SYS.TASK_GRACE_TIME
        : SYS.MAX_TIME;
    return Math.max(SYS.MAX_TIME, targetBudget);
  };

  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const notExpired = (q) => {
    const raw = q?.config?.expiresAt;
    if (!raw) return true;
    const expiresAt = new Date(raw).getTime();
    return Number.isNaN(expiresAt) || expiresAt > Date.now();
  };

  /* ── error classification ─────────────────────────────────── */

  const ErrorHandler = {
    RETRYABLE: new Set([408, 425, 429, 500, 502, 503, 504]),
    CLIENT_ERRORS: new Set([400, 401, 403, 404, 409, 410]),
    TERMINAL_QUEST_ERRORS: new Set([401, 403, 404, 410]),

    classify(error) {
      const status = error?.status ?? error?.statusCode;
      const isTimeout =
        error?.code === "ETIMEDOUT" || /timed out/i.test(error?.message ?? "");
      return {
        isRetryable:
          isTimeout || status == null || this.RETRYABLE.has(Number(status)),
        isClientError: this.CLIENT_ERRORS.has(Number(status)),
        isTerminalQuestError: this.TERMINAL_QUEST_ERRORS.has(Number(status)),
        status,
        message:
          error?.message ??
          error?.body?.message ??
          `HTTP ${status ?? "UNKNOWN"}`,
      };
    },

    isSkippableQuest(error) {
      const status = error?.status ?? error?.statusCode;
      return this.TERMINAL_QUEST_ERRORS.has(Number(status));
    },
  };

  /* ── UI + logger ──────────────────────────────────────────── */

  const Logger = {
    root: null,
    tasks: new Map(),
    tickerId: null,
    keyHandler: null,

    init() {
      const oldUI = document.getElementById("orion-ui");
      if (oldUI) oldUI.remove();
      const oldStyle = document.getElementById("orion-styles");
      if (oldStyle) oldStyle.remove();

      const style = document.createElement("style");
      style.id = "orion-styles";
      style.innerHTML = `
                @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); margin: 0; padding: 0; height: 0; border: none; } }

                #orion-ui {
                    position: fixed; top: 32px; left: auto; right: 20px; width: 380px;
                    max-height: 53vh;
                    background: var(--background-base-low); color: var(--text-default);
                    border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-button-overlay); z-index: 1001;
                    font-family: var(--font-primary);
                    overflow: hidden; animation: slideIn 0.3s ease; 
                    display: flex; flex-direction: column; box-sizing: border-box;
                    user-select: none;-webkit-app-region: no-drag;
                }

                #orion-head { padding: 12px 16px; background: var(--background-mod-muted); flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); cursor: grab; }
                #orion-head.dragging { cursor: grabbing; background: var(--control-secondary-background-default); }
                #orion-title { font-weight: 700; font-size: 15px; color: var(--text-strong); display: flex; align-items: center; gap: 8px; }
                #orion-title svg { color: var(--text-brand); }
                .dev-credit { font-size: 12px; margin-left: -4px; padding-top: 2px; font-weight: 500; color: var(--text-muted); }

                #orion-controls { display: flex; gap: 10px; align-items: center; }
                .ctrl-btn { cursor: pointer; transition: 0.2s; display: flex; align-items: center; }
                .ctrl-hide, .ctrl-opts { font-size: 11px; font-weight: 600; color: var(--text-muted); }
                .ctrl-hide:hover, .ctrl-opts:hover { color: var(--text-default); }
                .ctrl-stop { font-size: 11px; font-weight: 700; gap: 4px; padding: 3px 8px 3px 6px; border-radius: var(--radius-sm); background: transparent; border: 1px solid var(--control-critical-primary-background-default); color: var(--control-critical-primary-background-default); }
                .ctrl-stop:hover { background: var(--control-critical-primary-background-default); color: #fff; }

                #orion-logs { padding: 10px 14px; background: var(--background-base-lower); flex: 0 0 auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; height: 110px; overflow-y: auto; border-top: 1px solid var(--border-subtle); scroll-behavior: smooth; }
                .log-item { margin-bottom: 6px; display: flex; gap: 8px; line-height: 1.4; padding-bottom: 4px; }
                .log-ts { opacity: 0.5; min-width: 50px; font-size: 10px; }
                .c-info { color: var(--text-feedback-info); opacity: .8; } .c-success { color: var(--text-feedback-positive); } .c-err { color: var(--text-feedback-critical); } .c-warn { color: var(--text-feedback-warning); } .c-debug { color: #949ba4; }

                #orion-body { flex: 1 1 auto; padding: 12px; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }

                #orion-picker-form { display: flex; flex-direction: column; min-height: 0; }

                #orion-ui ::-webkit-scrollbar { width: 4px; height: 4px; }
                #orion-ui ::-webkit-scrollbar-track { background: transparent; }
                #orion-ui ::-webkit-scrollbar-thumb { background: var(--scrollbar-auto-scrollbar-color-thumb); border-radius: 4px; }

                .task-card { 
                    --state-color: var(--ansi-bright-blue);
                    --icon-bg-opacity: 15%;
                    --icon-color: var(--state-color);

                    display: flex; gap: 12px; padding: 10px 12px; margin-bottom: 8px; align-items: center;
                    background: var(--control-secondary-background-default); 
                    border-radius: var(--radius-sm); border: 1px solid var(--border-muted); 
                    border-left: 4px solid var(--state-color);
                    box-shadow: var(--shadow-low); transition: 0.3s; flex-shrink: 0;
                }
                .task-card.removing { animation: fadeOut 0.4s forwards; }
                .task-card.done { --state-color: var(--ansi-green); --icon-bg-opacity: 100%; --icon-color: #fff; }
                .task-card.failed { --state-color: var(--ansi-red); }
                .task-card.pending { --state-color: var(--ansi-bright-yellow); }

                .task-icon { position: relative; width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto; background-color: color-mix(in srgb, var(--state-color) var(--icon-bg-opacity), transparent); display: flex; align-items: center; justify-content: center; }

                .task-card.running .task-icon::before { content: ''; position: absolute; inset: 0; border-radius: 50%; z-index: 1; background: conic-gradient(lch(71 59 139) 0% var(--p, 0%), var(--border-subtle) var(--p, 0%) 100%); -webkit-mask-image: radial-gradient(circle at center, transparent 16px, black 17px); mask-image: radial-gradient(circle at center, transparent 16px, black 17px); }

                .task-icon-inner { z-index: 2; color: var(--icon-color); display: flex; transition: filter 0.2s, opacity 0.2s; }
                .task-card.running:hover .task-icon-inner { filter: blur(2px); opacity: 0.3; }

                .task-icon-overlay { position: absolute; inset: 0; z-index: 3; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: var(--text-default); opacity: 0; transition: opacity 0.2s; pointer-events: none; }
                .task-card.running:hover .task-icon-overlay { opacity: 1; }

                .task-info { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; justify-content: center; }
                .task-status { font-size: 10px; font-weight: 800; color: var(--state-color); text-transform: uppercase; letter-spacing: 0.5px; }
                .task-name { font-size: 13px; font-weight: 700; color: var(--text-strong); letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
                .task-meta { font-size: 11px; font-weight: 700; color: var(--text-muted); display: flex; justify-content: space-between; }
                .task-actions { flex: 0 0 auto; display: flex; align-items: center; margin-left: 4px; }

                .claim-btn, .goto-btn { padding: 6px 10px; border: none; border-radius: var(--radius-sm); font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap; font-family: inherit; color: #fff; }
                .claim-btn { background: var(--control-connected-background-default); }
                .claim-btn:hover:not(:disabled) { background: var(--control-connected-background-hover); }
                .claim-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .claim-btn.failed { background: var(--control-secondary-background-active); color: var(--text-default); }
                .goto-btn { background: var(--control-primary-background-default); }
                .goto-btn:hover:not(:disabled) { background: var(--control-primary-background-hover); }

                .picker-section-title { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
                .reward-filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; flex-shrink: 0; }

                .reward-filter, .type-filter { background-color: transparent; border: 2px solid; padding: 4px 10px; border-radius: 24px; font-size: 10px; font-weight: 600; cursor: pointer; transition: 0.2s; color: var(--text-subtle); font-family: inherit; }
                .reward-filter:hover, .type-filter:hover { background-color: color-mix(in srgb, currentColor 25%, transparent); }
                .reward-filter.off, .type-filter.off { background: transparent; color: var(--text-muted); opacity: 0.4; }

                .picker-quest-list { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 50px; overflow-y: auto; padding-right: 4px; }

                .quest-pick { display: flex; gap: 12px; padding: 10px; background: var(--control-secondary-background-default); border-radius: var(--radius-sm); border: 1px solid var(--border-muted); border-left-width: 4px; cursor: pointer; transition: 0.2s; align-items: center; user-select: none; flex-shrink: 0; }
                .quest-pick:hover { filter: brightness(1.15); }
                .quest-pick.hidden { display: none !important; }

                .native-cb { appearance: none; width: 20px; height: 20px; margin: 0; flex-shrink: 0; border: 1px solid var(--checkbox-border-default); border-radius: var(--radius-xs); background: transparent; cursor: pointer; transition: 0.15s; display: grid; place-content: center; }
                .native-cb::before {
                    content: ''; width: 12px; height: 12px; opacity: 0; transition: 0.1s;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
                    background-size: contain; background-repeat: no-repeat; background-position: center;
                }
                .native-cb:checked { background: var(--checkbox-background-selected-default); border-color: var(--checkbox-border-selected-default); }
                .native-cb:checked::before { opacity: 1; }

                .picker-options { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
                .orion-option { display: flex; justify-content: space-between; align-items: center; background: var(--control-secondary-background-default); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-muted); }
                .orion-option-label { font-size: 13px; font-weight: 500; color: var(--text-default); }

                .native-toggle { appearance: none; width: 40px; height: 20px; margin: 0; flex-shrink: 0; background: var(--control-secondary-background-default); border-radius: 12px; cursor: pointer; position: relative; transition: 0.2s; border: 1px solid var(--border-muted); }
                .native-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: white; border-radius: 50%; box-shadow: var(--shadow-low); transition: 0.2s; }
                .native-toggle:checked { background: var(--control-primary-background-default); }
                .native-toggle:checked::after { transform: translateX(20px); }

                .picker-actions { display: flex; gap: 10px; padding-top: 12px; flex-shrink: 0; }
                .quest-pick-btn { flex: 1; padding: 10px; border: 1px solid; border-radius: var(--radius-sm, 8px); font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; color: #fff;}
                .quest-pick-btn.start { background-color: var(--control-connected-background-default); border-color: var(--control-connected-border-default); }
                .quest-pick-btn.start:hover:not(:disabled) { background: var(--control-connected-background-hover); border-color: var(--control-connected-border-hover); }
                .quest-pick-btn.deselect { background-color: var(--control-secondary-background-default); border-color: var(--control-secondary-border-default); color: var(--text-default); }
                .quest-pick-btn.deselect:hover:not(:disabled) { background: var(--control-secondary-background-hover); }
                .quest-pick-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            `;
      document.head.appendChild(style);

      this.root = document.createElement("div");
      this.root.id = "orion-ui";
      this.root.innerHTML = `
                <div id="orion-head">
                    <span id="orion-title">${ICONS.BOLT} ${CONFIG.NAME}
                        <span class="dev-credit">by matin</span>
                        <span style="opacity:0.6; font-size:10px; margin-left:4px; padding-top: 3px; font-weight:500;">${CONFIG.VERSION}</span>
                    </span>
                    <div id="orion-controls">
                        <span class="ctrl-btn ctrl-stop" id="orion-stop" title="Stop script">${ICONS.STOP} STOP</span>
                        <span class="ctrl-btn ctrl-hide" id="orion-close" title="Shift + .">HIDE</span>
                        <span class="ctrl-btn ctrl-opts" id="orion-opts" title="Options">${ICONS.OPT}</span>
                    </div>
                </div>
                <div id="orion-body"><div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px; font-weight:500;">Initializing System...</div></div>
                <div id="orion-logs"></div>
            `;
      document.body.appendChild(this.root);

      const head = document.getElementById("orion-head");

      let collapsed = false;
      head.addEventListener("dblclick", (e) => {
        if (e.target.closest(".ctrl-btn")) return;
        collapsed = !collapsed;
        this.root.style.height = collapsed ? "50px" : "";
      });

      head.addEventListener("mousedown", (e) => {
        if (e.target.closest(".ctrl-btn")) return;

        head.classList.add("dragging");

        const startX = e.clientX,
          startY = e.clientY;
        const rect = this.root.getBoundingClientRect();
        const initialLeft = rect.left,
          initialTop = rect.top;

        this.root.style.left = `${initialLeft}px`;
        this.root.style.top = `${initialTop}px`;
        this.root.style.right = "auto";
        e.preventDefault();

        const onMouseMove = (ev) => {
          this.root.style.left = `${Math.max(0, Math.min(initialLeft + (ev.clientX - startX), window.innerWidth - this.root.offsetWidth))}px`;
          this.root.style.top = `${Math.max(0, Math.min(initialTop + (ev.clientY - startY), window.innerHeight - 50))}px`;
        };

        const onMouseUp = () => {
          head.classList.remove("dragging");
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      document
        .getElementById("orion-body")
        .addEventListener("click", async (e) => {
          if (e.target.classList.contains("goto-btn")) {
            if (Mods.Router) Mods.Router.transitionTo("/quest-home");
            return;
          }

          if (e.target.classList.contains("claim-btn")) {
            const btn = e.target;
            if (btn.disabled) return;

            const questId = btn.getAttribute("data-id");
            const taskData = this.tasks.get(questId);
            if (!taskData) return;

            btn.innerText = "WAITING...";
            btn.disabled = true;
            btn.style.opacity = "0.5";

            this.updateTask(questId, { ...taskData, claimState: "WAITING" });

            try {
              const claimRes = await Tasks.claimReward(questId);

              if (claimRes?.body?.claimed_at) {
                btn.innerText = "CLAIMED!";
                this.log(
                  `[Claim] Reward for "${taskData.name}" claimed successfully!`,
                  "success",
                );

                this.updateTask(questId, {
                  ...taskData,
                  status: "CLAIMED",
                  claimable: false,
                  claimState: null,
                });
                setTimeout(() => this.removeTask(questId), 2000);
              }
            } catch (err) {
              this.log(
                `[Claim] Action required for "${taskData.name}". Check Discord UI for captcha.`,
                "warn",
              );
              this.updateTask(questId, { ...taskData, claimState: "FAILED" });
            }
          }
        });

      document.getElementById("orion-close").onclick = () => this.toggle();
      document.getElementById("orion-stop").onclick = () => this.shutdown();
      this.keyHandler = (e) =>
        (e.key === ">" || (e.shiftKey && e.key === ".")) && this.toggle();
      document.addEventListener("keydown", this.keyHandler);

      document.getElementById("orion-opts").addEventListener("click", () => {
        const panel = document.getElementById("orion-options-panel");
        if (!panel) return;
        const open = panel.style.display === "none";
        panel.style.display = open ? "" : "none";
        const list = document.getElementById("orion-quest-list");
        if (list) list.style.display = open ? "none" : "";
        const actions = document.querySelector(
          "#orion-picker-form .picker-actions",
        );
        if (actions) actions.style.display = open ? "none" : "";
      });

      this.startTicker();
    },

    toggle() {
      this.root.style.display =
        this.root.style.display === "none" ? "flex" : "none";
    },

    shutdown() {
      if (!RUNTIME.running) return;
      RUNTIME.running = false;
      this.log("[System] Stopping script & cleaning up...", "warn");

      if (this.tickerId) {
        clearInterval(this.tickerId);
        this.tickerId = null;
      }

      cancelRuntimeTimers();

      try {
        Traffic.stop();
      } catch (e) {
        this.log(`[Traffic Cleanup] ${e?.message ?? e}`, "debug");
      }

      for (const cleanupFn of [...RUNTIME.cleanups]) {
        try {
          cleanupFn();
        } catch (e) {
          this.log(`[Cleanup] ${e.message}`, "debug");
        }
      }
      RUNTIME.cleanups.clear();

      try {
        Patcher.clean();
      } catch (e) {
        this.log(`[Patcher Cleanup] ${e?.message ?? e}`, "debug");
      }

      if (this.keyHandler) {
        try {
          document.removeEventListener("keydown", this.keyHandler);
        } catch (_) {}
        this.keyHandler = null;
      }

      try {
        if (Sound._ctx && Sound._ctx.state !== "closed") Sound._ctx.close();
      } catch (_) {}

      try {
        const styles = document.getElementById("orion-styles");
        if (styles) styles.remove();
        if (this.root?.parentElement) this.root.remove();
      } finally {
        window.orionLock = false;
      }
    },

    _getPct(t) {
      if (t.done) return 100;
      if (t.pending || t.failed || !t.max) return 0;
      return Math.min(100, (t.cur / t.max) * 100);
    },

    startTicker() {
      if (this.tickerId) clearInterval(this.tickerId);
      this.tickerId = setInterval(() => {
        if (!RUNTIME.running) {
          clearInterval(this.tickerId);
          this.tickerId = null;
        }
      }, 1000);
    },

    updateTask(id, data) {
      const oldData = this.tasks.get(id);
      const isPending = data.status === "PENDING" || data.status === "QUEUE";
      const isDone = data.status === "COMPLETED" || data.status === "CLAIMED";
      const isFailed = data.status === "FAILED";

      const newData = {
        ...oldData,
        ...data,
        done: isDone,
        pending: isPending,
        failed: isFailed,
      };
      this.tasks.set(id, newData);

      if (
        oldData &&
        oldData.status === newData.status &&
        oldData.removing === newData.removing &&
        oldData.claimable === newData.claimable &&
        oldData.claimState === newData.claimState &&
        oldData.actionRequired === newData.actionRequired
      ) {
        const card = document.getElementById(`orion-task-${id}`);
        if (card) {
          const pct = this._getPct(newData);

          const iconContainer = card.querySelector(".task-icon");
          if (iconContainer) iconContainer.style.setProperty("--p", `${pct}%`);

          const overlay = card.querySelector(".task-icon-overlay");
          if (overlay) overlay.textContent = `${Math.floor(pct)}%`;

          const progressText = card.querySelector(".progress-text");
          if (progressText) {
            const unit = newData.type === "ACHIEVEMENT" ? "" : "s";
            progressText.textContent = `${Math.min(Math.floor(newData.cur), newData.max)} / ${newData.max}${unit}`;
          }
          return;
        }
      }
      this.render();
    },

    removeTask(id) {
      if (this.tasks.has(id)) {
        this.tasks.get(id).removing = true;
        this.render();
        setTimeout(() => {
          this.tasks.delete(id);
          this.render();
        }, 500);
      }
    },

    log(msg, type = "info") {
      const colors = {
        info: "#5865F2",
        success: "#3BA55C",
        warn: "#faa61a",
        err: "#f04747",
        debug: "#999",
      };
      console.log(
        `%c[${CONFIG.NAME}] %c${msg}`,
        `color: ${CONFIG.THEME}; font-weight: bold;`,
        `color: ${colors[type] || colors.info}`,
      );
      try {
        const box = document.getElementById("orion-logs");
        if (box && type !== "debug") {
          const el = document.createElement("div");
          el.className = `log-item c-${type}`;
          el.innerHTML = `<span class="log-ts">${new Date().toLocaleTimeString().split(" ")[0]}</span> <span>${esc(msg)}</span>`;
          box.appendChild(el);
          box.scrollTop = box.scrollHeight;
          while (box.children.length > CONFIG.MAX_LOG_ITEMS)
            box.firstChild.remove();
        }
      } catch (e) {
        console.debug("[Logger] DOM error:", e.message);
      }
    },

    render() {
      if (document.getElementById("orion-picker-form")) return;
      const body = document.getElementById("orion-body");
      if (!body) return;
      if (!this.tasks.size)
        return (body.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">Waiting for tasks...</div>`);

      const sorted = [...this.tasks.entries()].sort((a, b) => {
        const ta = a[1],
          tb = b[1];
        if (ta.done !== tb.done) return ta.done ? 1 : -1;
        if (ta.failed !== tb.failed) return ta.failed ? 1 : -1;
        if (ta.pending !== tb.pending) return ta.pending ? 1 : -1;
        if (!ta.done && !ta.pending && !tb.done && !tb.pending) {
          const pctA = ta.max ? ta.cur / ta.max : 0;
          const pctB = tb.max ? tb.cur / tb.max : 0;
          return pctB - pctA;
        }
        return 0;
      });

      body.innerHTML = sorted
        .map(([id, t]) => {
          const pct =
            t.pending || t.failed
              ? 0
              : Math.min(100, (t.cur / t.max) * 100).toFixed(1);
          const icon = t.done
            ? ICONS.CHECK
            : t.failed
              ? ICONS.STOP
              : t.pending
                ? ICONS.CLOCK
                : t.type === "VIDEO"
                  ? ICONS.VIDEO
                  : t.type === "ACHIEVEMENT"
                    ? ICONS.ACTIVITY
                    : t.type?.includes("GAME")
                      ? ICONS.GAME
                      : t.type?.includes("STREAM")
                        ? ICONS.STREAM
                        : ICONS.BOLT;

          let statusText =
            t.status === "CLAIMED"
              ? "CLAIMED"
              : t.done
                ? "COMPLETED"
                : t.status;
          let progressLabel = t.pending
            ? "In Queue"
            : t.failed
              ? "Aborted"
              : "Progress";
          const unit = t.type === "ACHIEVEMENT" ? "" : "s";

          let actionBtn = "";

          if (t.claimable) {
            if (t.claimState === "WAITING")
              actionBtn = `<button class="claim-btn" disabled>WAITING...</button>`;
            else if (t.claimState === "FAILED")
              actionBtn = `<button class="claim-btn failed" disabled>ACTION REQUIRED</button>`;
            else
              actionBtn = `<button class="claim-btn" data-id="${id}">CLAIM REWARD</button>`;
          } else if (t.actionRequired === "ENROLL") {
            statusText = "ACTION REQUIRED";
            progressLabel = "Accept quest in Discord";
            actionBtn = `<button class="goto-btn">GO TO QUESTS</button>`;
          } else if (t.type === "ACHIEVEMENT" && t.status === "RUNNING") {
            statusText = "ACTION REQUIRED";
            progressLabel = "Please, complete manually";
            actionBtn = `<button class="goto-btn">GO TO QUESTS</button>`;
          }

          const stateClass = t.done
            ? "done"
            : t.failed
              ? "failed"
              : t.pending
                ? "pending"
                : "running";
          const removingClass = t.removing ? "removing" : "";

          let taskMetaHtml = "";
          if (!t.done) {
            taskMetaHtml = `
                    <div class="task-meta">
                        <span>${progressLabel}</span>
                        ${actionBtn ? "" : `<span class="progress-text">${Math.min(Math.floor(t.cur), t.max)} / ${t.max}${unit}</span>`}
                    </div>`;
          }

          return `
                <div id="orion-task-${id}" class="task-card ${stateClass} ${removingClass}">
                    <div class="task-icon" style="--p: ${pct}%">
                        <div class="task-icon-inner">${icon}</div>
                        ${stateClass === "running" ? `<div class="task-icon-overlay">${Math.floor(pct)}%</div>` : ""}
                    </div>
                    <div class="task-info">
                        <div class="task-status">${statusText}</div>
                        <div class="task-name" title="${esc(t.name)}">${esc(t.name)}</div>
                        ${taskMetaHtml}
                    </div>
                    ${actionBtn ? `<div class="task-actions">${actionBtn}</div>` : ""}
                </div>`;
        })
        .join("");
    },

    showQuestPicker(quests) {
      return new Promise((resolve) => {
        const body = document.getElementById("orion-body");
        const logs = document.getElementById("orion-logs");

        const closePicker = (data) => {
          if (logs) logs.style.display = "block";
          if (body) {
            body.classList.remove("picker-mode");
            body.innerHTML = "";
          }
          resolve(data);
        };

        if (!body)
          return closePicker({
            selectedQuests: new Set(),
            autoEnroll: false,
            autoClaim: false,
            playSound: false,
          });
        if (logs) logs.style.display = "none";

        const items = [];
        const rewardTypes = new Map();
        const questTypes = new Set();

        const REWARD_META = {
          1: { label: "IN-GAME", color: "#e67e22" },
          3: { label: "AVATAR DECORATION", color: "#a358f2" },
          4: { label: "ORBS", color: "#5865F2" },
        };
        const REWARD_FALLBACK = { label: "OTHER", color: "#949ba4" };

        quests.forEach((q) => {
          const cfg = q.config?.taskConfig ?? q.config?.taskConfigV2;
          if (!cfg?.tasks) return;

          const typeData = Tasks.detectType(cfg, q.config?.application?.id);
          if (!typeData) return;
          if (
            !SYS.IS_DESKTOP &&
            (typeData.type === "GAME" || typeData.type === "STREAM")
          )
            return;

          const rw = q.config?.rewardsConfig?.rewards?.[0];
          const rewardType = rw?.type ?? 0;
          const rewardText = rw?.messages?.name ?? "Unknown Reward";

          const meta = REWARD_META[rewardType] ?? REWARD_FALLBACK;

          const displayType =
            typeData.type === "WATCH_VIDEO" ? "VIDEO" : typeData.type;
          questTypes.add(displayType);

          if (!rewardTypes.has(rewardType)) {
            rewardTypes.set(rewardType, {
              label: meta.label,
              count: 0,
              type: rewardType,
              color: meta.color,
            });
          }
          rewardTypes.get(rewardType).count++;

          items.push({
            id: q.id,
            name: q.config?.messages?.questName ?? "Unknown Quest",
            type: displayType,
            rewardType,
            rewardText,
            color: meta.color,
          });
        });

        if (!items.length)
          return closePicker({
            selectedQuests: new Set(),
            autoEnroll: false,
            autoClaim: false,
            playSound: false,
          });

        const buildCard = (q) => `
                    <label class="quest-pick" data-rt="${q.rewardType}" data-qt="${q.type}" style="border-left-color: ${q.color};">
                        <input type="checkbox" name="quests" value="${q.id}" class="native-cb" checked>
                        <div class="task-info">
                            <div class="task-name" title="${esc(q.name)}">${esc(q.name)}</div>
                            <div class="task-meta" style="justify-content: flex-start; gap: 8px;">
                                <span style="text-transform: uppercase; color: var(--text-subtle);">${esc(q.type)}</span>
                                <span style="color: ${q.color};">${esc(q.rewardText)}</span>
                            </div>
                        </div>
                    </label>`;

        const buildToggle = (name, label, isChecked) => `
                    <div class="orion-option">
                        <span class="orion-option-label">${label}</span>
                        <input type="checkbox" name="${name}" class="native-toggle" ${isChecked ? "checked" : ""}>
                    </div>`;

        body.innerHTML = `
                    <form id="orion-picker-form">
                        <div id="orion-options-panel" style="display:none;">
                            ${
                              rewardTypes.size > 1
                                ? `
                                <div class="picker-section-title">Filter By Reward</div>
                                <div class="reward-filters">
                                    ${[...rewardTypes.values()].map((rt) => `<button type="button" class="reward-filter" data-rt="${rt.type}" style="color: ${rt.color}; border-color: ${rt.color};">${rt.label} (${rt.count})</button>`).join("")}
                                </div>
                            `
                                : ""
                            }
                            ${
                              questTypes.size > 1
                                ? `
                                <div class="picker-section-title">Filter By Type</div>
                                <div class="reward-filters">
                                    ${[...questTypes].map((t) => `<button type="button" class="type-filter" data-qt="${t}">${t}</button>`).join("")}
                                </div>
                            `
                                : ""
                            }
                            <div class="picker-section-title">Options</div>
                            <div class="picker-options">
                                ${buildToggle("autoEnroll", "Auto-enroll in quests", RUNTIME.autoEnroll)}
                                ${buildToggle("autoClaim", "Auto-claim rewards", RUNTIME.autoClaim)}
                                ${buildToggle("playSound", "Sound on completion", RUNTIME.playSound)}
                                ${buildToggle("randomDelay", "Random 1-30min delay between cycles", RUNTIME.randomDelay)}
                            </div>
                        </div>

                        <div id="orion-quest-list" class="picker-quest-list">${items.map(buildCard).join("")}
                            <div id="orion-no-quests" style="display: none; margin: auto; text-align: center; color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                No quests available
                            </div>
                        </div>

                        <div class="picker-actions">
                            <button type="button" class="quest-pick-btn deselect" id="select-all-btn">DESELECT ALL</button>
                            <button type="submit" class="quest-pick-btn start" id="start-btn">${ICONS.BOLT} <span id="start-btn-text">START (${items.length})</span></button>
                        </div>
                    </form>`;

        const form = document.getElementById("orion-picker-form");
        const selectAllBtn = document.getElementById("select-all-btn");
        const startBtn = document.getElementById("start-btn");

        const getVisibleCheckboxes = () =>
          Array.from(
            form.querySelectorAll('.quest-pick input[type="checkbox"]'),
          ).filter(
            (cb) => !cb.closest(".quest-pick").classList.contains("hidden"),
          );

        const syncUI = () => {
          const visibleCbs = getVisibleCheckboxes();
          const totalChecked = visibleCbs.filter((cb) => cb.checked).length;

          const startBtnText = document.getElementById("start-btn-text");
          if (startBtnText)
            startBtnText.textContent = `START (${totalChecked})`;
          startBtn.disabled = totalChecked === 0;

          if (visibleCbs.length === 0) {
            selectAllBtn.disabled = true;
            selectAllBtn.textContent = "SELECT ALL";
          } else {
            selectAllBtn.disabled = false;
            selectAllBtn.textContent = visibleCbs.every((cb) => cb.checked)
              ? "DESELECT ALL"
              : "SELECT ALL";
          }

          const noQuestsMsg = document.getElementById("orion-no-quests");
          if (noQuestsMsg) {
            noQuestsMsg.style.display =
              visibleCbs.length === 0 ? "block" : "none";
          }
        };

        form.addEventListener("change", (e) => {
          if (e.target.name === "quests") syncUI();
        });

        const activeRewards = new Set([...rewardTypes.keys()].map(String));
        const activeTypes = new Set([...questTypes]);

        const applyFilters = () => {
          form.querySelectorAll(".quest-pick").forEach((el) => {
            const rt = el.getAttribute("data-rt");
            const qt = el.getAttribute("data-qt");
            el.classList.toggle(
              "hidden",
              !(activeRewards.has(rt) && activeTypes.has(qt)),
            );
          });
          syncUI();
        };

        const FILTER_KINDS = [
          { cls: "reward-filter", attr: "data-rt", set: activeRewards },
          { cls: "type-filter", attr: "data-qt", set: activeTypes },
        ];

        form.addEventListener("click", (e) => {
          const kind = FILTER_KINDS.find((k) =>
            e.target.classList.contains(k.cls),
          );
          if (kind) {
            e.preventDefault();
            const value = e.target.getAttribute(kind.attr);
            e.target.classList.toggle("off");
            if (e.target.classList.contains("off")) kind.set.delete(value);
            else kind.set.add(value);
            applyFilters();
            return;
          }

          if (e.target.id === "select-all-btn") {
            e.preventDefault();
            const visibleCbs = getVisibleCheckboxes();
            if (visibleCbs.length === 0) return;

            const shouldCheck = !visibleCbs.every((cb) => cb.checked);
            visibleCbs.forEach((cb) => {
              cb.checked = shouldCheck;
            });
            syncUI();
          }
        });

        form.addEventListener("submit", (e) => {
          e.preventDefault();

          const selected = getVisibleCheckboxes().filter((cb) => cb.checked);
          if (selected.length === 0) return;

          const data = new FormData(form);

          closePicker({
            selectedQuests: new Set(selected.map((cb) => cb.value)),
            autoEnroll: data.has("autoEnroll"),
            autoClaim: data.has("autoClaim"),
            playSound: data.has("playSound"),
            randomDelay: data.has("randomDelay"),
          });
        });

        body.classList.add("picker-mode");
        syncUI();
      });
    },
  };

  /* ── request queue ──────────────────────────────────────────── */

  const Traffic = {
    queue: [],
    processing: false,
    stopped: false,

    async enqueue(url, body) {
      if (!RUNTIME.running || this.stopped)
        return Promise.reject(new Error("Stopped"));
      return new Promise((resolve, reject) => {
        this.queue.push({ url, body, resolve, reject, attempts: 0 });
        void this.process();
      });
    },

    stop() {
      this.stopped = true;
      for (const req of this.queue.splice(0)) {
        try {
          req.reject(new Error("Shutdown"));
        } catch (_) {}
      }
    },

    async process() {
      if (this.processing || this.queue.length === 0 || this.stopped) return;
      this.processing = true;

      try {
        while (this.queue.length > 0 && RUNTIME.running && !this.stopped) {
          const req = this.queue.shift();
          try {
            const res = await withTimeout(
              Mods.API.post({ url: req.url, body: req.body }),
              SYS.REQUEST_TIMEOUT,
              `POST ${req.url}`,
            );
            req.resolve(res);
          } catch (e) {
            const err = ErrorHandler.classify(e);

            if (err.isRetryable && req.attempts < SYS.MAX_RETRIES) {
              req.attempts++;
              const retryAfter = Number(e?.body?.retry_after);
              const baseDelay = Number.isFinite(retryAfter)
                ? retryAfter * 1000
                : Math.pow(2, req.attempts) * 1000;
              const delay = Math.min(SYS.MAX_RETRY_DELAY, baseDelay);
              const retryJitter = rnd(200, 800);

              Logger.log(
                `[Network] Retry ${req.attempts}/${SYS.MAX_RETRIES} in ${((delay + retryJitter) / 1000).toFixed(1)}s (${err.status ? `HTTP ${err.status}` : err.message})`,
                "warn",
              );

              await sleep(delay + retryJitter);
              if (RUNTIME.running && !this.stopped) {
                this.queue.unshift(req);
              } else {
                req.reject(new Error("Shutdown"));
              }
            } else {
              if (err.isClientError) {
                Logger.log(
                  `[Network] HTTP ${err.status}: ${req.url}`,
                  "debug",
                );
              } else {
                Logger.log(
                  `[Network] Request to ${req.url} failed: ${err.message}`,
                  "err",
                );
              }
              req.reject(e);
            }
          }

          if (RUNTIME.running && !this.stopped)
            await sleep(rnd(500, 900));
        }

        if (!RUNTIME.running || this.stopped) {
          for (const req of this.queue.splice(0)) {
            try {
              req.reject(new Error("Shutdown"));
            } catch (_) {}
          }
        }
      } finally {
        this.processing = false;
        if (this.queue.length > 0 && RUNTIME.running && !this.stopped)
          void this.process();
      }
    },
  };

  /* ── store patching ─────────────────────────────────────────── */

  let Mods = {};

  const Patcher = {
    games: [],
    realGames: null,
    realPID: null,
    active: false,

    init(Store) {
      if (
        !Store ||
        typeof Store.getRunningGames !== "function" ||
        typeof Store.getGameForPID !== "function"
      )
        return false;
      this.realGames = Store.getRunningGames;
      this.realPID = Store.getGameForPID;
      return true;
    },

    toggle(on) {
      if (on && !this.active) {
        const oldGames = Mods.RunStore.getRunningGames;
        const oldPID = Mods.RunStore.getGameForPID;
        try {
          Mods.RunStore.getRunningGames = () => [
            ...this.realGames.call(Mods.RunStore),
            ...this.games,
          ];
          Mods.RunStore.getGameForPID = (pid) =>
            this.games.find((g) => g.pid === pid) ||
            this.realPID.call(Mods.RunStore, pid);
          this.active = true;
        } catch (e) {
          try {
            Mods.RunStore.getRunningGames = oldGames;
            Mods.RunStore.getGameForPID = oldPID;
          } catch (_) {}
          this.active = false;
          throw e;
        }
      } else if (!on && this.active) {
        Mods.RunStore.getRunningGames = this.realGames;
        Mods.RunStore.getGameForPID = this.realPID;
        this.active = false;
      }
    },

    add(g) {
      if (this.games.some((x) => x.pid === g.pid)) return;
      const previous = [...this.games];
      try {
        this.games.push(g);
        this.toggle(true);
        this.dispatch([g], []);
        this.rpc(g);
      } catch (e) {
        this.games = previous;
        if (!previous.length) {
          try {
            this.toggle(false);
          } catch (_) {}
        }
        throw e;
      }
    },

    remove(g) {
      const before = this.games.length;
      this.games = this.games.filter((x) => x.pid !== g.pid);
      if (this.games.length === before) return;

      try {
        this.dispatch([], [g]);
      } catch (e) {
        Logger.log(`[Game Cleanup] ${e?.message ?? e}`, "debug");
      }
      if (!this.games.length) {
        try {
          this.toggle(false);
        } catch (e) {
          Logger.log(`[Game Restore] ${e?.message ?? e}`, "debug");
        }
        this.rpc(null);
      } else {
        this.rpc(this.games[0]);
      }
    },

    dispatch(added, removed) {
      Mods.Dispatcher?.dispatch({
        type: CONST.EVT.GAME,
        added,
        removed,
        games: Mods.RunStore.getRunningGames(),
      });
    },

    rpc(g) {
      if (CONFIG.HIDE_ACTIVITY && g) return;
      try {
        Mods.Dispatcher?.dispatch({
          type: CONST.EVT.RPC,
          socketId: null,
          pid: g ? g.pid : 9999,
          activity: g
            ? {
                application_id: g.id,
                name: g.name,
                type: 0,
                details: null,
                state: null,
                timestamps: { start: g.start },
                icon: g.icon,
                assets: null,
              }
            : null,
        });
      } catch (e) {
        Logger.log(`[RPC Cleanup] ${e.message}`, "debug");
      }
    },

    clean() {
      const removed = [...this.games];
      this.games = [];
      try {
        this.toggle(false);
      } catch (e) {
        Logger.log(`[Patcher Restore] ${e?.message ?? e}`, "debug");
      }
      if (removed.length) {
        try {
          this.dispatch([], removed);
        } catch (e) {
          Logger.log(`[Patcher Dispatch] ${e?.message ?? e}`, "debug");
        }
      }
      this.rpc(null);
    },
  };

  /* ── task handlers ──────────────────────────────────────────── */

  const Tasks = {
    skipped: new Set(),
    completed: new Set(),
    inFlight: new Set(),
    finishing: new Map(),
    retryAfter: new Map(),
    retryAttempts: new Map(),
    enrolled: new Set(),

    sanitize(name) {
      return String(name ?? "")
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .trim()
        .replace(/\s+/g, " ");
    },

    detectType(cfg) {
      const taskKeys = Object.keys(cfg?.tasks ?? {});
      if (!taskKeys.length) return null;

      const rules = [
        {
          keys: ["ACHIEVEMENT_IN_ACTIVITY"],
          type: "ACHIEVEMENT",
        },
        {
          keys: ["PLAY_ACTIVITY"],
          type: "ACTIVITY",
        },
        {
          keys: ["WATCH_VIDEO", "VIDEO"],
          type: "WATCH_VIDEO",
        },
        {
          keys: ["STREAM_ON_DESKTOP", "STREAM"],
          type: "STREAM",
        },
        {
          keys: ["PLAY_ON_DESKTOP"],
          type: "GAME",
        },
      ];

      for (const rule of rules) {
        const keyName = taskKeys.find((key) => rule.keys.includes(key));
        if (keyName)
          return {
            type: rule.type,
            keyName,
            target: Number(cfg.tasks[keyName]?.target ?? 0),
          };
      }

      for (const rule of rules) {
        const keyName = taskKeys.find((taskKey) =>
          rule.keys.some((knownKey) => taskKey.includes(knownKey)),
        );
        if (keyName)
          return {
            type: rule.type,
            keyName,
            target: Number(cfg.tasks[keyName]?.target ?? 0),
          };
      }

      return null;
    },

    readProgress(source, keyName, aliases = []) {
      const progress = source?.progress ?? source?.userStatus?.progress;
      for (const key of [keyName, ...aliases]) {
        const value = progress?.[key]?.value;
        if (Number.isFinite(value)) return Number(value);
      }
      const streamProgress = source?.userStatus?.streamProgressSeconds;
      return Number.isFinite(streamProgress) ? Number(streamProgress) : null;
    },

    canRun(questId) {
      return Date.now() >= (this.retryAfter.get(questId) ?? 0);
    },

    clearRetry(questId) {
      this.retryAfter.delete(questId);
      this.retryAttempts.delete(questId);
    },

    async fetchGameData(appId, appName) {
      try {
        const res = await withTimeout(
          Mods.API.get({
            url: `/applications/public?application_ids=${appId}`,
          }),
          SYS.REQUEST_TIMEOUT,
          `GET application ${appId}`,
        );
        const appData = res?.body?.[0];
        const exeEntry = appData?.executables?.find((x) => x.os === "win32");
        const rawExe = exeEntry
          ? exeEntry.name.replace(">", "")
          : `${this.sanitize(appName)}.exe`;
        const cleanName = this.sanitize(appData?.name || appName);

        return {
          name: appData?.name || appName,
          icon: appData?.icon,
          exeName: rawExe,
          cmdLine: `C:\\Program Files\\${cleanName}\\${rawExe}`,
          exePath: `c:/program files/${cleanName.toLowerCase()}/${rawExe}`,
          id: appId,
        };
      } catch (e) {
        Logger.log(
          `[FetchGame] Fallback for ${appName}: ${e?.message ?? e}`,
          "debug",
        );
        const cleanName = this.sanitize(appName) || "DiscordQuestGame";
        const safeExe = `${cleanName.replace(/\s+/g, "")}.exe`;
        return {
          name: appName,
          exeName: safeExe,
          cmdLine: `C:\\Program Files\\${cleanName}\\${safeExe}`,
          exePath: `c:/program files/${cleanName.toLowerCase()}/${safeExe}`,
          id: appId,
        };
      }
    },

    async claimReward(questId) {
      return Traffic.enqueue(`/quests/${questId}/claim-reward`, {
        platform: 0,
        location: 11,
        is_targeted: false,
        metadata_raw: null,
        metadata_sealed: null,
        traffic_metadata_raw: null,
        traffic_metadata_sealed: null,
      });
    },

    failTask(q, t, reason, { permanent = false } = {}) {
      const currentProgress = Logger.tasks.get(q.id)?.cur ?? 0;
      Logger.updateTask(q.id, {
        name: t.name,
        type: t.type,
        cur: currentProgress,
        max: t.target,
        status: "FAILED",
      });

      if (permanent) {
        this.skipped.add(q.id);
        this.clearRetry(q.id);
        Logger.log(`[Task] Skipped "${t.name}": ${reason}`, "err");
        setTimeout(() => Logger.removeTask(q.id), 2000);
        return;
      }

      const attempts = (this.retryAttempts.get(q.id) ?? 0) + 1;
      this.retryAttempts.set(q.id, attempts);
      const retryDelay = Math.min(60_000, 5_000 * Math.pow(2, attempts - 1));
      this.retryAfter.set(q.id, Date.now() + retryDelay);
      Logger.log(
        `[Task] Deferred "${t.name}": ${reason}. Retrying in ${Math.round(retryDelay / 1000)}s.`,
        "warn",
      );
    },

    async VIDEO(q, t, s) {
      let cur =
        this.readProgress(s, t.keyName, ["WATCH_VIDEO"]) ?? 0;
      let sent = cur;
      let failCount = 0;
      let calls = 0;
      let lastProgressAt = Date.now();
      const deadline = Date.now() + taskTimeoutMs(t);

      Logger.updateTask(q.id, {
        name: t.name,
        type: "VIDEO",
        cur,
        max: t.target,
        status: "RUNNING",
      });

      if (sent === 0 && RUNTIME.running) {
        await sleep(rnd(200, 350));
        sent = 0.2 + Math.random() * 0.05;
        try {
          const initial = await Traffic.enqueue(`/quests/${q.id}/video-progress`, {
            timestamp: Number(sent.toFixed(6)),
          });
          calls++;
          const initialServer = this.readProgress(initial?.body, t.keyName, [
            "WATCH_VIDEO",
          ]);
          if (Number.isFinite(initialServer) && initialServer > cur) {
            cur = Math.min(t.target, initialServer);
            lastProgressAt = Date.now();
            Logger.updateTask(q.id, { cur });
          }
          if (initial?.body?.completed_at) cur = t.target;
        } catch (e) {
          Logger.log(`[Video] Initial ping failed: ${e.message}`, "debug");
        }
      }

      while (cur < t.target && RUNTIME.running) {
        if (Date.now() >= deadline)
          return this.failTask(q, t, "Task runtime budget exceeded");

        if (Date.now() - lastProgressAt >= SYS.STALL_TIME)
          return this.failTask(q, t, "Server progress stalled");

        const delayMs = rnd(3500, 4750);
        await sleep(delayMs);
        if (!RUNTIME.running) return;

        const elapsedSec = delayMs / 1000 + (Math.random() * 0.02 - 0.01);
        sent = Math.min(t.target, sent + elapsedSec);
        const payloadTs = Number(sent.toFixed(6));

        try {
          const r = await Traffic.enqueue(`/quests/${q.id}/video-progress`, {
            timestamp: payloadTs,
          });
          calls++;

          const serverVal = this.readProgress(r?.body, t.keyName, [
            "WATCH_VIDEO",
          ]);

          if (r?.body?.completed_at) {
            cur = t.target;
            lastProgressAt = Date.now();
          } else if (Number.isFinite(serverVal)) {
            const next = Math.min(t.target, serverVal);
            if (next > cur) lastProgressAt = Date.now();
            cur = Math.max(cur, next);
          }

          failCount = 0;
        } catch (e) {
          failCount++;
          const err = ErrorHandler.classify(e);
          if (err.isTerminalQuestError) {
            return this.failTask(q, t, `Client Error ${err.status}`, {
              permanent: true,
            });
          }
          if (failCount >= SYS.MAX_TASK_FAILURES) {
            return this.failTask(q, t, "Too many transient network failures");
          }
          Logger.log(
            `[Task] VIDEO progress failed (${failCount}/${SYS.MAX_TASK_FAILURES}): ${err.message}`,
            "debug",
          );
        }

        Logger.updateTask(q.id, {
          name: t.name,
          type: "VIDEO",
          cur,
          max: t.target,
          status: "RUNNING",
        });
      }

      if (RUNTIME.running && cur >= t.target) {
        Logger.log(
          `[Task] VIDEO "${t.name}" confirmed in ${calls} API calls`,
          "debug",
        );
        await this.finish(q, t);
      }
    },

    GAME(q, t, s) {
      return Tasks.generic(q, t, "GAME", "PLAY_ON_DESKTOP", s);
    },
    STREAM(q, t, s) {
      return Tasks.generic(q, t, "STREAM", "STREAM_ON_DESKTOP", s);
    },

    async generic(q, t, type, key, s) {
      if (!RUNTIME.running) return;

      const initialProgress =
        this.readProgress(s, key, [t.keyName]) ?? 0;
      if (initialProgress >= t.target) return this.finish(q, t);

      const gameData = await this.fetchGameData(t.appId, t.name);
      if (!RUNTIME.running) return;

      return new Promise((resolve) => {
        const pid = rnd(2500, 12500) * 4;
        const game = {
          id: gameData.id,
          name: gameData.name,
          icon: gameData.icon,
          pid,
          pidPath: [pid],
          processName: gameData.name,
          start: Date.now(),
          exeName: gameData.exeName,
          exePath: gameData.exePath,
          cmdLine: gameData.cmdLine,
          executables: [
            { os: "win32", name: gameData.exeName, is_launcher: false },
          ],
          windowHandle: 0,
          fullscreenType: 0,
          overlay: true,
          sandboxed: false,
          hidden: false,
          isLauncher: false,
        };

        let cleanupHook = () => {};
        let cleaned = false;
        let settled = false;
        let completing = false;
        let safetyTimer = null;

        const settle = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const check = (d) => {
          if (!RUNTIME.running || d?.questId !== q.id || completing) return;

          const prog = this.readProgress(d, key, [t.keyName]);
          if (!Number.isFinite(prog)) return;

          Logger.updateTask(q.id, {
            name: t.name,
            type,
            cur: prog,
            max: t.target,
            status: "RUNNING",
          });

          if (prog >= t.target) void complete();
        };

        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (safetyTimer) clearTimeout(safetyTimer);

          try {
            cleanupHook();
          } catch (e) {
            Logger.log(`[Task] Cleanup: ${e.message}`, "debug");
          }

          try {
            Mods.Dispatcher?.unsubscribe(CONST.EVT.HEARTBEAT, check);
          } catch (e) {
            Logger.log(
              `[Dispatcher] Unsubscribe failed: ${e.message}`,
              "debug",
            );
          }

          RUNTIME.cleanups.delete(abort);
        };

        const abort = () => {
          cleanup();
          settle();
        };

        const complete = async () => {
          if (completing || settled) return;
          completing = true;
          cleanup();
          try {
            await this.finish(q, t);
          } finally {
            settle();
          }
        };

        RUNTIME.cleanups.add(abort);

        try {
          if (type === "STREAM") {
            if (!Mods.StreamStore)
              throw new Error("ApplicationStreamingStore unavailable");
            const real = Mods.StreamStore.getStreamerActiveStreamMetadata;
            Mods.StreamStore.getStreamerActiveStreamMetadata = () => ({
              id: gameData.id,
              pid,
              sourceName: gameData.name,
            });
            cleanupHook = () => {
              Mods.StreamStore.getStreamerActiveStreamMetadata = real;
            };
          } else {
            Patcher.add(game);
            cleanupHook = () => Patcher.remove(game);
          }

          Mods.Dispatcher?.subscribe(CONST.EVT.HEARTBEAT, check);

          Logger.updateTask(q.id, {
            name: t.name,
            type,
            cur: initialProgress,
            max: t.target,
            status: "RUNNING",
          });
          Logger.log(`[Task] Started ${type}: ${gameData.name}`, "info");

          safetyTimer = setTimeout(() => {
            if (RUNTIME.running)
              this.failTask(q, t, "Heartbeat task runtime budget exceeded");
            cleanup();
            settle();
          }, taskTimeoutMs(t));
        } catch (e) {
          cleanup();
          this.failTask(q, t, `Setup failed: ${e?.message ?? e}`);
          settle();
        }
      });
    },

    _relayUrl: "http://127.0.0.1:43210",
    _relayProbePromise: null,
    _relayProbeAt: 0,
    _relayAvailable: false,

    async _probeRelay(force = false) {
      const now = Date.now();
      if (
        !force &&
        now - this._relayProbeAt < SYS.RELAY_PROBE_TTL
      )
        return this._relayAvailable;
      if (this._relayProbePromise) return this._relayProbePromise;

      this._relayProbePromise = (async () => {
        let available = false;
        try {
          const r = await fetchWithTimeout(
            `${this._relayUrl}/health`,
            { method: "GET", redirect: "error" },
            1000,
            "relay health probe",
          );
          available = !!r.ok;
          if (available && !this._relayAvailable)
            Logger.log(
              "[Bypass] QuestMaster Relay detected on 127.0.0.1:43210.",
              "info",
            );
        } catch (_) {
          available = false;
        } finally {
          this._relayAvailable = available;
          this._relayProbeAt = Date.now();
          this._relayProbePromise = null;
        }
        return available;
      })();

      return this._relayProbePromise;
    },

    async _bypassPost(url, headers, jsonBody) {
      if (await this._probeRelay()) {
        try {
          const r = await fetchWithTimeout(
            `${this._relayUrl}/proxy`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, headers, body: jsonBody }),
              redirect: "error",
            },
            SYS.REQUEST_TIMEOUT,
            "relay proxy",
          );
          if (!r.ok) throw { status: r.status, body: await r.text() };
          const result = await r.json();
          if (!result.ok) throw { status: result.status, body: result.body };
          return result;
        } catch (e) {
          this._relayAvailable = false;
          this._relayProbeAt = 0;
          Logger.log(
            `[Bypass] Relay failed; falling back: ${ErrorHandler.classify(e).message}`,
            "debug",
          );
        }
      }

      try {
        const helper = window.VencordNative?.pluginHelpers?.OrionQuests;
        if (helper) {
          const u = new URL(url);
          const appId = u.hostname.split(".")[0];
          const questId = headers["X-Discord-Quest-ID"];
          const referrer = headers["Referer"];
          if (u.pathname.endsWith("/acf/authorize")) {
            const { code } = JSON.parse(jsonBody);
            const r = await withTimeout(
              helper.discordsaysAuthorize({
                appId,
                questId,
                authCode: code,
                referrer,
              }),
              SYS.REQUEST_TIMEOUT,
              "Vencord Discord Says authorize",
            );
            if (!r.ok) throw { status: r.status, body: r.body };
            return { ok: true, status: r.status, body: r.body };
          }
          if (u.pathname.endsWith("/acf/quest/progress")) {
            const { progress } = JSON.parse(jsonBody);
            const token = headers["X-Auth-Token"];
            const r = await withTimeout(
              helper.discordsaysProgress({
                appId,
                questId,
                token,
                target: progress,
                referrer,
              }),
              SYS.REQUEST_TIMEOUT,
              "Vencord Discord Says progress",
            );
            if (!r.ok) throw { status: r.status, body: r.body };
            return { ok: true, status: r.status, body: r.body };
          }
        }
      } catch (e) {
        if (e?.status) throw e;
        Logger.log(
          `[Bypass] VencordNative path errored: ${e?.message ?? e}`,
          "debug",
        );
      }

      const dn = window.DiscordNative;
      if (dn) {
        const probes = [
          () => dn.http?.makeRequest,
          () => dn.fileManager?.fetchURL,
          () => dn.processUtils?.fetch,
          () => dn.app?.makeRequest,
        ];
        for (const probe of probes) {
          try {
            const fn = probe();
            if (typeof fn === "function") {
              const r = await withTimeout(
                fn.call(dn, {
                  method: "POST",
                  url,
                  headers,
                  body: jsonBody,
                }),
                SYS.REQUEST_TIMEOUT,
                "DiscordNative request",
              );
              if (r && (r.status || r.statusCode)) {
                const status = r.status ?? r.statusCode;
                if (status >= 200 && status < 300)
                  return {
                    ok: true,
                    status,
                    body: r.body ?? r.responseText ?? "",
                  };
              }
            }
          } catch (_) {}
        }
      }

      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: jsonBody,
          redirect: "error",
        },
        SYS.REQUEST_TIMEOUT,
        "Discord Says fetch",
      );
      const body = await res.text();
      if (!res.ok) throw { status: res.status, body };
      return { ok: true, status: res.status, body };
    },

    async bypassAchievement(q, t) {
      const appId = q.config?.application?.id;
      if (!appId || !/^\d+$/.test(String(appId))) {
        Logger.log(`[Bypass] Invalid application id for "${t.name}".`, "warn");
        return false;
      }

      let preGrantIds;
      try {
        const before = await withTimeout(
          Mods.API.get({ url: "/oauth2/tokens" }),
          SYS.REQUEST_TIMEOUT,
          "OAuth token snapshot",
        );
        preGrantIds = new Set(
          (before?.body || [])
            .filter((tk) => String(tk.application?.id) === String(appId))
            .map((tk) => tk.id),
        );
      } catch (e) {
        Logger.log(
          `[Bypass] Couldn't snapshot existing grants; aborting safely: ${ErrorHandler.classify(e).message}`,
          "warn",
        );
        return false;
      }

      try {
        let appName = null;
        try {
          const a = await withTimeout(
            Mods.API.get({
              url: `/applications/public?application_ids=${appId}`,
            }),
            SYS.REQUEST_TIMEOUT,
            "Achievement application lookup",
          );
          appName = a?.body?.[0]?.name ?? null;
        } catch (_) {}

        if (!(await Consent.ask(appId, appName))) {
          Logger.log(
            `[Bypass] Consent declined for "${t.name}". Not authorizing the app.`,
            "warn",
          );
          return false;
        }

        Logger.log(
          `[Bypass] Trying Discord Says auth flow for "${t.name}"...`,
          "info",
        );

        const authRes = await withTimeout(
          Mods.API.post({
            url: "/oauth2/authorize",
            query: {
              response_type: "code",
              client_id: appId,
              scope: "identify applications.commands applications.entitlements",
            },
            body: {
              permissions: "0",
              authorize: true,
              integration_type: 1,
              location_context: {
                guild_id: "10000",
                channel_id: "10000",
                channel_type: 10000,
              },
            },
          }),
          SYS.REQUEST_TIMEOUT,
          "OAuth authorize",
        );
        const location = authRes?.body?.location;
        if (!location)
          throw new Error("no location in /oauth2/authorize response");
        const authCode = new URL(location).searchParams.get("code");
        if (!authCode) throw new Error("no code in authorize location");

        const ticketRes = await withTimeout(
          Mods.API.post({
            url: `/applications/${appId}/proxy-tickets`,
            body: {},
          }),
          SYS.REQUEST_TIMEOUT,
          "Proxy ticket",
        );
        const proxyTicket = ticketRes?.body?.ticket;
        if (!proxyTicket) throw new Error("no proxy ticket");

        const referrer = `https://${appId}.discordsays.com/?instance_id=example-cl-instance&platform=desktop&discord_proxy_ticket=${encodeURIComponent(proxyTicket)}`;

        const dsAuthRes = await this._bypassPost(
          `https://${appId}.discordsays.com/.proxy/acf/authorize`,
          {
            "Content-Type": "application/json",
            "X-Auth-Token": "",
            "X-Discord-Quest-ID": q.id,
            Referer: referrer,
          },
          JSON.stringify({ code: authCode }),
        );

        let dsToken;
        try {
          dsToken = JSON.parse(dsAuthRes.body)?.token;
        } catch {
          throw new Error(
            "discordsays returned non-JSON: " +
              String(dsAuthRes.body).slice(0, 120),
          );
        }
        if (!dsToken) throw new Error("no discordsays token");

        await this._bypassPost(
          `https://${appId}.discordsays.com/.proxy/acf/quest/progress`,
          {
            "Content-Type": "application/json",
            "X-Auth-Token": dsToken,
            "X-Discord-Quest-ID": q.id,
            Referer: referrer,
          },
          JSON.stringify({ progress: t.target }),
        );

        Logger.log(
          `[Bypass] Success — "${t.name}" completed via Discord Says.`,
          "success",
        );
        return true;
      } catch (e) {
        const code = e?.body?.code;
        const err = ErrorHandler.classify(e);
        if (code === 50165) {
          Logger.log(
            `[Bypass] "${t.name}" can't be launched (age-gated or delisted).`,
            "warn",
          );
          return false;
        }
        Logger.log(
          `[Bypass] Failed for "${t.name}": ${err.status ? `HTTP ${err.status} — ` : ""}${err.message}`,
          "warn",
        );
        return false;
      } finally {
        if (preGrantIds) {
          try {
            const after = await withTimeout(
              Mods.API.get({ url: "/oauth2/tokens" }),
              SYS.REQUEST_TIMEOUT,
              "OAuth cleanup snapshot",
            );
            const ours = (after?.body || []).filter(
              (tk) =>
                String(tk.application?.id) === String(appId) &&
                !preGrantIds.has(tk.id),
            );
            for (const g of ours) {
              try {
                await withTimeout(
                  Mods.API.del({ url: `/oauth2/tokens/${g.id}` }),
                  SYS.REQUEST_TIMEOUT,
                  "OAuth grant cleanup",
                );
              } catch (e) {
                Logger.log(
                  `[Bypass] Grant cleanup non-fatal: ${ErrorHandler.classify(e).message}`,
                  "debug",
                );
              }
            }
          } catch (e) {
            Logger.log(
              `[Bypass] Deauthorize cleanup non-fatal: ${ErrorHandler.classify(e).message}`,
              "debug",
            );
          }
        }
      }
    },

    async ACHIEVEMENT(q, t) {
      let cur =
        this.readProgress(q.userStatus, t.keyName, [
          "ACHIEVEMENT_IN_ACTIVITY",
        ]) ?? 0;

      Logger.updateTask(q.id, {
        name: t.name,
        type: "ACHIEVEMENT",
        cur,
        max: t.target,
        status: "RUNNING",
      });

      let chan = null;
      try {
        chan =
          Mods.ChanStore?.getSortedPrivateChannels()?.[0]?.id ??
          Object.values(Mods.GuildChanStore?.getAllGuilds() ?? {}).find(
            (g) => g?.VOCAL?.length,
          )?.VOCAL?.[0]?.channel?.id;
      } catch (e) {
        Logger.log(`[Achievement] Channel lookup: ${e.message}`, "debug");
      }

      if (chan && cur < t.target) {
        Logger.log(
          `[Task] Attempting heartbeat path for "${t.name}"...`,
          "info",
        );
        const key = `call:${chan}:${rnd(1000, 9999)}`;
        let failCount = 0;
        let lastProgressAt = Date.now();
        const heartbeatDeadline =
          Date.now() + Math.min(taskTimeoutMs(t), 15 * 60 * 1000);

        while (
          cur < t.target &&
          RUNTIME.running &&
          Date.now() < heartbeatDeadline &&
          Date.now() - lastProgressAt < SYS.STALL_TIME
        ) {
          try {
            const r = await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
              stream_key: key,
              terminal: false,
            });
            const serverProgress = this.readProgress(r?.body, t.keyName, [
              "ACHIEVEMENT_IN_ACTIVITY",
            ]);
            if (Number.isFinite(serverProgress) && serverProgress > cur) {
              cur = Math.min(t.target, serverProgress);
              lastProgressAt = Date.now();
            }
            Logger.updateTask(q.id, {
              name: t.name,
              type: "ACHIEVEMENT",
              cur,
              max: t.target,
              status: "RUNNING",
            });
            failCount = 0;

            if (cur >= t.target) {
              try {
                await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                  stream_key: key,
                  terminal: true,
                });
              } catch (_) {}
              break;
            }
          } catch (e) {
            failCount++;
            const err = ErrorHandler.classify(e);
            if (err.isTerminalQuestError || failCount >= SYS.MAX_TASK_FAILURES)
              break;
            Logger.log(
              `[Achievement] Heartbeat transient failure ${failCount}/${SYS.MAX_TASK_FAILURES}: ${err.message}`,
              "debug",
            );
          }
          if (cur < t.target) await sleep(rnd(19000, 22000));
        }

        if (cur >= t.target && RUNTIME.running)
          return await this.finish(q, t);
      }

      if (!RUNTIME.running) return;
      const bypassed = await this.bypassAchievement(q, t);
      if (bypassed) return await this.finish(q, t);

      if (!RUNTIME.running) return;

      const relayAvailable = await this._probeRelay().catch(() => false);
      const hasHelper =
        relayAvailable ||
        !!window.VencordNative?.pluginHelpers?.OrionQuests ||
        !!window.DiscordNative;

      return this.failTask(
        q,
        t,
        hasHelper
          ? "Achievement automation path failed; will retry"
          : "No supported achievement automation path is available",
        { permanent: !hasHelper },
      );
    },

    async ACTIVITY(q, t) {
      let chan = null;
      try {
        chan =
          Mods.ChanStore?.getSortedPrivateChannels()?.[0]?.id ??
          Object.values(Mods.GuildChanStore?.getAllGuilds() ?? {}).find(
            (g) => g?.VOCAL?.length,
          )?.VOCAL?.[0]?.channel?.id;
      } catch (e) {
        Logger.log(
          `[Task] ACTIVITY channel lookup error: ${e.message}`,
          "debug",
        );
      }

      if (!chan) {
        return this.failTask(q, t, "No voice channel found", {
          permanent: true,
        });
      }

      const key = `call:${chan}:${rnd(1000, 9999)}`;
      let cur =
        this.readProgress(q.userStatus, t.keyName, ["PLAY_ACTIVITY"]) ?? 0;
      let failCount = 0;
      let lastProgressAt = Date.now();
      const deadline = Date.now() + taskTimeoutMs(t);

      Logger.updateTask(q.id, {
        name: t.name,
        type: "ACTIVITY",
        cur,
        max: t.target,
        status: "RUNNING",
      });

      while (cur < t.target && RUNTIME.running) {
        if (Date.now() >= deadline)
          return this.failTask(q, t, "Task runtime limit reached");
        if (Date.now() - lastProgressAt >= SYS.STALL_TIME)
          return this.failTask(q, t, "Server progress stalled");

        try {
          const r = await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
            stream_key: key,
            terminal: false,
          });
          const serverProgress = this.readProgress(r?.body, t.keyName, [
            "PLAY_ACTIVITY",
          ]);
          if (Number.isFinite(serverProgress) && serverProgress > cur) {
            cur = Math.min(t.target, serverProgress);
            lastProgressAt = Date.now();
          }

          Logger.updateTask(q.id, {
            name: t.name,
            type: "ACTIVITY",
            cur,
            max: t.target,
            status: "RUNNING",
          });
          failCount = 0;

          if (cur >= t.target) {
            try {
              await Traffic.enqueue(`/quests/${q.id}/heartbeat`, {
                stream_key: key,
                terminal: true,
              });
            } catch (e) {
              Logger.log(
                `[ACTIVITY] Final heartbeat failed: ${ErrorHandler.classify(e).message}`,
                "debug",
              );
            }
            break;
          }
        } catch (e) {
          failCount++;
          const err = ErrorHandler.classify(e);
          if (err.isTerminalQuestError) {
            return this.failTask(q, t, `HTTP ${err.status}`, {
              permanent: true,
            });
          }
          if (failCount >= SYS.MAX_TASK_FAILURES) {
            return this.failTask(q, t, "Too many transient heartbeat failures");
          }
          Logger.log(
            `[Task] ACTIVITY heartbeat failed (${failCount}/${SYS.MAX_TASK_FAILURES}): ${err.message}`,
            "debug",
          );
        }

        if (cur < t.target) await sleep(rnd(19000, 22000));
      }

      if (RUNTIME.running && cur >= t.target)
        return await this.finish(q, t);
    },

    async finish(q, t) {
      if (this.finishing.has(q.id)) return this.finishing.get(q.id);

      const finishPromise = (async () => {
        this.completed.add(q.id);
        this.clearRetry(q.id);

        Logger.updateTask(q.id, {
          name: t.name,
          type: t.type,
          cur: t.target,
          max: t.target,
          status: "COMPLETED",
          actionRequired: null,
        });
        Logger.log(`[Task] Completed "${t.name}"!`, "success");
        Sound.play("tick");

        try {
          if (typeof Notification !== "undefined") {
            if (Notification.permission === "default") {
              try {
                await withTimeout(
                  Notification.requestPermission(),
                  15000,
                  "Notification permission",
                );
              } catch (_) {}
            }
            if (Notification.permission === "granted") {
              new Notification(`${CONFIG.NAME}: Quest Completed`, {
                body: t.name,
                icon: "https://cdn.discordapp.com/emojis/1120042457007792168.webp",
                tag: `orion-${q.id}`,
              });
            }
          }
        } catch (e) {
          Logger.log(`[Notification] ${e.message}`, "debug");
        }

        if (RUNTIME.autoClaim) {
          try {
            const continued = await sleep(rnd(2500, 6000));
            if (RUNTIME.running && continued !== false) {
              const claimRes = await this.claimReward(q.id);

              if (claimRes?.body?.claimed_at) {
                Logger.log(
                  `[Claim] Reward for "${t.name}" claimed automatically!`,
                  "success",
                );
                Logger.updateTask(q.id, {
                  name: t.name,
                  type: t.type,
                  cur: t.target,
                  max: t.target,
                  status: "CLAIMED",
                  claimable: false,
                });
                setTimeout(() => Logger.removeTask(q.id), 2000);
                return;
              }
            }
          } catch (e) {
            const needsCaptcha =
              e?.body?.captcha_key || e?.body?.captcha_sitekey;
            if (needsCaptcha) {
              Logger.log(
                `[Claim] Captcha required for "${t.name}". Use UI button.`,
                "warn",
              );
            } else {
              Logger.log(
                `[Claim] Auto-claim deferred for "${t.name}": ${ErrorHandler.classify(e).message}`,
                "warn",
              );
            }
          }
        }

        Logger.updateTask(q.id, {
          name: t.name,
          type: t.type,
          cur: t.target,
          max: t.target,
          status: "COMPLETED",
          claimable: true,
          questId: q.id,
        });
      })().finally(() => {
        this.finishing.delete(q.id);
      });

      this.finishing.set(q.id, finishPromise);
      return finishPromise;
    },

  };

  /* ── webpack module extraction ─────────────────────────────── */

  function loadModules() {
    try {
      // === VENCORD USAGE ===
      if (typeof window.Vencord !== "undefined" && window.Vencord.Webpack) {
        Logger.log(
          "[System] Vencord detected. Using Vencord Webpack API...",
          "info",
        );
        const W = window.Vencord.Webpack;

        let routerModule;
        try {
          const m = W.findByCode("transitionTo -");
          if (m) {
            for (const prop of [m, m.default, ...Object.values(m)]) {
              if (
                typeof prop === "function" &&
                prop.toString().includes("transitionTo -")
              ) {
                routerModule = { transitionTo: prop };
                break;
              }
            }
          }
        } catch (e) {}

        Mods = {
          QuestStore: W.findStore("QuestStore") || W.findStore("QuestsStore"),
          RunStore: W.findStore("RunningGameStore"),
          StreamStore: W.findStore("ApplicationStreamingStore"),
          ChanStore: W.findStore("ChannelStore"),
          GuildChanStore: W.findStore("GuildChannelStore"),
          Dispatcher:
            W.Common?.FluxDispatcher ||
            W.findByProps("dispatch", "subscribe", "flushWaitQueue"),
          API: W.Common?.RestAPI || W.findByProps("get", "post", "del"),
          Router: routerModule,
        };

        const required = ["QuestStore", "API", "Dispatcher", "RunStore"];
        const missing = required.filter((k) => !Mods[k]);

        if (missing.length === 0) {
          const optional = [
            "StreamStore",
            "ChanStore",
            "GuildChanStore",
            "Router",
          ];
          optional.forEach((k) => {
            if (!Mods[k])
              Logger.log(
                `[System] Optional module '${k}' not found. Features may be limited.`,
                "warn",
              );
          });

          Patcher.init(Mods.RunStore);
          return true;
        }
        Logger.log(
          `[System] Vencord extraction missed: ${missing.join(", ")}. Falling back to native...`,
          "warn",
        );
      }

      // === NATIVE FALLBACK ===
      if (typeof webpackChunkdiscord_app === "undefined") {
        throw new Error(
          "Webpack chunk not found - is this running inside Discord?",
        );
      }

      let req;
      webpackChunkdiscord_app.push([
        [Symbol()],
        {},
        (r) => {
          const cur = Object.keys(req?.c || {}).length;
          const incoming = Object.keys(r?.c || {}).length;
          if (incoming > cur) req = r;
        },
      ]);
      webpackChunkdiscord_app.pop();

      if (!req?.c)
        throw new Error(
          "Module registry not available - Discord build incompatible",
        );

      const modules = Object.values(req.c);

      function findStore(storeName) {
        for (const m of modules) {
          try {
            const exp = m?.exports;
            if (!exp || typeof exp !== "object") continue;
            for (const key of Object.keys(exp)) {
              const prop = exp[key];
              if (
                prop &&
                typeof prop === "object" &&
                prop.__proto__?.constructor?.displayName === storeName
              ) {
                return prop;
              }
            }
          } catch {}
        }
        return undefined;
      }

      function findDispatcher() {
        for (const m of modules) {
          try {
            const exp = m?.exports;
            if (!exp || typeof exp !== "object") continue;
            for (const key of Object.keys(exp)) {
              const prop = exp[key];
              if (
                prop &&
                prop._subscriptions &&
                typeof prop.subscribe === "function" &&
                typeof prop.dispatch === "function" &&
                typeof prop.__proto__?.flushWaitQueue === "function"
              ) {
                return prop;
              }
            }
          } catch {}
        }
        return undefined;
      }

      function findAPI() {
        for (const m of modules) {
          try {
            const exp = m?.exports;
            if (!exp || typeof exp !== "object") continue;
            for (const key of Object.keys(exp)) {
              const prop = exp[key];
              if (
                prop &&
                typeof prop.get === "function" &&
                typeof prop.post === "function" &&
                typeof prop.del === "function" &&
                !prop._dispatcher
              ) {
                return prop;
              }
            }
          } catch {}
        }
        return undefined;
      }

      function findRouter() {
        for (const m of modules) {
          try {
            const exp = m?.exports;
            if (!exp) continue;

            for (const prop of [exp, exp.default, ...Object.values(exp)]) {
              if (
                typeof prop === "function" &&
                prop.toString().includes("transitionTo -")
              ) {
                return { transitionTo: prop };
              }
            }
          } catch {}
        }
        return undefined;
      }

      Mods = {
        QuestStore: findStore("QuestStore"),
        RunStore: findStore("RunningGameStore"),
        StreamStore: findStore("ApplicationStreamingStore"),
        ChanStore: findStore("ChannelStore"),
        GuildChanStore: findStore("GuildChannelStore"),
        Dispatcher: findDispatcher(),
        API: findAPI(),
        Router: findRouter(),
      };

      const required = ["QuestStore", "API", "Dispatcher", "RunStore"];
      const missing = required.filter((k) => !Mods[k]);
      if (missing.length > 0)
        throw new Error(`Core modules not found: ${missing.join(", ")}`);

      const optional = ["StreamStore", "ChanStore", "GuildChanStore", "Router"];
      optional.forEach((k) => {
        if (!Mods[k])
          Logger.log(
            `[System] Optional module '${k}' not found. Features may be limited.`,
            "warn",
          );
      });
      Patcher.init(Mods.RunStore);
      return true;
    } catch (e) {
      Logger.log(`[System] Module loading error: ${e.message ?? e}`, "err");
      console.error(e);
      return false;
    }
  }

  /* ── main loop ─────────────────────────────────────────────── */

  async function runConcurrent(tasks, limit) {
    const executing = new Set();
    const all = [];

    for (const task of tasks) {
      if (!RUNTIME.running) break;

      let p;
      p = Promise.resolve()
        .then(task)
        .catch((e) => {
          Logger.log(
            `[Runner] Isolated task failure: ${e?.message ?? e}`,
            "err",
          );
        })
        .finally(() => executing.delete(p));
      executing.add(p);
      all.push(p);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }

      if (RUNTIME.running) await sleep(rnd(500, 1000));
    }

    await Promise.allSettled(all);
  }

  async function main() {
    Logger.init();
    if (!loadModules()) {
      Logger.log(
        "[System] Failed to load Discord modules. Aborting.",
        "err",
      );
      return Logger.shutdown();
    }

    const getQuests = () => {
      const raw = Mods.QuestStore?.quests;
      if (raw instanceof Map) return [...raw.values()];
      if (raw && typeof raw === "object") return Object.values(raw);
      return [];
    };

    const isEligible = (q) =>
      !!q &&
      !q.userStatus?.completedAt &&
      !Tasks.completed.has(q.id) &&
      notExpired(q) &&
      q.id !== CONST.ID &&
      !Tasks.skipped.has(q.id);

    let quests = getQuests().filter(isEligible);

    if (!quests.length) {
      Logger.log("[System] All available quests are completed!", "success");
      return Logger.shutdown();
    }

    const pickerResult = await Logger.showQuestPicker(quests);
    if (!RUNTIME.running) return;

    RUNTIME.autoEnroll = pickerResult.autoEnroll;
    RUNTIME.autoClaim = pickerResult.autoClaim;
    RUNTIME.playSound = pickerResult.playSound;
    RUNTIME.randomDelay = pickerResult.randomDelay;

    if (pickerResult.selectedQuests.size === 0) {
      Logger.log("[System] No quests selected. Shutting down.", "info");
      return Logger.shutdown();
    }

    let loopCount = 1;

    while (RUNTIME.running) {
      try {
        Logger.log(`[Cycle] Starting loop #${loopCount}...`, "info");
        quests = getQuests();

        for (const q of quests) {
          if (q?.userStatus?.completedAt) {
            Tasks.completed.add(q.id);
            Tasks.clearRetry(q.id);
          }
        }

        const remaining = quests.filter(
          (q) =>
            pickerResult.selectedQuests.has(String(q.id)) &&
            isEligible(q),
        );

        if (!remaining.length) {
          Logger.log("[System] All selected runnable quests are complete.", "success");
          Sound.play("done");
          break;
        }

        const active = remaining.filter(
          (q) => !Tasks.inFlight.has(q.id) && Tasks.canRun(q.id),
        );

        if (!active.length) {
          const nextRetry = Math.min(
            ...remaining.map((q) => Tasks.retryAfter.get(q.id) ?? Date.now() + 1000),
          );
          const waitMs = Math.max(
            500,
            Math.min(5000, nextRetry - Date.now()),
          );
          Logger.log(
            `[Cycle] ${remaining.length} quest(s) deferred; retrying shortly...`,
            "debug",
          );
          await sleep(waitMs);
          loopCount++;
          continue;
        }

        const queues = { video: [], game: [] };

        active.forEach((q) => {
          try {
            const cfg = q.config?.taskConfig ?? q.config?.taskConfigV2;
            const fallbackName =
              q.config?.messages?.questName ?? `Quest ${q.id}`;

            if (!cfg?.tasks || typeof cfg.tasks !== "object") {
              Tasks.failTask(
                q,
                {
                  name: fallbackName,
                  type: "UNKNOWN",
                  target: 0,
                },
                "Invalid task configuration",
                { permanent: true },
              );
              return;
            }

            const typeData = Tasks.detectType(cfg);
            if (!typeData) {
              Tasks.failTask(
                q,
                {
                  name: fallbackName,
                  type: "UNKNOWN",
                  target: 0,
                },
                "Unsupported quest task type",
                { permanent: true },
              );
              return;
            }

            const { type, keyName, target } = typeData;
            const tInfo = {
              id: q.id,
              appId: q.config?.application?.id ?? 0,
              name: fallbackName,
              target,
              type,
              keyName,
            };

            if (!Number.isFinite(target) || target <= 0) {
              Tasks.failTask(q, tInfo, `Invalid target (${target})`, {
                permanent: true,
              });
              return;
            }

            if (
              !SYS.IS_DESKTOP &&
              (type === "GAME" || type === "STREAM")
            ) {
              Tasks.failTask(q, tInfo, "Requires Discord Desktop", {
                permanent: true,
              });
              return;
            }

            if (
              !q.userStatus?.enrolledAt &&
              !Tasks.enrolled.has(q.id) &&
              !RUNTIME.autoEnroll
            ) {
              Logger.updateTask(tInfo.id, {
                name: tInfo.name,
                type: tInfo.type,
                cur: 0,
                max: tInfo.target,
                status: "PENDING",
                actionRequired: "ENROLL",
              });
              Tasks.retryAfter.set(q.id, Date.now() + 5000);
              return;
            }

            Logger.updateTask(tInfo.id, {
              name: tInfo.name,
              type: tInfo.type,
              cur: Logger.tasks.get(tInfo.id)?.cur ?? 0,
              max: tInfo.target,
              status: "QUEUE",
              actionRequired: null,
            });

            const taskFunc = async () => {
              if (Tasks.inFlight.has(q.id) || !RUNTIME.running) return;
              Tasks.inFlight.add(q.id);
              Tasks.retryAfter.delete(q.id);

              try {
                if (
                  !q.userStatus?.enrolledAt &&
                  !Tasks.enrolled.has(q.id)
                ) {
                  Logger.log(
                    `[Enroll] Accepting quest: ${tInfo.name}`,
                    "info",
                  );
                  try {
                    await Traffic.enqueue(`/quests/${q.id}/enroll`, {
                      location: 11,
                      is_targeted: false,
                    });
                    Tasks.enrolled.add(q.id);
                    await sleep(rnd(800, 1500));
                  } catch (e) {
                    const err = ErrorHandler.classify(e);
                    return Tasks.failTask(
                      q,
                      tInfo,
                      `Enrollment failed: ${err.message}`,
                      { permanent: err.isTerminalQuestError },
                    );
                  }
                }

                if (!RUNTIME.running) return;
                if (type === "WATCH_VIDEO")
                  return await Tasks.VIDEO(q, tInfo, q.userStatus);
                if (type === "ACHIEVEMENT")
                  return await Tasks.ACHIEVEMENT(q, tInfo);
                if (type === "STREAM")
                  return await Tasks.STREAM(q, tInfo, q.userStatus);
                if (type === "ACTIVITY")
                  return await Tasks.ACTIVITY(q, tInfo, q.userStatus);
                return await Tasks.GAME(q, tInfo, q.userStatus);
              } catch (e) {
                const err = ErrorHandler.classify(e);
                Logger.log(
                  `[Task] Unexpected failure in "${tInfo.name}": ${err.message}`,
                  "err",
                );
                Tasks.failTask(
                  q,
                  tInfo,
                  `Unexpected runtime failure: ${err.message}`,
                  { permanent: err.isTerminalQuestError },
                );
              } finally {
                Tasks.inFlight.delete(q.id);
              }
            };

            if (type === "WATCH_VIDEO") queues.video.push(taskFunc);
            else queues.game.push(taskFunc);
          } catch (e) {
            Logger.log(
              `[Quest] Error preparing ${q.id}: ${e?.message ?? e}`,
              "err",
            );
            Tasks.failTask(
              q,
              {
                name: q.config?.messages?.questName ?? `Quest ${q.id}`,
                type: "UNKNOWN",
                target: 0,
              },
              `Preparation failed: ${e?.message ?? e}`,
              { permanent: true },
            );
          }
        });

        const totalTasks = queues.video.length + queues.game.length;

        if (totalTasks > 0) {
          Logger.log(
            `[Cycle] Processing: ${queues.video.length} video quest(s), ${queues.game.length} other quest(s).`,
            "info",
          );
          await Promise.all([
            runConcurrent(queues.game, 1),
            runConcurrent(queues.video, 2),
          ]);
        } else {
          await sleep(1000);
        }

        if (!RUNTIME.running) break;

        const afterCycle = getQuests().filter(
          (q) =>
            pickerResult.selectedQuests.has(String(q.id)) &&
            isEligible(q),
        );
        if (!afterCycle.length) {
          Logger.log(
            `[Cycle] Loop #${loopCount} completed the remaining quests.`,
            "success",
          );
          continue;
        }

        if (RUNTIME.randomDelay) {
          const delayMs = rnd(60000, 1800000);
          Logger.log(
            `[Cycle] Loop #${loopCount} complete. Random delay: ${Math.round(delayMs / 60000)}m before rescan.`,
            "info",
          );
          await sleep(delayMs);
        } else {
          Logger.log(
            `[Cycle] Loop #${loopCount} complete. Waiting before rescan...`,
            "info",
          );
          await sleep(rnd(2500, 4500));
        }
        loopCount++;
      } catch (cycleError) {
        Logger.log(
          `[Cycle] Error in loop #${loopCount}: ${cycleError?.message ?? cycleError}`,
          "err",
        );
        console.error(cycleError);
        if (RUNTIME.running) await sleep(3000);
        loopCount++;
      }
    }

    const hasUnclaimed = [...Logger.tasks.values()].some(
      (t) => t.claimable && !t.removing,
    );
    if (hasUnclaimed && RUNTIME.running) {
      Logger.log(
        "[System] Quest cycle finished. Claim remaining rewards above, then click STOP.",
        "info",
      );
      return;
    }

    Logger.shutdown();
  }

  if (globalThis.__QUESTMASTER_TEST__) {
    globalThis.__QuestMasterHooks = {
      CONFIG,
      SYS,
      RUNTIME,
      ErrorHandler,
      Tasks,
      Traffic,
      Patcher,
      Logger,
      withTimeout,
      taskTimeoutMs,
      runConcurrent,
      setMods(value) {
        Mods = value;
      },
    };
    return;
  }

  main().catch((e) => {
    const msg = e?.message ?? e?.toString?.() ?? "Unknown fatal error";
    console.error(`[${CONFIG.NAME} Fatal]`, e);
    try {
      Logger.log(`[System] FATAL: ${msg}`, "err");
    } catch (_) {}
    try {
      Logger.shutdown();
    } catch (_) {
      window.orionLock = false;
    }
  });
})();
