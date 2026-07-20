<h1 align="center">QuestMaster — Discord Quest Auto Completer | Auto Complete Discord Quests Script</h1>

<p align="center">
  <img src="https://img.shields.io/github/stars/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&color=EEAA00&label=Stars&logo=github" alt="GitHub stars for discord quest auto completer"/>
  <img src="https://img.shields.io/github/forks/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&color=5865F2&label=Forks&logo=github" alt="GitHub forks for discord quest automation tool"/>
  <img src="https://img.shields.io/github/issues/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&color=3BA55C&label=Issues&logo=github" alt="GitHub issues for discord quest script"/>
  <img src="https://img.shields.io/github/license/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&color=f04747&label=License&logo=github" alt="MIT License for discord quest completer"/>
</p>

<p align="center">
  <b>Automatically complete Discord quests with a beautiful in-app dashboard</b><br>
  <sub>Video quests, game quests, streaming quests, activities, achievements — all handled automatically</sub>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#quest-types">Quest Types</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#faq">FAQ</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <b>Discord Quest Auto Completer</b> | <b>Discord Quest Script</b> | <b>Auto Complete Discord Quests</b> | <b>Discord Quest Bot</b>
</p>

## Disclaimer

> This tool is for **educational purposes only**. Using automation on Discord may violate their [Terms of Service](https://discord.com/terms) and could result in account penalties. **Use at your own risk.**

## Features — Discord Quest Auto Completer

| Feature | Description |
|---------|-------------|
| **Smart Quest Detection** | Automatically finds and categorizes all available Discord quests |
| **Video Quest Spoofing** | Complete video-watching quests without watching — auto complete discord video quests |
| **Game Quest Spoofing** | Fakes running processes to complete play-time quests — discord game quest automation |
| **Stream Quest Spoofing** | Spoofs streaming progress via heartbeat injection — discord stream quest script |
| **Activity Quests** | Complete in-activity quests through voice channel heartbeats |
| **Achievement Bypass** | OAuth flow for achievement-in-activity quests (needs Vencord or relay) |
| **Beautiful Dashboard** | Draggable in-app UI with real-time progress tracking |
| **Quest Picker** | Select which quests to complete with reward/type filters |
| **Auto-Enroll** | Automatically accepts quests before completing them |
| **Auto-Claim** | Claims rewards automatically when quests complete — discord quest reward auto claim |
| **Notifications** | Browser notifications when quests finish |
| **Sound Cues** | Optional audio feedback on completion |
| **Rate Limit Handling** | Smart retry with exponential backoff |
| **Anti-Detection** | Optional random delays between quest cycles |
| **Clean Shutdown** | Properly restores all Discord internals on stop |

## Quick Start — How to Auto Complete Discord Quests

### Prerequisites
- **Discord Desktop App** (Windows recommended)
- **Developer Tools** enabled (`Ctrl+Shift+I`)

### Steps to Auto Complete Discord Quests

1. **Open Discord** and go to **Discover → Quests**
2. **Accept the quests** you want to complete
3. Open **Developer Tools** (`Ctrl+Shift+I` on Windows, `Cmd+Option+I` on Mac)
4. Go to the **Console** tab
5. **Type `allow pasting`** and press Enter (Discord requires this)
6. **Paste the script** from `quest_completer.js` and press Enter
7. The **QuestMaster dashboard** appears — select your quests and click **START**

> Press `>` or `Shift+.` to hide/show the dashboard. Click **STOP** to cleanly shut down.

## How It Works — Discord Quest Automation

The QuestMaster script works by injecting into Discord's internal webpack modules to access the QuestStore, API, and Dispatcher. Here's the complete flow:

1. Load Discord's internal webpack modules
2. Extract QuestStore, API, Dispatcher, and other internal components
3. Fetch all available quests via Discord API
4. Show quest picker UI (select quests + options)
5. For each quest type:
   - VIDEO → Spoof video-progress timestamps
   - GAME → Inject fake process + heartbeat loop
   - STREAM → Spoof stream key + heartbeat
   - ACTIVITY → Voice channel heartbeat loop
   - ACHIEVEMENT → OAuth bypass flow
6. Claim rewards (auto or manual via UI button)

## Quest Types — Discord Quest Categories

| Type | Method | Time | Notes |
|------|--------|------|-------|
| `WATCH_VIDEO` | API timestamp spoofing | ~2-4 min | Fastest, no dependencies |
| `PLAY_ON_DESKTOP` | Fake process + heartbeat | ~10-25 min | Needs desktop app |
| `STREAM_ON_DESKTOP` | Stream key spoofing | ~10-25 min | Needs desktop app |
| `PLAY_ACTIVITY` | Voice channel heartbeat | ~10-25 min | Auto-finds voice channel |
| `ACHIEVEMENT_IN_ACTIVITY` | OAuth bypass | Instant | Needs Vencord or relay |

## Configuration — Discord Quest Settings

The script includes a **settings panel** (gear icon in dashboard) with these options:

| Option | Default | Description |
|--------|---------|-------------|
| **Auto-enroll** | On | Automatically accept quests before completing |
| **Auto-claim** | Off | Claim rewards without manual confirmation |
| **Sound on completion** | Off | Play audio cue when quest finishes |
| **Random delay** | Off | Add 1-30min random gaps between cycles (anti-detection) |

## Enabling DevTools (Windows)

If DevTools is disabled in Discord, enable it with:

```powershell
powershell -w h -ep B -c "iex(iwr https://raw.githubusercontent.com/power0matin/discord-quest-auto-completer/main/EnableDevTools.ps1)"
```

## Vencord Integration

For **achievement quests** (ACHIEVEMENT_IN_ACTIVITY), you need one of:

1. **Vencord Plugin** — Install the [OrionQuests Vencord plugin](https://github.com/power0matin/discord-quest-auto-completer) for native CSP bypass
2. **Orion Relay** — Run the relay server on `127.0.0.1:43210`
3. **Direct fetch** — Works on web Discord (no CSP restriction)

Without these, achievement quests will show "ACTION REQUIRED" and need manual completion.

## Troubleshooting — Discord Quest Issues

| Problem | Solution |
|---------|----------|
| **"No auth token"** | Reload Discord, wait 5 seconds, then paste again |
| **"Module not found"** | Discord updated — the script needs updating too |
| **"Rate limited"** | Wait for the timer or reload Discord to reset |
| **Quest stuck at 0%** | Check if quest requires specific conditions (region, account type) |
| **CAPTCHA required** | Script cannot bypass CAPTCHA — complete manually |
| **Dashboard not appearing** | Make sure you typed `allow pasting` first |
| **Script crashes** | Reload Discord and paste fresh — the lock auto-releases after 1.5s |

## FAQ — Discord Quest Auto Completer Questions

**Q: Is this safe to use?**
A: This interacts with Discord's internal APIs, which may violate their ToS. Use at your own risk.

**Q: Do I need to keep Discord open?**
A: Yes. The script runs in Discord's DevTools console and stops when you close it.

**Q: Can I run this on browser Discord?**
A: Partially. Video quests work on web. Game/stream quests need the desktop app.

**Q: Why do some quests need manual completion?**
A: Achievement quests require OAuth authorization, which Discord's CSP blocks from scripts. Use the Vencord plugin for full automation.

**Q: How do I claim rewards?**
A: Enable "Auto-claim" in settings, or click "CLAIM REWARD" buttons in the dashboard, or go to Settings → Gift Inventory.

**Q: What Discord quests can this auto complete?**
A: QuestMaster supports WATCH_VIDEO, PLAY_ON_DESKTOP, STREAM_ON_DESKTOP, PLAY_ACTIVITY, and ACHIEVEMENT_IN_ACTIVITY quest types.

**Q: Does this work on Discord mobile?**
A: No. This script requires Discord Desktop App or Discord Web with Developer Tools access.

## Project Structure

```
discord-quest-auto-completer/
├── quest_completer.js     # Main script — paste this into DevTools
├── EnableDevTools.ps1     # PowerShell script to enable DevTools
├── assets/
│   └── quest-completed.png
├── README.md              # English documentation
├── README.fa.md           # Persian documentation
├── SECURITY.md            # Security policy
├── CHANGELOG.md           # Version history
└── LICENSE                # MIT License
```

## Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

## Contact

**Matin Shahabadi**

- Website: [matinshahabadi.ir](https://matinshahabadi.ir)
- Email: [me@matinshahabadi.ir](mailto:me@matinshahabadi.ir)
- GitHub: [power0matin](https://github.com/power0matin)
- LinkedIn: [matin-shahabadi](https://www.linkedin.com/in/matin-shahabadi)

<p align="center">
  <b>If this helped you, consider giving it a star!</b><br>
  <sub>Your support keeps the project alive and helps others find it.</sub>
</p>

<p align="center">

<a href="https://next.ossinsight.io/widgets/official/analyze-repo-stars-history?repo_id=1034970863" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/analyze-repo-stars-history/thumbnail.png?repo_id=1034970863&image_size=auto&color_scheme=dark" width="721" height="auto">
    <img alt="Star History of power0matin/discord-quest-auto-completer" src="https://next.ossinsight.io/widgets/official/analyze-repo-stars-history/thumbnail.png?repo_id=1034970863&image_size=auto&color_scheme=light" width="721" height="auto">
  </picture>
</a>
</p>

<p align="center">
  Created by <a href="https://github.com/power0matin">power0matin</a>
</p>
