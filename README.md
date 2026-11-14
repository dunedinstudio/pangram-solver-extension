# Pangram Solver

Pangram Solver is a free browser extension for finding pangrams and getting hints in seven-letter Spelling Bee games.


## Made for Spelling Bee games

A pangram uses all seven distinct letters of a puzzle, including its required center letter. A valid candidate uses only those letters, may repeat them, and follows the game's four-letter minimum. An answer that uses all seven distinct letters necessarily has at least seven characters. Games may accept different words from the bundled dictionary. Pangram Solver is an independent tool for Spelling Bee games.

**Implemented.** The Manifest V3 extension includes the offline pangram engine, keyboard and mouse entry, automatic results, and word lengths. Hints Only is selected when there is no valid saved mode. It shows two letters and the word length, with individual reveal buttons and a progress counter. Full Answers is available on the left. The popup restores saved letters, display mode, and reveals after closure and browser restart.

## How to use the popup

1. Open Pangram Solver from the toolbar. Enter the required center letter and six different outer letters.
2. Use **Hints Only** to reveal matching pangrams one at a time, or select **Full Answers** to see the complete list. Scroll inside the results panel to see longer lists.
3. Open the popup again to resume your saved puzzle, mode, and reveals.
4. Use **Reset** to clear the saved puzzle and reveals while keeping the selected display mode.

## Chrome and Edge

Google Chrome and Microsoft Edge are the desktop targets. Both use the same Chromium development build. Store installation links will be added after public release is verified.

## Development

Use Node.js 24.14 or later and pnpm 11.25.0.

~~~sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
pnpm run benchmark
~~~

The build writes the unpacked extension to `dist/chromium`. To inspect the development popup, enable Developer mode in `chrome://extensions` or `edge://extensions`, choose **Load unpacked**, and select that directory. The Node.js tests verify the package and compare the engine against independent dictionary oracles. Run the benchmark to measure dictionary initialization and lookup latency in Node.js.

The optional browser verification uses an installed Chrome or Edge and Playwright Core. Set `PANGRAM_PLAYWRIGHT` to an existing Playwright Core installation, then run `node scripts/verify-browser.mjs chrome` or `node scripts/verify-browser.mjs edge` after building. Add `--release` to test the matching ZIP and `--scaled` for 125% device scaling. The script uses real action popups and disposable profiles. The [owner release guide](OWNER_PHASE5_RELEASE_GUIDE.md) covers packaging, verification and evidence locations.

## Privacy and permissions

The extension requests only `storage` to keep the active puzzle, display mode, and individual reveals in the local browser profile. Solving uses packaged data and requires neither an account nor an internet connection. The footer link opens the website only when selected and carries no puzzle data. That website has its own privacy practices. See the [architecture](docs/architecture.md) for the data inventory and save behavior.

## Dictionary and rights

The offline US-English dictionary is the verified 77,533-word derivative of the English Speller Database (ESDB) used by Spelling Bee Solver. Source and runtime builds include the [provenance record](data/provenance.json) and [third-party notices](licenses/NOTICE.md).

Dunedin Studio reserves its rights in the original application code and artwork. See [application rights](licenses/RIGHTS.md) and the separate dictionary notices.

## Release status and contact

Version 1.0.0 is the first technically verified Chrome and Edge store candidate. Both store submissions await owner authorization and publication of the dedicated privacy policy. See the [release notes](CHANGELOG.md), [owner release guide](OWNER_PHASE5_RELEASE_GUIDE.md) and [marketplace policy assessment](docs/marketplace-policy.md).

The GitHub repository stays private throughout development. Only the owner may decide whether and when it becomes public. Completing Phase 6 or receiving browser-store approval does not change repository visibility.

Website [spellingbeeanswers.app](https://spellingbeeanswers.app/) · [Contact Dunedin Studio](https://spellingbeeanswers.app/contact)

Powered By https://spellingbeeanswers.app/
