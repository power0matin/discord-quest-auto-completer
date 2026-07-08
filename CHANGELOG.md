# Changelog

All notable changes to this repository are documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/), and versioning follows [SemVer](https://semver.org/) where practical.

## [Unreleased]

### Notes
- Changes on `main` after the last tag will appear here until the next release.

## [v1.0.0] — 2026-07-08

### Added
- **QuestMaster** — Complete rewrite with full visual dashboard
- **Draggable UI** — Real-time task cards with progress bars and circular indicators
- **Quest Picker** — Select which quests to complete with reward/type filters
- **Auto-enrollment** — Automatically accepts quests before completing
- **Auto-claim** — Claims rewards automatically when quests finish
- **Multiple quest type support:**
  - `WATCH_VIDEO` — Fast video-progress spoofing (~2-4 min)
  - `PLAY_ON_DESKTOP` — Fake game process injection + heartbeat
  - `STREAM_ON_DESKTOP` — Stream key spoofing
  - `PLAY_ACTIVITY` — Voice channel heartbeat loop
  - `ACHIEVEMENT_IN_ACTIVITY` — OAuth bypass flow (Vencord/relay required)
- **Rate limit handling** — Smart retry with exponential backoff and jitter
- **Error classification** — Retryable vs permanent errors with automatic recovery
- **Request queue** — FIFO queue with rate-limit-aware processing
- **Store patching** — Monkey-patches Discord's RunningGameStore for game spoofing
- **Sound cues** — Optional audio feedback on completion
- **Browser notifications** — Desktop notifications when quests finish
- **OAuth consent gate** — Informed consent before authorizing third-party apps
- **Settings panel** — Toggle auto-enroll, auto-claim, sound, random delay
- **Keyboard shortcuts** — `>` or `Shift+.` to toggle dashboard visibility
- **Clean shutdown** — Properly restores all Discord internals on stop
- **Anti-detection mode** — Optional randomized delays between quest cycles
- **Webpack module extraction** — Stable discriminator-based store discovery
- **Vencord integration** — Uses Vencord Webpack API when available
- **Farsi README** — Complete Persian documentation

### Changed
- Replaced simple console script with full-featured visual dashboard
- Improved quest type detection with flexible key matching
- Enhanced error handling with proper HTTP status classification
- Updated Discord API interaction patterns for latest client version

### Fixed
- Token extraction now works with Discord's updated webpack structure
- Quest data fields updated to match Discord's snake_case API response
- Rate limit handling prevents account-level blocks
- Enrollment body format corrected for latest API

## [v0.1.1] — 2025-12-14

### Added
- Added `SECURITY.md` for private vulnerability reporting guidelines
- Added `CHANGELOG.md` to track notable changes

### Notes
- Documentation-only release; no runtime changes.

## [v0.1.0] — 2025-12-13

### Documentation
- Added license information to READMEs
- Added contact information

## Release Links
- Compare: `v0.1.1` → `v1.0.0`: https://github.com/power0matin/discord-quest-auto-completer/compare/v0.1.1...v1.0.0
- Compare: `v0.1.0` → `v0.1.1`: https://github.com/power0matin/discord-quest-auto-completer/compare/v0.1.0...v0.1.1
