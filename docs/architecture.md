# Pangram Solver architecture

## Runtime and build

The Chrome and Edge desktop targets share one Manifest V3 unpacked build. The toolbar action serves bundled HTML, CSS, and strict TypeScript compiled to native browser modules. Node and pinned pnpm build `dist/chromium` from an explicit file list. The runtime has zero dependencies. Phase 5 will check the two browsers and produce store-specific release archives from verified runtime files.

| Directory | Responsibility |
| --- | --- |
| `public/`, `src/` | Popup markup and styles, browser entry point, and future solver and state modules |
| `data/`, `licenses/` | Dictionary provenance and upstream notices |
| `assets/` | Approved artwork sources and runtime exports |
| `scripts/`, `tests/` | Reproducible builds and Node-based checks |

The scaffold requests zero permissions and uses a restrictive extension-page CSP. Allow only packaged scripts and styles. Phase 2 can include the dictionary in a generated local module to keep runtime network connections disabled. Phase 3 can allow same-origin packaged images. Phase 4 adds only `storage` for puzzle state. Render words and feedback as DOM text. Product scope excludes service integrations, host access, content scripts, browsing history, tracking, remote code, accounts, ads, and cloud sync.

## Pangram engine plan

Validate positional input as seven single ASCII A–Z letters, with cell 0 as the required center and no case-insensitive duplicates. Distinguish partial, invalid, and complete input. Normalize dictionary entries to lower-case ASCII and retain the four-character rule. A 26-bit letter mask represents the distinct letters. Exact equality between the puzzle mask and a candidate mask proves all seven letters, center inclusion, and absence of outside letters. Repeated characters leave the mask unchanged.

In Phase 2 use the [pinned derived list](../data/provenance.json). Import it from the published source at the recorded commit, verify SHA-256, count, encoding, uniqueness, and ordering, then emit packaged data in a deterministic build step. The verified regeneration path from the original regional release is to check the manifest and JSON digests, align words with regional masks, select US bit 1 and length ≥ 4, and write in original ASCII order with LF and a final newline. Retain all notices with source and runtime copies. Keep the build independent of the original repository and website once the verified artifact is vendored. The upstream ESDB archive alone needs the original extraction policy, overlays, and reviewed exceptions to reproduce this derivative.

Choose the smallest measured implementation. A sorted dictionary with a compact mask array supports exact matching. An index from seven-letter masks to ordered buckets is an option if measurements justify it. Produce one stable list of pangrams for both display modes. Game lists differ, so identify results as dictionary candidates. Reading files from the game page or fetching puzzle answers is outside scope.

## Popup and branding

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
| 1 | Frozen install, strict typecheck, repeatable build, runtime file allowlist, permission and CSP inventory, notice hashes, ignore rules, audited Git tree/history, anonymous GitHub visibility and README if published |
| 2 | Mandatory center and seven distinct cells, incomplete/invalid/Unicode cases, repeat letters, outside-letter and missing-letter exclusions, exact counts, ordering, checksum and notice retention. Compare many puzzles with an independent set-based full-corpus oracle and measure startup and lookup |
| 3 | Approved mockup and geometry, labels and keyboard focus, popup sizing/overflow, original artwork and icon readability, exact CTA text/link/attribution, scrollable results, empty/partial states |
| 4 | Partial and complete puzzles, popup close immediately after input or reveal, browser restart, mode, individual reveals and progress, corruption and future schema, rejected storage calls, multiple popups, rapid edit/reset/reopen with delayed writes, offline operation |
| 5 | Unpacked and release package in actual Chrome and Edge, functional and accessibility QA, performance, permission and privacy audit, license inclusion, authentic screenshots and listing claims |
| 6 | Store submission and review feedback, then independently verify public install links and update the README |
