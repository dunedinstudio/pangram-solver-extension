# Marketplace policy assessment

Reviewed 14 November 2026 for the planned Chrome and Edge desktop extension.

| Topic | Chrome Web Store | Microsoft Edge Add-ons |
| --- | --- | --- |
| Distinct value and repetition | Spam and Abuse prohibits multiple submissions by a developer or related parties that duplicate an experience or functionality. [Spam and Abuse](https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse) | The principles require unique and distinct value. Sections 1.1 and 1.2 cover accurate representation, similar names or icons, and bulk submissions with the same functionality and code. [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Purpose and accurate listing | The purpose must be narrow and understandable. Product, dashboard declarations, and listing metadata must accurately represent the shipped experience. [Quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines) · [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies) | Sections 1.1.1–1.1.5 require one narrow purpose, accurate descriptions of capabilities and limitations, clear screenshots, and functional links. Edge metadata should focus on Edge. [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Permissions and remote code | Request only the access necessary for shipped features. Manifest V3 logic must be reviewable and bundled with the extension. [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies) · [Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) | Sections 1.1.7, 1.2 and 1.6 cover reviewable code, CSP, essential permissions, and clear purpose. [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Privacy and intellectual property | Disclose actual data handling. Provide an accurate public privacy policy if the product handles user data, and avoid false affiliation and IP infringement. [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies) | Sections 1.5 and 2.2 address disclosure, privacy controls, and rights in names, logos, and content. [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |

| Experience | Spelling Bee Solver | Pangram Solver 1.0.0 |
| --- | --- | --- |
| Primary goal | Find general dictionary matches for the seven letters | Discover and reveal pangrams at the player's pace |
| Main results | Complete matches with pangram badges. The golden puzzle yields 83 matches, including seven pangrams | Pangrams only. The same puzzle yields seven dictionary candidates |
| Default result view | Complete visible words | Hints Only shows two letters and the full word length |
| Individual reveals | Complete result words are visible immediately | Eye buttons reveal individual pangrams |
| Reveal progress | No reveal counter | Current puzzle's reveal count |
| Saved state | Restores the positional puzzle letters | Restores letters, display mode and exact individual reveals across restart |
| Interaction | Fill the seven cells, inspect the general word list, then Reset | Fill the honeycomb, reveal selectively, resume later, or switch to Full Answers |
| Visual experience | Related bee branding, honeycomb entry and pangram badges | Cocoa hexagon icon, hint controls, lengths and progress in a compact pangram-only popup |
| Typical journey | Consult a broad set of playable dictionary candidates | Get a clue, try solving in the game, and reopen with other answers still covered |

**MODERATE RISK** in both stores. The default masked workflow, selective reveal and durable spoiler state give players a separate reason to install Pangram Solver. The input pattern, dictionary, publisher and brand family overlap. Full Answers lists the same pangrams available as badges in the broader solver. Edge may also consider the related bee icons when reviewing similarity. Either store can reject the separate listing. The owner must approve this residual risk before submission. The [reviewer notes](../store-submission/reviewer-notes/REVIEWER_TESTING.md) disclose the existing product and demonstrate the distinct workflow. [Original extension at reviewed commit](https://github.com/dunedinstudio/spelling-bee-solver-extension/tree/fbde03d87244d31d0d9d48cb354e1e4efb044b48)
