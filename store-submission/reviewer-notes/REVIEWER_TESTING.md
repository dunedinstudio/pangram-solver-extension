# Reviewer notes

**Pangram Solver 1.0.0 | Dunedin Studio**

Pangram Solver is a standalone, offline pangram hint tool for seven-letter Spelling Bee puzzles. Our related extension, Spelling Bee Solver, shows general dictionary matches and identifies pangrams in that list. Both search related dictionary data. Pangram Solver instead opens in a spoiler-controlled pangram workflow with two-letter hints, individual reveals, progress, and resume. Its Full Answers view displays dictionary pangrams and overlaps with the pangram results available in the related product.

1. Pin Pangram Solver and open its toolbar popup in a fresh profile. Hints Only is selected. Enter `C` as the center, then `O A T I N G` clockwise from the top. Expect **7 found**, seven masked hints with lengths, and **0 of 7 revealed**.
2. Use the first eye button. Expect **coating**, six masked entries, and **1 of 7 revealed**. Return to the tab and reopen the popup. The letters, mode, and same reveal are restored. Restart the browser and check again.
3. Select Full Answers. Expect `coating`, `cogitating`, `cogitation`, `contacting`, `contagion`, `containing`, `cottaging`. Switch back to Hints Only to see **1 of 7 revealed** again.
4. Reset and reopen. Expect empty cells and retained mode. Solving and resuming work offline without an account. The only permission is `storage`. The optional footer link opens [the creator homepage](https://spellingbeeanswers.app/) in a new tab without puzzle data.

The extension does not read the tab or submit answers to a game. The listed words are independent dictionary candidates.
