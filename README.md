# Discord Quest Completer 🚀

## Overview 📝
This is a professional JavaScript script designed to automatically accept and complete Discord Quests in the desktop version of Discord. It works by injecting into the Discord client via Developer Tools and using internal APIs to enroll in quests and spoof progress for various quest types (e.g., streaming, playing games, watching videos). 

**Warning ⚠️:**  
- Using this script may violate Discord's Terms of Service and could result in account suspension or ban. Use at your own risk.  
- This script is for educational purposes only. The author is not responsible for any consequences.  
- For stream quests, you need at least one other account in the voice channel (VC) watching the stream.  
- Auto-enrolling in quests may trigger a CAPTCHA in some cases, which the script cannot handle. If that happens, enroll manually.  
- This script does not auto-claim rewards; do that manually in Settings > Gift Inventory to avoid potential CAPTCHAs.  
- Tested on Windows desktop app. May not work on browser for non-video quests. Linux users may face limitations in earning rewards.

## Features ✨
- **Automatic Acceptance 🤖:** Scans for available quests and enrolls in them automatically.  
- **Automatic Completion ⚡:** Handles different quest types:  
  - Video watching (spoofs video progress).  
  - Playing games on desktop (fakes game detection).  
  - Streaming on desktop (spoofs stream progress; requires manual VC join and stream start).  
  - Other activities (basic support; extensible).  
- **Easy to Use 🛠️:** Simply paste into DevTools console.  
- **Extensible 🔧:** Modular code for adding support for new quest types.  
- **Logging 📋:** Detailed console logs for progress and debugging.

## Requirements 🛡️
- Discord Desktop App (Windows/Mac/Linux; primarily tested on Windows).  
- Access to Developer Tools (enabled by default in Discord).  
- Basic knowledge of copying/pasting code into a console.  
- For certain quests: An alt account for streaming verification.

## Installation & Usage 📥
1. **Open Discord Desktop App** 🔵: Launch the official Discord app on your computer.  
2. **Navigate to Quests** 🗺️: Go to the Discover tab (compass icon) > Quests section. This loads the quests for the script to detect.  
3. **Open Developer Tools** 🔍: Press `Ctrl + Shift + I` (Windows/Linux) or `Cmd + Option + I` (Mac) to open DevTools.  
4. **Switch to Console Tab** 📟: Click on the "Console" tab at the top of DevTools.  
5. **Paste the Script** 📋: Copy the entire contents of `quest_completer.js` (provided below) and paste it into the console. Press Enter to run it.  
6. **Monitor Progress** 👀: Watch the console for logs. The script will enroll in quests and start completing them automatically.  
7. **Claim Rewards Manually** 🎁: Once quests are completed, go to Settings (gear icon) > Gift Inventory to claim your rewards. Avoid auto-claiming to prevent CAPTCHAs.  

**Tips 💡:**  
- If no quests appear, check your region or account eligibility—quests may not be available everywhere.  
- For stream quests: Join a voice channel with an alt account, start streaming any app/window, then run the script.  
- Refresh the Quests page if needed by restarting Discord or navigating away and back.  
- If errors occur (e.g., due to Discord updates), the script may need tweaks—check for webpack module changes.

## Potential Issues & Troubleshooting 🛠️
- **No Quests Found?** 😕: Ensure quests are active in your region. Try a VPN if needed (but beware of TOS).  
- **CAPTCHA Triggered?** 🚫: Enroll manually via the Quests tab.  
- **Script Errors?** ❌: Discord's internal APIs can change; update the script by inspecting webpack modules in DevTools.  
- **Not Completing?** 🔄: For play/stream quests, confirm you're using the desktop app and setup is correct.  
- **Linux Issues?** 🐧: Discord may not detect activities properly—rewards might not register.

## Extensibility 🔄
- To support new task types, modify the `completeQuest` function in `quest_completer.js` by adding conditions for new `taskName` values.  
- Use Discord's internal modules (e.g., `api`, `FluxDispatcher`) to extend functionality.  
- Contributions welcome! Fork and PR if you improve it.

## License 📜
MIT License. Feel free to modify, distribute, and use as you see fit. No warranties provided.
