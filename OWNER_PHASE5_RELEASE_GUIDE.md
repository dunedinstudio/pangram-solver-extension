# Phase 5 owner release guide

## Match the version and checksums

Use Pangram Solver **1.0.0**. Upload the ZIP assigned to each store. Both contain the same verified Manifest V3 runtime and each has 22 files. Check the hash before uploading.

| Store | Archive | Bytes |
| --- | --- | ---: |
| Chrome Web Store | `release/pangram-solver-chrome.zip` | 284,207 |
| Microsoft Edge Add-ons | `release/pangram-solver-edge.zip` | 284,207 |

Both have SHA-256 `5e3b2246e10ab3ef9ef1008c850a64154661e09b861a9863e886aae8cc21ee28`. Compare `Get-FileHash -Algorithm SHA256 -Path release/pangram-solver-*.zip` with `release/SHA256SUMS.txt` and `release/PACKAGE_INVENTORY.json`. These release artifacts are kept locally. Preserve the verified files together when copying them for submission.

## Review the listing materials

| Store | Copy to use | Artwork |
| --- | --- | --- |
| Chrome | [Chrome listing](store-submission/chrome/LISTING.md) | `release/store-assets/chrome/` |
| Edge | [Edge listing](store-submission/edge/LISTING.md) | `release/store-assets/edge/` |

Each folder includes the numbered five-screenshot sequence, small promo, marquee, and store icon or logo. The [reviewer test steps](store-submission/reviewer-notes/REVIEWER_TESTING.md) cover the exact packaged build and explain how the product differs from Spelling Bee Solver. See `release/store-assets/ASSET_INVENTORY.json` for file sizes, source captures and hashes.

Review the [privacy declarations](store-submission/PRIVACY_DECLARATIONS.md) for each store. Use the creator website and established support destination. Both loaded in a signed-out browser check during Phase 5. [Website](https://spellingbeeanswers.app/) · [Support](https://spellingbeeanswers.app/contact)

Publish the [dedicated policy draft](store-submission/privacy/PANGRAM_SOLVER_PRIVACY_POLICY.md) and use its actual verified public URL in both stores. The [publication checklist](store-submission/privacy/PUBLICATION_CHECKLIST.md) lists the checks and proposed path.

## Try the actual release package

1. In a clean Chrome profile, extract the Chrome ZIP to its own folder. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the folder with `manifest.json`. Pin Pangram Solver through the extensions menu. Repeat with the Edge ZIP and `edge://extensions` in a clean Edge profile.
2. Open the actual toolbar popup and check **Hints Only** is selected on the right. Follow the [reviewer test steps](store-submission/reviewer-notes/REVIEWER_TESTING.md) for the seven-result puzzle, single reveal, reopening, browser restart, Full Answers, and Reset.
3. Verify the footer link opens exactly `https://spellingbeeanswers.app/`. Check **Powered By spellingbeeanswers.app** is plain text. Disconnect from the internet and confirm the puzzle still solves.
4. Try the popup at 100% and 125% Windows scaling. Tab to both modes, reveal a hint with the keyboard, and verify the results panel scrolls and the footer stays visible.
5. For a longer check, enter `A` in the center and then `E I N R S T` clockwise from the top. Expect **42 found**. For zero results, use `Q` and `X Z J K V B`. Expect **0 found**.

## Owner decisions

Review the version, both ZIP hashes, listings and artwork. Confirm Dunedin Studio’s publisher and contact details. Review the [moderate duplicate-extension risk](docs/marketplace-policy.md) and accept the residual review risk before authorizing Phase 6. Final publisher attestations are made in the live dashboards. Keep the GitHub repository private.

## Rebuild if updating the candidate

On Windows with Node.js 24.14 or later, pnpm 11.25.0 and PowerShell 7, run:

~~~powershell
pnpm install --frozen-lockfile
pnpm run release:pack
pnpm run release:verify
~~~

The pack command typechecks, runs the Node tests from a rebuilt runtime, and archives only the allowlisted files with fixed ZIP metadata. A future change requires fresh package verification and native QA. With `PANGRAM_PLAYWRIGHT` set to an existing Playwright Core installation, run `node scripts/verify-browser.mjs chrome --release` and `node scripts/verify-browser.mjs edge --release`. Repeat with `--scaled`. The matched native evidence is under `private/phase5/`. Run `pwsh -NoProfile -File scripts/build-store-art.ps1 -MascotMaster <approved-master-path>` to compose replacement artwork from the verified captures and approved master. The prepared assets in `release/store-assets/` are ready for owner review.
