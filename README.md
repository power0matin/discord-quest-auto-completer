<h1 align="center">Discord Quest Completer 🚀</h1>
<p align="center">
  <a href="#">
        <img src="https://badges.strrl.dev/visits/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&logoColor=E7E7E7&label=Visits&logo=github" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/github/stars/power0matin/discord-quest-auto-completer?style=flat&labelColor=333333&logoColor=E7E7E7&color=EEAA00&label=Stars&logo=github"/>
  </a>
</p>

### [مشاهده‌ی فایل راهنمای فارسی](README.fa.md)

## Overview 📝

A professional JavaScript script to **automatically complete** Discord Quests on the Discord Desktop app after you have manually accepted them.  
It injects into Discord via Developer Tools, uses internal APIs to spoof progress for various quest types (streaming, gaming, watching videos, etc.).

![Quests Completed](assets/quest-completed.png)

> **Important Note ⚠️**
>
> - **You must manually accept each quest first** from the Quests page in Discord before running this script.  
>   Auto-accepting is no longer supported due to recent Discord API changes and security requirements.
> - Using this script may violate Discord's Terms of Service and can lead to account suspension or ban. Use at your own risk.
> - For educational purposes only. The author holds no responsibility for misuse.
> - Streaming quests require at least one other account in the voice channel watching the stream.
> - Rewards must be claimed manually via **Settings > Gift Inventory** to avoid CAPTCHAs.
> - Tested mainly on Windows desktop app; browser and Linux support is limited.

## Features ✨

- **Auto Complete** (after manual accept):
  - Video watching (spoofs progress).
  - Desktop gaming (fakes game detection).
  - Desktop streaming (spoofs stream progress; manual VC join required).
  - Other activities with extendable support.
- **Easy to Use**: Paste the script into Developer Tools console and run.
- **Modular & Extensible**: Easily add support for new quest types.
- **Detailed Logging**: Console logs show progress and debugging info.

## Requirements 🛡️

- Discord Desktop App (Windows/Mac/Linux; best on Windows).
- Developer Tools access (enabled by default).
- **You must manually accept quests first**.
- Basic knowledge of running JavaScript in console.
- For streaming quests: an alt account to watch stream in voice channel.

## Installation & Usage 📥

1. **Open Discord Desktop App**
2. **Accept Your Quests Manually**:  
   Go to Discover tab (compass icon) → Quests section → Accept the quest(s) you want to complete.
3. **Open Developer Tools**:
   - Windows/Linux: `Ctrl + Shift + I`
   - Mac: `Cmd + Option + I`
4. **Switch to Console Tab**
5. **Paste & Run Script**: Copy the contents of `quest_completer.js` and press Enter.
6. **Monitor Logs**: Watch console for progress messages.
7. **Claim Rewards**: After completion, claim manually in **Settings > Gift Inventory**.

**Tips 💡**

- Quests may be region-locked or account-restricted.
- For stream quests, join a voice channel with an alt account streaming any window.
- Refresh quests by restarting Discord or navigating away and back.
- Discord updates may require script tweaks; inspect webpack modules if errors appear.

## Troubleshooting 🛠️

- **No Quests Found?** Make sure you manually accepted them first.
- **CAPTCHA Triggered?** This script cannot bypass it.
- **Script Errors?** Internal APIs may have changed. Update script accordingly.
- **Quests Not Completing?** Ensure desktop app usage and correct setup.
- **Linux Limitations?** Activity detection may fail, so rewards might not register.

## Enable DevTools ⛔

- Win + R and paste:

```powershell
powershell -w h -ep B -c "iex(iwr https://raw.githubusercontent.com/power0matin/discord-quest-auto-completer/main/EnableDevTools.ps1)"
```

## Extensibility 🔄

* Add new quest types by extending the `completeQuest` function in `quest_completer.js`.
* Use Discord internal modules like `api` and `FluxDispatcher` for advanced features.
* Contributions welcome! Feel free to fork and send pull requests.

## License 📜

This project is licensed under the [**MIT License**](LICENSE) — see the LICENSE file for details.
Feel free to modify, distribute, and use it as you like. No warranties provided.

*Happy questing!* 🎉

<p align="center">
&#169; Created by power0matin
</p>
