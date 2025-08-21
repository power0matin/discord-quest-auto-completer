// Discord Quest Completer Script (Optimized & Cleaned)
// Automatically accepts and completes quests in Discord Desktop via DevTools
// Warning: Use at your own risk. May violate TOS.

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Extract webpack modules safely
delete window.$;
let wpRequire;
try {
  wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, (r) => r]);
  webpackChunkdiscord_app.pop();
} catch (e) {
  console.error("Failed to extract webpack modules:", e);
  throw new Error(
    "Webpack extraction failed. Ensure running in Discord DevTools."
  );
}

function findExport(checkFn, name) {
  try {
    const mod = Object.values(wpRequire.c).find(checkFn);
    if (!mod) throw new Error(`Module not found: ${name}`);
    return mod.exports;
  } catch (e) {
    console.warn(`Warning: Could not find ${name}`, e);
    return null;
  }
}

// Extract needed modules with defensive checks
const ApplicationStreamingStore = findExport(
  (m) => m?.Z?.__proto__?.getStreamerActiveStreamMetadata,
  "ApplicationStreamingStore"
)?.Z;

const RunningGameStore = findExport(
  (m) => m?.ZP?.getRunningGames,
  "RunningGameStore"
)?.ZP;

const QuestsStore = findExport(
  (m) => m?.Z?.__proto__?.getQuest,
  "QuestsStore"
)?.Z;

const FluxDispatcher = findExport(
  (m) => m?.Z?.__proto__?.flushWaitQueue,
  "FluxDispatcher"
)?.Z;

const apiModule = Object.values(wpRequire.c).find((m) => m?.exports?.tn?.get);
const api = apiModule ? apiModule.exports.tn : null;

const encodeStreamKeyModule = Object.values(wpRequire.c).find(
  (m) => m?.exports?.encodeStreamKey
);
const encodeStreamKey = encodeStreamKeyModule?.exports?.encodeStreamKey || null;

// Check essential modules
if (!api || !QuestsStore || !RunningGameStore || !FluxDispatcher) {
  throw new Error(
    "One or more essential Discord modules not found. Script cannot continue."
  );
}

// Enroll in quest function
async function enrollInQuest(questId) {
  try {
    const res = await api.post({
      url: `/quests/${questId}/enroll`,
      body: { location: "store", source: "quest_page" },
    });
    if (res.status === 200) {
      console.log(`Enrolled in quest ${questId}`);
      return true;
    } else {
      console.warn(
        `Failed to enroll in quest ${questId}: ${res.status}`,
        res.body
      );
      return false;
    }
  } catch (err) {
    console.error(`Error enrolling in quest ${questId}:`, err);
    return false;
  }
}

