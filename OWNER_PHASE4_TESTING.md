# Phase 4 owner testing

Repeat these steps in desktop Chrome and Edge. Use a test browser profile if you want to start with a fresh installation.

1. From the Pangram Solver project, run `pnpm install --frozen-lockfile` and `pnpm run build`. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, turn on **Developer mode**, and use **Load unpacked** to select `dist/chromium`. If that folder is already loaded, use the extension card's **Reload**. Pin Pangram Solver from the extensions menu. This is an unpacked development installation.
2. Open the popup while a game tab is active. A fresh installation starts on **Full Answers**, with focus on the required center cell. Type `COA`, click the game tab, and reopen the popup. Confirm the three letters return in order.
3. Finish `COATING` with **C** in the center and **O/A/T/I/N/G** clockwise from the top. Confirm **7 found**. The alphabetical answers are coating, cogitating, cogitation, contacting, contagion, containing, and cottaging.
4. Select **Hints Only**. The first row should show `co•••••` and **7 letters**. Reveal it with the eye button. Switch to the game immediately, then reopen the popup. Confirm `coating` is visible, the other six answers remain masked, and progress says **1 of 7 revealed**. Reveal another word with Enter or Space.
5. Switch to **Full Answers**, close and reopen, and confirm the mode was saved. Return to **Hints Only** and confirm the individual reveal count. Close the entire browser using its menu and reopen the same profile. Confirm the letters, mode, and individual reveals return.
6. Press **Reset**. Verify the center is focused, there are zero entered letters, and the mode remains selected. Close and reopen the popup and restart the browser once more. Confirm no old letters or reveals return. Type a new letter immediately after Reset and confirm it is saved.
7. Try `AEINRST` with **A** in the center. Scroll the 42-result list, reveal a word near the bottom, and confirm the list stays near that row. Check that the single website link and separate attribution stay visible. Repeat basic solving while offline if available.

The source repository stays private. If a local commit still needs syncing, open the existing checkout in GitHub Desktop, select `main`, confirm the remote is `dunedinstudio/pangram-solver-extension`, and use **Push origin**.
