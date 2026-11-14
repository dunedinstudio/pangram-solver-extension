# Pangram Solver architecture

## Runtime and build

The Chrome and Edge desktop targets share one Manifest V3 unpacked build. The toolbar action serves bundled HTML, CSS, and strict TypeScript compiled to native browser modules. Node and pinned pnpm build `dist/chromium` from an explicit file list. The runtime has zero dependencies. Phase 5 will check the two browsers and produce store-specific release archives from verified runtime files.

| Directory | Responsibility |
| --- | --- |
| `public/`, `src/` | Development popup, browser entry point, and independent pangram engine |
| `data/`, `licenses/` | Dictionary source, provenance, and upstream notices |
| `assets/` | Approved artwork sources and runtime exports |
| `scripts/`, `tests/` | Reproducible builds and Node-based checks |

The development build requests zero permissions. Its restrictive extension-page CSP allows packaged scripts, styles, and images. The dictionary is a generated local module, so solving requires no network connections. Phase 4 adds only `storage` for puzzle state. Words and feedback use DOM text. Product scope excludes service integrations, host access, content scripts, browsing history, tracking, remote code, accounts, ads, and cloud sync.

## Pangram engine

`loadDictionary()` in `dictionary.js` returns a cached promise with `{ status: 'ready', solve }` or `{ status: 'unavailable' }` if the packaged module is missing or malformed. Each call to `solve({ center, outer })` expects one center cell and exactly six outer cells. Use empty strings for blank cells. A structurally valid partial puzzle yields `incomplete`. Missing or extra cells, unsupported characters or types, and case-insensitive duplicates yield `invalid` with a reason. Case folding follows validation of single ASCII letters.

The build reads `data/words.txt`, verifies its byte count and SHA-256, and encodes its complete contents as a local ES module. To reproduce the source import, copy the `data/words.txt` blob at the pinned Spelling Bee Solver commit and verify it against [provenance](../data/provenance.json). The original regional derivation selected the US bit and words of length ≥ 4 in ASCII order, with one word per LF-delimited line and a final LF. Recreating that regional dataset from upstream ESDB also requires its extraction policy, overlays, and reviewed exceptions. The vendored derivative and notices are the inputs for every clean build.

During preparation, the engine validates the sorted lowercase ASCII list and indexes words with exactly seven distinct letters by their 26-bit mask. Preparation is linear in the corpus size. The index holds the eligible words and one bucket per populated letter set. A solve validates seven cells and performs one map lookup without parsing or copying the dictionary. Exact mask equality requires the center and all outer letters and excludes outside letters. Repeated characters leave the mask unchanged.

A complete puzzle returns `{ status: 'solved', count, pangrams }`, with an empty list when no words qualify. Each read-only entry has a lowercase `word` and its `length`. Buckets preserve the dictionary's ASCII alphabetical order. The same results support the Phase 3 display and the Phase 4 hint view. The word itself is a stable reveal ID when a puzzle is restored. The solver uses no browser storage. These are dictionary candidates, and accepted words vary by game.

## Popup and branding

The Phase 3 action popup keeps the current puzzle in `popup.ts`. `honeycomb.ts` translates input events into candidate edits. The controller validates those edits with the Phase 2 contract and sends display states to `results.ts`. The results header can accommodate a future mode switch, and the rows separate word and length for a future reveal control. Phase 3 displays Full Answers and resets only the open popup. Phase 4 will connect hints and stored state through the controller.

Use a compact cream, white, and honey-yellow toolbar popup with a smiling honeybee, a centered **Pangram Solver** heading, and the subtitle **Enter 7 letters to find pangrams instantly.** Follow the approved concept image once supplied. The geometry is one yellow center cell and six surrounding cells. Use accessible positional labels, a visible focus indicator, natural Tab order, arrow movement that matches the layout, and straightforward edit, clear, and paste behavior.

Solve automatically on the seventh valid letter. Distinguish partial input, duplicate-letter errors, and a completed puzzle with zero results. Show the count and alphabetical list with word lengths in a scrollable region. Full Answers is the default. In Hints Only show the first two letters, hide the suffix, and show length with an accessible eye button for each concealed entry. Hidden suffixes stay out of the accessible name and DOM until revealed. Track the count revealed out of the current result count. Include a compact Reset and a short note that accepted-word lists vary.