// Complete quest function with all task types
async function completeQuest(quest) {
  try {
    if (!quest?.config || !quest?.userStatus) {
      console.warn("Invalid quest object:", quest);
      return;
    }

    const pid = Math.floor(Math.random() * 30000) + 1000;
    const { application, messages, taskConfig, taskConfigV2 } = quest.config;
    const taskCfg = taskConfig ?? taskConfigV2;
    if (!taskCfg?.tasks) {
      console.warn(
        `No task config tasks found in quest: ${
          messages?.questName ?? "(unknown)"
        }`
      );
      return;
    }
    const taskName = [
      "WATCH_VIDEO",
      "PLAY_ON_DESKTOP",
      "STREAM_ON_DESKTOP",
      "PLAY_ACTIVITY",
      "WATCH_VIDEO_ON_MOBILE",
    ].find((x) => taskCfg.tasks[x] != null);

    if (!taskName) {
      console.warn(`No supported task found for quest ${messages?.questName}`);
      return;
    }

    const secondsNeeded = taskCfg.tasks[taskName]?.target ?? 0;
    let secondsDone = quest.userStatus.progress?.[taskName]?.value ?? 0;
    const isApp = typeof DiscordNative !== "undefined";
    const questName = messages?.questName ?? "Unknown Quest";

    console.log(
      `Starting quest: ${questName} (Task: ${taskName}, Target: ${secondsNeeded}s)`
    );

    if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
      const maxFutureSec = 10;
      const progressSpeed = 7;
      const updateIntervalSec = 1;
      const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
      let completed = false;
      let loopCounter = 0;

      while (secondsDone < secondsNeeded) {
        loopCounter++;
        if (loopCounter > 1000) {
          console.warn(
            "Breaking video spoof loop to avoid infinite iteration."
          );
          break;
        }

        const maxAllowed =
          Math.floor((Date.now() - enrolledAt) / 1000) + maxFutureSec;
        if (maxAllowed - secondsDone >= progressSpeed) {
          const nextTimestamp = Math.min(
            secondsNeeded,
            secondsDone + progressSpeed + Math.random()
          );

          try {
            const res = await api.post({
              url: `/quests/${quest.id}/video-progress`,
              body: { timestamp: nextTimestamp },
            });
            completed = res.body?.completed_at != null;
            secondsDone = nextTimestamp;
            console.log(`Video progress: ${secondsDone}/${secondsNeeded}`);
          } catch (err) {
            console.error("Error while posting video progress:", err);
          }

          if (completed) break;
        }

        await sleep(updateIntervalSec * 1000);
      }

      if (!completed) {
        try {
          await api.post({
            url: `/quests/${quest.id}/video-progress`,
            body: { timestamp: secondsNeeded },
          });
        } catch (err) {
          console.error("Error posting final video completion:", err);
        }
      }
      console.log(`Quest ${questName} completed!`);
    } else if (taskName === "PLAY_ON_DESKTOP") {
      if (!isApp) {
        console.log(`Please use desktop app for quest ${questName}`);
        return;
      }
      try {
        const res = await api.get({
          url: `/applications/public?application_ids=${application.id}`,
        });
        const appData = res.body?.[0];
        if (!appData || !appData.executables) {
          console.warn(`Invalid application data for ${questName}`);
          return;
        }
        const exeInfo = appData.executables.find((e) => e.os === "win32");
        if (!exeInfo) {
          console.warn(`No Win32 executable found for app in ${questName}`);
          return;
        }

        const exeName = exeInfo.name.replace(">", "");
        const fakeGame = {
          cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
          exeName,
          exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
          hidden: false,
          isLauncher: false,
          id: application.id,
          name: appData.name,
          pid,
          pidPath: [pid],
          processName: appData.name,
          start: Date.now(),
        };

        const realGames = RunningGameStore.getRunningGames();
        const fakeGames = [...realGames, fakeGame];

        // Backup original methods
        const origGetRunningGames = RunningGameStore.getRunningGames;
        const origGetGameForPID = RunningGameStore.getGameForPID;

        RunningGameStore.getRunningGames = () => fakeGames;
        RunningGameStore.getGameForPID = (p) =>
          fakeGames.find((g) => g.pid === p);

        FluxDispatcher.dispatch({
          type: "RUNNING_GAMES_CHANGE",
          removed: [],
          added: [fakeGame],
          games: fakeGames,
        });

        let loopCount = 0;
        while (secondsDone < secondsNeeded) {
          loopCount++;
          if (loopCount > 120) {
            console.warn(
              "Breaking spoof play loop to avoid infinite iteration."
            );
            break;
          }
          await sleep(30 * 1000);
          secondsDone = Math.min(secondsDone + 30, secondsNeeded);
          try {
            await api.post({
              url: `/quests/${quest.id}/progress`,
              body: { progress: { [taskName]: secondsDone } },
            });
            console.log(`Play progress: ${secondsDone}/${secondsNeeded}`);
          } catch (err) {
            console.error("Error posting play progress:", err);
          }
        }

        console.log(`Quest ${questName} completed!`);

        // Restore original methods and dispatch removal
        RunningGameStore.getRunningGames = origGetRunningGames;
        RunningGameStore.getGameForPID = origGetGameForPID;

        FluxDispatcher.dispatch({
          type: "RUNNING_GAMES_CHANGE",
          removed: [fakeGame],
          added: [],
          games: realGames,
        });
      } catch (err) {
        console.error("Error handling PLAY_ON_DESKTOP quest:", err);
      }
    } else if (taskName === "STREAM_ON_DESKTOP") {
      if (!isApp) {
        console.log(`Please use desktop app for quest ${questName}`);
        return;
      }

      if (!ApplicationStreamingStore) {
        console.warn("Streaming store not available. Can't spoof stream task.");
        return;
      }
      if (!encodeStreamKey) {
        console.warn(
          "encodeStreamKey function missing, cannot spoof streaming."
        );
        return;
      }

      const currentStream =
        ApplicationStreamingStore.getCurrentUserActiveStream();

      if (!currentStream) {
        console.log(
          `Please start streaming in a voice channel first for ${questName}`
        );
        return;
      }

      const streamKey = encodeStreamKey(currentStream);
      if (!streamKey) {
        console.warn("Failed to encode stream key for streaming task.");
        return;
      }

      let progressSeconds = secondsDone;
      let loopSafety = 0;

      while (progressSeconds < secondsNeeded) {
        loopSafety++;
        if (loopSafety > 120) {
          console.warn(
            "Breaking stream spoof loop to avoid infinite iteration."
          );
          break;
        }
        await sleep(30 * 1000);
        try {
          const res = await api.post({
            url: `/quests/${quest.id}/heartbeat`,
            body: { stream_key: streamKey },
          });
          progressSeconds =
            res.body?.stream_progress_seconds ?? progressSeconds + 30;
          progressSeconds = Math.min(progressSeconds, secondsNeeded);
          console.log(`Stream progress: ${progressSeconds}/${secondsNeeded}`);
        } catch (err) {
          console.error("Error posting stream heartbeat:", err);
        }
      }
      console.log(`Quest ${questName} completed!`);
    } else {
      console.warn(`Unsupported task type: ${taskName} for quest ${questName}`);
    }
  } catch (err) {
    console.error(`Error completing quest ID ${quest.id}:`, err);
  }
}

// Main function to process all quests
async function main() {
  try {
    if (!QuestsStore.quests) {
      console.error("QuestsStore not initialized or empty.");
      return;
    }

    const allQuests = [...QuestsStore.quests.values()].filter(
      (q) =>
        q?.config?.expiresAt &&
        new Date(q.config.expiresAt).getTime() > Date.now()
    );

    if (allQuests.length === 0) {
      console.log("No active quests found.");
      return;
    }

    // Enroll in unenrolled quests serially
    for (const quest of allQuests) {
      console.log("Processing quest:", quest);
      if (!quest.userStatus?.enrolledAt) {
        const enrolled = await enrollInQuest(quest.id);
        if (enrolled) {
          quest.userStatus = {
            enrolledAt: new Date().toISOString(),
            progress: {},
          };
        }
        // Slight delay to avoid spamming API
        await sleep(500);
      }
    }

    // Complete enrolled but incomplete quests serially
    const incomplete = allQuests.filter(
      (q) => q.userStatus?.enrolledAt && !q.userStatus.completedAt
    );

    if (incomplete.length === 0) {
      console.log("No uncompleted quests to process.");
      return;
    }

    for (const quest of incomplete) {
      await completeQuest(quest);
      await sleep(1000); // Delay to be polite to API
    }
  } catch (err) {
    console.error("Fatal error in main execution:", err);
  }
}

main();
