# FormFlow: Google Forms Autofill

Fill Google Forms from your saved answers, then see at a glance what still needs you.

FormFlow is a fork of [GoogleFormsAutoFiller](https://github.com/muratalperen/GoogleFormsAutoFiller) by Murat Serhat Alperen (MIT). It keeps the original fuzzy matching idea and adds the parts that were missing: every common question type, a review layer, and storage that does not lose your answers.

## What it does

- **Fills every common question type:** short answer, paragraph, date, multiple choice (including "Other"), checkboxes, dropdowns, time and linear scale.
- **Shows what needs you:** green outline = filled from a saved answer. Red outline = needs you (no saved answer, answer did not fit the options, grids, and every file upload).
- **Summary badge:** "14 filled, 7 need you, 1 file upload", with a button that jumps to the next red question.
- **Learn mode:** answer a red question by hand and FormFlow offers to save it. Edit a filled question and it offers to update the saved answer. Nothing is saved without your click.
- **Never overwrites you:** each question is filled once, so your edits stay.
- **Your answers stay safe:** stored in `chrome.storage.local` with automatic migration from the old sync storage. No 100 KB sync quota, no silent drops.
- **Bulk import:** load all your answers from a CSV file.
- **Private:** everything stays in your browser. No server, no account, no tracking. See [PRIVACY.md](PRIVACY.md).

## How it differs from the original

| | Original | FormFlow |
|---|---|---|
| Question types | text, paragraph, date | + radio, checkbox, dropdown, time, scale |
| Storage | `storage.sync` (quota limits, entries could vanish) | `storage.local` + safe migration + save-on-close flush |
| Matching | close spelling only | + word coverage, closest-length tie-break, option matching |
| Review | none | green/red outlines, badge, file-upload flag |
| New answers | type them into the popup | learn mode saves them from the form |
| Tests | none | unit tests and a Chromium end-to-end suite |

## Install

Chrome Web Store link: coming soon.

To run from source: open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick this folder.

## Use

1. Click the FormFlow icon, then **Choose File** and **Upload CSV** (two columns: question title, answer), or add entries by hand.
2. Open a Google Form. Fields fill themselves.
3. Review the red outlines, fill them, accept the "save this answer?" prompts you want, and submit.

## Tests

```
node test/core.test.js
npm i -D playwright && npx playwright install chromium
node test/e2e/run.js
```

## Roadmap

Considered and **not needed** for now: resume import, semantic (embedding) matching, multiple profiles, AI drafts for paragraph questions.

## Credits and license

MIT. Original work by Murat Serhat Alperen. Improvements by Shubh Bohra. See [LICENSE](LICENSE).
