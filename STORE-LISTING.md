# Chrome Web Store listing (copy these into the dashboard)

## Name
FormFlow: Google Forms Autofill

## Summary (max 132 chars)
Autofill Google Forms from your saved answers. Green means filled, red means needs you. Learns new answers as you go.

## Category
Productivity

## Detailed description
Stop retyping your name, email, college, CGPA and links into every Google Form.

FormFlow fills Google Forms from answers you save once, then shows you exactly what still needs your attention.

WHAT IT FILLS
- Short answer, paragraph and date questions
- Multiple choice (including "Other"), checkboxes and dropdowns
- Time and linear scale questions

REVIEW AT A GLANCE
- Green outline: filled from a saved answer
- Red outline: needs you (no saved answer, answer did not fit the options, grids, and every file upload)
- A small badge counts what is filled and what needs you, with a button that jumps to the next red question

LEARNS AS YOU GO
Answer a red question yourself and FormFlow offers to save it for next time. Change a filled answer and it offers to update it. Nothing is saved without your click.

SAFE BY DESIGN
- Fills each question once, so your edits are never overwritten
- Never submits the form for you
- All data stays in your browser. No account, no server, no tracking
- Import all your answers from a CSV file in seconds

Open source (MIT), based on GoogleFormsAutoFiller by Murat Serhat Alperen.

## Single purpose
Autofill Google Forms questions from answers the user saves in the extension.

## Permission justifications
- storage: saves the user's question and answer pairs and settings locally.
- activeTab: lets the popup send a "refill" message to the form tab the user has open.
- Host permission docs.google.com: runs the content script on Google Forms pages to read questions and fill answers.
- Remote code: none. No data is collected or transmitted.

## Privacy policy URL
https://github.com/kodebyshubh/GoogleFormsAutoFiller/blob/v1-features/PRIVACY.md
(after merging to master, change v1-features to master)

## Data usage disclosures
Collects no user data. Tick none of the data-collection boxes. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.
