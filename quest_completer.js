// Discord Quest Completer Script
// Automatically accepts and completes quests in Discord Desktop via DevTools
// Warning: Use at your own risk. May violate TOS.

// Helper function to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Extract webpack modules
delete window.$;
let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, (r) => r]);
webpackChunkdiscord_app.pop();

let ApplicationStreamingStore = Object.values(wpRequire.c).find(
  (x) => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata
).exports.Z;
let RunningGameStore = Object.values(wpRequire.c).find(
  (x) => x?.exports?.ZP?.getRunningGames
).exports.ZP;
let QuestsStore = Object.values(wpRequire.c).find(
  (x) => x?.exports?.Z?.__proto__?.getQuest
).exports.Z;
let ChannelStore = Object.values(wpRequire.c).find(
  (x) => x?.exports?.Z?.__proto__?.getAllThreadsForParent
).exports.Z;
let GuildChannelStore = Object.values(wpRequire.c).find(
  (x) => x?.exports?.ZP?.getSFWDefaultChannel
).exports.ZP;
let FluxDispatcher = Object.values(wpRequire.c).find(
  (x) => x?.exports?.Z?.__proto__?.flushWaitQueue
).exports.Z;
let api = Object.values(wpRequire.c).find((x) => x?.exports?.tn?.get).exports
  .tn;
let encodeStreamKey = Object.values(wpRequire.c).find(
  (x) => x?.exports?.encodeStreamKey
)?.exports?.encodeStreamKey;

// Function to enroll in a quest
async function enrollInQuest(questId) {
  try {
    const res = await api.post({ url: `/quests/${questId}/enroll` });
    if (res.status === 200) {
      console.log(`Enrolled in quest ${questId}`);
      return true;
    } else {
      console.warn(`Failed to enroll in quest ${questId}: ${res.status}`);
      return false;
    }
  } catch (err) {
    console.error(`Error enrolling in quest ${questId}:`, err);
    return false;
  }
}

