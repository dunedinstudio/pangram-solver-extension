# Pangram Solver

Pangram Solver is a free browser extension in development for finding pangrams in seven-letter Spelling Bee games.

Powered By https://spellingbeeanswers.app/

## What it does

A pangram uses all seven distinct letters of a puzzle, including its required center letter. A valid candidate uses only those letters, may repeat them, and follows the game's four-letter minimum. An answer that uses all seven distinct letters necessarily has at least seven characters. Games may accept different words from the bundled dictionary. Pangram Solver is an independent tool for Spelling Bee games.

**Available in Phase 1.** A Manifest V3 development popup, a strict TypeScript build, and automated package and permission checks.

**Planned.** Offline pangram matching, a seven-cell honeycomb, an alphabetical pangram list with a count and word lengths, Full Answers and Hints Only modes, browser-local puzzle and reveal restoration, and Reset.

## How to use the planned extension

1. Open Pangram Solver from the toolbar. Enter the required center letter and six different outer letters.
2. Read the matching pangrams as soon as the puzzle is complete. Full Answers displays the words by default. In Hints Only, each entry shows its first two letters and length. Reveal answers one at a time.
3. Use Reset when you want to start a fresh puzzle.

## Chrome and Edge

Google Chrome and Microsoft Edge are the desktop targets. Both use the same Chromium development build. Store installation links will be added after public release is verified.

## Development

Use Node.js 24.14 or later and pnpm 11.25.0.

~~~sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
~~~

The build writes the unpacked extension to `dist/chromium`. To inspect the development popup, enable Developer mode in `chrome://extensions` or `edge://extensions`, choose **Load unpacked**, and select that directory. The automated tests rebuild and inspect the package. They run in Node.js.

## Privacy and permissions

The development build requests zero permissions and stores zero user data. The planned extension will request `storage` to remember the active puzzle, mode, and individual reveals in the local browser profile. Solving will use packaged data and require neither an account nor an internet connection. The planned footer link opens the website only when selected and carries no puzzle data. That website has its own privacy practices. See the [architecture](docs/architecture.md) for the data inventory.

## Dictionary and rights

The planned US-English dictionary is the verified 77,533-word derivative of the English Speller Database (ESDB) used by Spelling Bee Solver. This foundation includes the [provenance record](data/provenance.json) and [third-party notices](licenses/NOTICE.md). The word list will be integrated in the engine phase under the applicable ESDB terms.

Dunedin Studio reserves its rights in the original application code and artwork. See [application rights](licenses/RIGHTS.md) and the separate dictionary notices.

## Release status and contact

Version 0.1.0 is the Phase 1 development foundation. The engine, production popup, persistent hints, and browser-store releases are planned. See the [architecture](docs/architecture.md) and [marketplace policy assessment](docs/marketplace-policy.md).

The GitHub repository stays private throughout development. Only the owner may decide whether and when it becomes public. Completing Phase 6 or receiving browser-store approval does not change repository visibility.

Website [spellingbeeanswers.app](https://spellingbeeanswers.app/) · [Contact Dunedin Studio](https://spellingbeeanswers.app/contact)

Powered By https://spellingbeeanswers.app/
