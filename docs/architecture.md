# Pangram Solver architecture

## Runtime and build

The Chrome and Edge desktop targets share one Manifest V3 unpacked build. The toolbar action serves bundled HTML, CSS, and strict TypeScript compiled to native browser modules. Node and pinned pnpm build `dist/chromium` from an explicit file list. The runtime has zero dependencies. Phase 5 will check the two browsers and produce store-specific release archives from verified runtime files.

| Directory | Responsibility |
| --- | --- |
| `public/`, `src/` | Development popup, browser entry point, and independent pangram engine |
| `data/`, `licenses/` | Dictionary source, provenance, and upstream notices |
| `assets/` | Approved artwork sources and runtime exports |
| `scripts/`, `tests/` | Reproducible builds and Node-based checks |

The development build requests only `storage` for puzzle state. Its restrictive extension-page CSP allows packaged scripts, styles, and images. The dictionary is a generated local module, so solving requires no network connections. Words and feedback use DOM text. Product scope excludes service integrations, host access, content scripts, browsing history, tracking, remote code, accounts, ads, and cloud sync.

## Pangram engine

`loadDictionary()` in `dictionary.js` returns a cached promise with `{ status: 'ready', solve }` or `{ status: 'unavailable' }` if the packaged module is missing or malformed. Each call to `solve({ center, outer })` expects one center cell and exactly six outer cells. Use empty strings for blank cells. A structurally valid partial puzzle yields `incomplete`. Missing or extra cells, unsupported characters or types, and case-insensitive duplicates yield `invalid` with a reason. Case folding follows validation of single ASCII letters.

The build reads `data/words.txt`, verifies its byte count and SHA-256, and encodes its complete contents as a local ES module. To reproduce the source import, copy the `data/words.txt` blob at the pinned Spelling Bee Solver commit and verify it against [provenance](../data/provenance.json). The original regional derivation selected the US bit and words of length ≥ 4 in ASCII order, with one word per LF-delimited line and a final LF. Recreating that regional dataset from upstream ESDB also requires its extraction policy, overlays, and reviewed exceptions. The vendored derivative and notices are the inputs for every clean build.

During preparation, the engine validates the sorted lowercase ASCII list and indexes words with exactly seven distinct letters by their 26-bit mask. Preparation is linear in the corpus size. The index holds the eligible words and one bucket per populated letter set. A solve validates seven cells and performs one map lookup without parsing or copying the dictionary. Exact mask equality requires the center and all outer letters and excludes outside letters. Repeated characters leave the mask unchanged.

A complete puzzle returns `{ status: 'solved', count, pangrams }`, with an empty list when no words qualify. Each read-only entry has a lowercase `word` and its `length`. Buckets preserve the dictionary's ASCII alphabetical order. The same results support the Phase 3 display and the Phase 4 hint view. The word itself is a stable reveal ID when a puzzle is restored. The solver uses no browser storage. These are dictionary candidates, and accepted words vary by game.

## Popup and branding

The action popup controller in `popup.ts` validates candidate edits from `honeycomb.ts`, manages its in-memory state, and submits accepted snapshots. `results.ts` renders the current display mode and removes a reveal button after activation. It updates existing rows in place, focuses the revealed row, and preserves the list scroll position. Concealed rows put only the prefix, bullets, and length in the DOM and accessibility labels.

Use a compact cream, white, and honey-yellow toolbar popup with a smiling honeybee, a centered **Pangram Solver** heading, and the subtitle **Enter 7 letters to find pangrams instantly.** Follow the approved concept image once supplied. The geometry is one yellow center cell and six surrounding cells. Use accessible positional labels, a visible focus indicator, natural Tab order, arrow movement that matches the layout, and straightforward edit, clear, and paste behavior.

Solve automatically on the seventh valid letter. Distinguish partial input, duplicate-letter errors, and a completed puzzle with zero results. Show the count and alphabetical list with word lengths in a scrollable region. Full Answers is the default. In Hints Only show the first two letters, hide the suffix, and show length with an accessible eye button for each concealed entry. Hidden suffixes stay out of the accessible name and DOM until revealed. Track the count revealed out of the current result count. Include a compact Reset and a short note that accepted-word lists vary.

The exact footer sentence is **Need more Spelling Bee solving tools? Visit our FREE solver!** Render the lead-in as ordinary text. Make only **Visit our FREE solver!** an anchor to `https://spellingbeeanswers.app/` with `target="_blank"` and `rel="noopener noreferrer"`. The action is an explicit click or keyboard activation. Use the fixed URL without puzzle data or referral parameters. On a separate line, render **Powered By spellingbeeanswers.app** as plain, deep-black, non-clickable text. See [artwork requirements](../assets/README.md).

