# Changelog

All notable changes to this repository are documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/), and versioning follows [SemVer](https://semver.org/) where practical.

## [Unreleased]

### Notes
- Changes on `main` after the last tag will appear here until the next release.

## [v1.1.0] — 2026-08-17

### Added
- **Runtime reliability fault-injection tests** covering hung requests, queue recovery, retries, quest routing, concurrent task isolation, store cleanup, and completion lifecycle.
- **Per-request timeouts** so a stalled Discord API call cannot block the global request queue indefinitely.
- **Per-task runtime and stall guards** with target-aware time budgets for long-running quests.
- **Local quest lifecycle tracking** for completed, enrolled, in-flight, deferred, and terminal quest states.

### Changed
- Transient network and timeout failures are now deferred and retried instead of permanently skipping the affected quest.
- Request retries use bounded exponential backoff with jitter while preserving rate-limit handling.
- Game/stream patching and shutdown cleanup are transactional and restore Discord store functions and listeners safely.
- Achievement relay detection is refreshed periodically and failed relay requests can fall back to other available transport paths.
- Auto-claim completion is awaited as part of the quest lifecycle, preventing shutdown/rescan races.

### Fixed
- Fixed `PLAY_ACTIVITY` quests being misclassified as desktop game quests.
- Fixed a hung API request being able to freeze all later quest requests.
- Fixed `PLAY_ACTIVITY` fabricating local progress when the server did not report progress.
- Fixed achievement heartbeat loops being able to run without a bounded fallback path.
- Fixed completed quests being re-run when Discord's local QuestStore update was delayed.
- Fixed invalid or unsupported quests causing endless empty rescan loops.
- Fixed one unexpected task rejection being able to interrupt scheduling of sibling quests.
- Fixed cleanup paths that could leave fake games, listeners, timers, or the runtime lock behind.
- Fixed random cycle delay being applied after no selected runnable quests remain.
- Fixed missing quest expiration metadata being treated as already expired.
- Fixed the Pull Request Management workflow failing with `403 Resource not accessible by integration` when posting PR comments, and upgraded `actions/github-script` to v9.

### Validation
- `node --check quest_completer.js`
- Multi-angle runtime fault-injection suite in `tests/reliability.test.js`
- Server-authoritative VIDEO completion regression test
- GAME heartbeat completion + RunningGameStore restore regression test
- Feature-preservation guards for the existing dashboard, picker, sound, notifications, settings, and Vencord integration

### Notes
- No intentional breaking changes. The existing QuestMaster dashboard and user-facing feature set are preserved.
- Discord Quests rely on private client internals, so live compatibility can still change when Discord updates its client.

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
- Compare: `v1.0.0` → `v1.1.0`: https://github.com/power0matin/discord-quest-auto-completer/compare/v1.0.0...v1.1.0
- Compare: `v0.1.1` → `v1.0.0`: https://github.com/power0matin/discord-quest-auto-completer/compare/v0.1.1...v1.0.0
- Compare: `v0.1.0` → `v0.1.1`: https://github.com/power0matin/discord-quest-auto-completer/compare/v0.1.0...v0.1.1