The exact footer sentence is **Need more Spelling Bee solving tools? Visit our FREE solver!** Render the lead-in as ordinary text. Make only **Visit our FREE solver!** an anchor to `https://spellingbeeanswers.app/` with `target="_blank"` and `rel="noopener noreferrer"`. The action is an explicit click or keyboard activation. Use the fixed URL without puzzle data or referral parameters. On a separate line, render **Powered By spellingbeeanswers.app** as plain, deep-black, non-clickable text. See [artwork requirements](../assets/README.md).

## Browser-local state and privacy

Phase 4 will use one versioned record at `pangramSolver.activePuzzle` in `chrome.storage.local`. A dedicated extension service worker owns storage mutations and registers its message handlers synchronously on startup. The popup owns rendering and local solving. It sends an intent on each accepted edit, mode change, reveal, or reset. The worker does not load the dictionary or use the network. [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)

| Local field | Purpose |
| --- | --- |
| `schemaVersion` | Decode and migrate a known record shape |
| `revision` | Persisted opaque mutation ID used to reject stale changes across popup instances and worker restarts |
| `cells` | Seven positional uppercase ASCII letters or empty strings. Includes partial puzzles |
| `mode` | `full` or `hints`. Defaults to `full` and remains a preference when Reset clears a puzzle |
| `revealedWords` | Deduplicated lowercase word IDs for the current complete puzzle only. Empty for partial or reset state |

A canonical puzzle identity is derived from the center and sorted outer letters. Preserve reveal IDs when only outer positions are reordered in a single update with the same identity. Clear them when a valid puzzle changes identity or becomes partial. For a reopened popup, regenerate results and intersect reveal IDs with current results before showing progress. A dictionary update can drop obsolete IDs. Persist neither generated result lists nor puzzle history.

Open by requesting the latest record through the worker. Serialize reads and mutations in receipt order and validate sender, message, payload, and expected revision before writing. Send each mutation immediately through the browser-owned message channel. Each carries its predecessor's revision and a new unique ID so rapid actions can follow a chain without waiting for acknowledgments. The worker only commits when the predecessor matches the current revision. Independent popups generate different IDs even when they start from the same saved state. Do not depend on popup unload, a popup-owned write timer, or an acknowledgment handler to initiate persistence.

Reset is a mutation that commits empty cells and reveals with a new revision. Earlier accepted writes finish before Reset. A delayed write that expects an older revision or an uncommitted predecessor is rejected. Keep the cleared record so the barrier survives restart. A repeated message matching the current revision is acknowledged without writing again. A stale retry receives a conflict and the current record. On conflict, reconcile the visible state and surface failed actions, including a Reset that could not commit. Retrying Reset uses a fresh revision after reconciliation. Keep a working in-memory popup on storage failure and show a concise notice when progress cannot be saved.

Validate saved cell count, character set, duplicates, mode, revision and reveal IDs. Start safely on corrupt state. An unrecognized newer schema opens an in-memory session with a persistence notice and preserves its record. Perform known migrations inside the same worker queue. Test popup teardown during in-flight edits and Reset on both browsers because the durability contract applies to worker-received mutations and depends on browser behavior. Respect profile removal, extension uninstall, and browser storage clearing. No retention timer is needed for the single active record.

The extension will store data in the browser profile for its owner and send no puzzle or reveal data externally. The website CTA performs a normal HTTPS navigation via the browser and the website handles that visit under its own privacy practices. Phase 5 will document user controls and reconcile both store declarations with the shipped build.

## Verification plan

| Phase | Checks |
| --- | --- |
| 1 | Frozen install, strict typecheck, repeatable build, runtime file allowlist, permission and CSP inventory, notice hashes, ignore rules, audited Git tree and history, and authenticated verification of private GitHub visibility, branch, README, file inventory and commit |
| 2 | Mandatory center and seven distinct cells, incomplete/invalid/Unicode cases, repeat letters, outside-letter and missing-letter exclusions, exact counts, ordering, checksum and notice retention. Compare many puzzles with an independent set-based full-corpus oracle and measure startup and lookup |
| 3 | Approved mockup and geometry, labels and keyboard focus, popup sizing/overflow, original artwork and icon readability, exact CTA text/link/attribution, scrollable results, empty/partial states |
| 4 | Partial and complete puzzles, popup close immediately after input or reveal, browser restart, mode, individual reveals and progress, corruption and future schema, rejected storage calls, multiple popups, rapid edit/reset/reopen with delayed writes, offline operation |
| 5 | Unpacked and release package in actual Chrome and Edge, functional and accessibility QA, performance, permission and privacy audit, license inclusion, authentic screenshots and listing claims |
| 6 | Store submission and review feedback, then independently verify public install links and update the README |