## Browser-local state and privacy

The extension keeps one versioned record at `pangramSolver.activePuzzle` in `chrome.storage.local`. The service worker registers its listener synchronously and accepts messages from its own popup URL. It imports the lightweight input validator via the schema module. Dictionary indexing and solving stay in the popup. [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)

| Local field | Purpose |
| --- | --- |
| `schemaVersion` | Decode and migrate a known record shape |
| `revision` | Popup writer UUID and increasing sequence, persisted together |
| `cells` | Seven positional uppercase ASCII letters or empty strings. Includes partial puzzles |
| `mode` | `full` or `hints`. Defaults to `full` and remains a preference when Reset clears a puzzle |
| `revealedWords` | Deduplicated lowercase word IDs for the current complete puzzle only. Empty for partial or reset state |

A canonical puzzle identity is derived from the center and sorted outer letters. Preserve reveal IDs when only outer positions are reordered in a single update with the same identity. Clear them when a valid puzzle changes identity or becomes partial. For a reopened popup, regenerate results and intersect reveal IDs with current results before showing progress. A dictionary update can drop obsolete IDs. Persist neither generated result lists nor puzzle history.

The popup sends `pangram:read` on startup and blocks edits until restoration finishes. Its dictionary loads concurrently. On every accepted edit, mode change, reveal, or Reset, the popup sends `pangram:save` with the full small state snapshot, its writer sequence, and the revision observed on startup. There is no unload hook, debounce, or wait for a prior save acknowledgement. The worker serializes reads and writes and rereads storage for each operation.

A writer can take over when its startup revision equals the durable revision. After takeover, only a higher sequence from that writer can advance the stored state. An identical revision is acknowledged without writing again and a lower sequence is superseded. A newer same-writer snapshot includes earlier local changes, so an out-of-order arrival or failed earlier write does not force later valid snapshots to wait for missing predecessors. Across writers, the startup revision check prevents stale overwrites. A conflict triggers an authoritative read and a visible warning. Another attempt uses a fresh writer identity.

Reset commits empty cells and reveals with a new revision, retains the display preference, and leaves a durable barrier in storage. The queue prevents an in-flight older write from finishing after a newer write. A worker-delivered mutation remains eligible to finish after its popup closes. A successful storage write is the durability boundary. Browser shutdown before delivery or during a failed write can lose that interaction, and a failed Reset can leave the previous record in place.

The decoder checks the schema, normalized cells, distinctness, mode, revision and bounded reveal IDs. A corrupt record starts a fresh puzzle and is replaced on a successful edit. An unknown future schema stays intact and opens an in-memory session. A read failure also opens an in-memory session, and a write failure displays a warning while solving remains available. Phase 4 introduces the first schema. The extension keeps one record until replacement, uninstallation, profile removal, or storage clearing.

The extension keeps data in the browser profile and sends no puzzle or reveal data externally. The website CTA performs a separate user-initiated HTTPS navigation under the website's privacy practices. Phase 5 will document user controls and reconcile both store declarations with the shipped build.

## Verification plan

| Phase | Checks |
| --- | --- |
| 1 | Frozen install, strict typecheck, repeatable build, runtime file allowlist, permission and CSP inventory, notice hashes, ignore rules, audited Git tree and history, and authenticated verification of private GitHub visibility, branch, README, file inventory and commit |
| 2 | Mandatory center and seven distinct cells, incomplete/invalid/Unicode cases, repeat letters, outside-letter and missing-letter exclusions, exact counts, ordering, checksum and notice retention. Compare many puzzles with an independent set-based full-corpus oracle and measure startup and lookup |
| 3 | Approved mockup and geometry, labels and keyboard focus, popup sizing/overflow, original artwork and icon readability, exact CTA text/link/attribution, scrollable results, empty/partial states |
| 4 | Partial and complete puzzles, popup close immediately after input or reveal, browser restart, mode, individual reveals and progress, corruption and future schema, rejected storage calls, multiple popups, rapid edit/reset/reopen with delayed writes, offline operation |
| 5 | Unpacked and release package in actual Chrome and Edge, functional and accessibility QA, performance, permission and privacy audit, license inclusion, authentic screenshots and listing claims |
| 6 | Store submission and review feedback, then independently verify public install links and update the README |
