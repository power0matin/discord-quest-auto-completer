# Discord Quest Completer 🚀

## Overview 📝
A professional JavaScript script to automatically accept and complete Discord Quests on the Discord Desktop app.  
It injects into Discord via Developer Tools, uses internal APIs to enroll in quests, and spoofs progress for various quest types (streaming, gaming, watching videos, etc.).

> **Warning ⚠️**  
> - Using this script may violate Discord's Terms of Service and can lead to account suspension or ban. Use at your own risk.  
> - For educational purposes only. The author holds no responsibility for misuse.  
> - Streaming quests require at least one other account in the voice channel watching the stream.  
> - Auto-enrolling may trigger CAPTCHA, which this script cannot bypass. Enroll manually if that happens.  
> - Rewards must be claimed manually via **Settings > Gift Inventory** to avoid CAPTCHAs.  
> - Tested mainly on Windows desktop app; browser and Linux support is limited.

 
## Features ✨
- **Auto Accept**: Automatically scans and enrolls in available quests.  
- **Auto Complete**: Supports:  
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
- Basic knowledge of running JavaScript in console.  
- For streaming quests: an alt account to watch stream in voice channel.

 
## Installation & Usage 📥
1. **Open Discord Desktop App**  
2. **Go to Quests**: Navigate to Discover tab (compass icon) → Quests section.  
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
- **No Quests Found?** Check region and eligibility. VPN might help but may violate TOS.  
- **CAPTCHA Triggered?** Enroll quests manually.  
- **Script Errors?** Internal APIs may have changed. Update script accordingly.  
- **Quests Not Completing?** Ensure desktop app usage and correct setup.  
- **Linux Limitations?** Activity detection may fail, so rewards might not register.

 
## Extensibility 🔄
- Add new quest types by extending the `completeQuest` function in `quest_completer.js`.  
- Use Discord internal modules like `api` and `FluxDispatcher` for advanced features.  
- Contributions welcome! Feel free to fork and send pull requests.

 
## License 📜
This project is licensed under the [**MIT License**](LICENSE) — see the LICENSE file for details.  
Feel free to modify, distribute, and use it as you like. No warranties provided.

 
*Happy questing!* 🎉