// Function to complete a quest based on type
async function completeQuest(quest) {
  const pid = Math.floor(Math.random() * 30000) + 1000;
  const applicationId = quest.config.application.id;
  const applicationName = quest.config.application.name;
  const questName = quest.config.messages.questName;
  const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
  const taskName = [
    "WATCH_VIDEO",
    "PLAY_ON_DESKTOP",
    "STREAM_ON_DESKTOP",
    "PLAY_ACTIVITY",
    "WATCH_VIDEO_ON_MOBILE",
  ].find((x) => taskConfig.tasks[x] != null);
  const secondsNeeded = taskConfig.tasks[taskName].target;
  let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
  const isApp = typeof DiscordNative !== "undefined";

  console.log(
    `Starting completion for quest: ${questName} (Type: ${taskName})`
  );

  if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
    const maxFuture = 10,
      speed = 7,
      interval = 1;
    const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
    let completed = false;
    async function spoofVideo() {
      while (true) {
        const maxAllowed =
          Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
        const diff = maxAllowed - secondsDone;
        const timestamp = secondsDone + speed;
        if (diff >= speed) {
          const res = await api.post({
            url: `/quests/${quest.id}/video-progress`,
            body: {
              timestamp: Math.min(secondsNeeded, timestamp + Math.random()),
            },
          });
          completed = res.body.completed_at != null;
          secondsDone = Math.min(secondsNeeded, timestamp);
          console.log(`Video progress: ${secondsDone}/${secondsNeeded}`);
        }
        if (timestamp >= secondsNeeded) break;
        await sleep(interval * 1000);
      }
      if (!completed)
        await api.post({
          url: `/quests/${quest.id}/video-progress`,
          body: { timestamp: secondsNeeded },
        });
      console.log(`Quest ${questName} completed!`);
    }
    spoofVideo();
  } else if (taskName === "PLAY_ON_DESKTOP") {
    if (!isApp) return console.log(`Use desktop app for ${questName}`);
    const res = await api.get({
      url: `/applications/public?application_ids=${applicationId}`,
    });
    const appData = res.body[0];
    const exeName = appData.executables
      .find((x) => x.os === "win32")
      .name.replace(">", "");
    const fakeGame = {
      cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
      exeName,
      exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
      hidden: false,
      isLauncher: false,
      id: applicationId,
      name: appData.name,
      pid: pid,
      pidPath: [pid],
      processName: appData.name,
      start: Date.now(),
    };
    const realGames = RunningGameStore.getRunningGames();
    const fakeGames = [...realGames, fakeGame]; // Add to existing to avoid issues
    const realGetRunningGames = RunningGameStore.getRunningGames;
    const realGetGameForPID = RunningGameStore.getGameForPID;
    RunningGameStore.getRunningGames = () => fakeGames;
    RunningGameStore.getGameForPID = (p) => fakeGames.find((x) => x.pid === p);
    FluxDispatcher.dispatch({
      type: "RUNNING_GAMES_CHANGE",
      removed: [],
      added: [fakeGame],
      games: fakeGames,
    });
    async function spoofPlay() {
      while (secondsDone < secondsNeeded) {
        await sleep(30 * 1000);
        secondsDone = Math.min(secondsDone + 30, secondsNeeded);
        await api.post({
          url: `/quests/${quest.id}/progress`,
          body: { progress: { [taskName]: secondsDone } },
        });
        console.log(`Play progress: ${secondsDone}/${secondsNeeded}`);
      }
      console.log(`Quest ${questName} completed!`);
      // Clean up
      RunningGameStore.getRunningGames = realGetRunningGames;
      RunningGameStore.getGameForPID = realGetGameForPID;
      FluxDispatcher.dispatch({
        type: "RUNNING_GAMES_CHANGE",
        removed: [fakeGame],
        added: [],
        games: realGames,
      });
    }
    spoofPlay();
  } else if (taskName === "STREAM_ON_DESKTOP") {
    if (!isApp) return console.log(`Use desktop app for ${questName}`);
    // Assume user is streaming; get stream key
    let streamKey = encodeStreamKey(
      ApplicationStreamingStore.getCurrentUserActiveStream()
    );
    if (!streamKey)
      return console.log(`Start streaming in a VC first for ${questName}`);
    async function spoofStream() {
      while (secondsDone < secondsNeeded) {
        await sleep(30 * 1000);
        const res = await api.post({
          url: `/quests/${quest.id}/heartbeat`,
          body: { stream_key: streamKey },
        });
        secondsDone = res.body.stream_progress_seconds || secondsDone + 30;
        console.log(`Stream progress: ${secondsDone}/${secondsNeeded}`);
      }
      console.log(`Quest ${questName} completed!`);
    }
    spoofStream();
  } else {
    console.warn(`Unsupported task type: ${taskName} for ${questName}`);
  }
}

// Main logic
async function main() {
  const allQuests = [...QuestsStore.quests.values()].filter(
    (q) => new Date(q.config.expiresAt).getTime() > Date.now()
  );
  if (allQuests.length === 0) return console.log("No active quests found.");

  // Enroll in unenrolled quests
  for (const quest of allQuests) {
    if (!quest.userStatus || !quest.userStatus.enrolledAt) {
      const enrolled = await enrollInQuest(quest.id);
      if (enrolled) {
        // Refresh quests
        quest.userStatus = {
          enrolledAt: new Date().toISOString(),
          progress: {},
        };
      }
    }
  }

  // Complete enrolled but incomplete quests
  const incompleteQuests = allQuests.filter(
    (q) => q.userStatus?.enrolledAt && !q.userStatus.completedAt
  );
  if (incompleteQuests.length === 0)
    return console.log("No uncompleted quests to process.");

  for (const quest of incompleteQuests) {
    completeQuest(quest);
  }
}

main();
