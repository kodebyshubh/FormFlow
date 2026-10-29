// import { Handlers } from './Handlers.js';
const Handlers = {
    text: {
        selector: "input[type='text'], input[type='email'], input[type='number'], input[type='tel'], input[type='url']",
        fill: (element, answer) => {
            element.value = answer;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },
    textarea: {
        selector: "textarea",
        fill: (element, answer) => {
            element.value = answer;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },
    date: {
        selector: "input[type='date']",
        fill: (element, answer, ctx) => {
            // Convert the incoming answer to YYYY-MM-DD using the configured
            // locale (DMY/MDY/AUTO). Unparseable input is passed through and
            // left for the browser to validate/reject.
            element.value = toISO(answer, ctx && ctx.dateFormat);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },
};

/**
* Convert a date answer to YYYY-MM-DD according to the configured locale.
* Pure function (no side effects) so it stays unit-testable.
*
* @param {string} answer Raw date string from stored form data
* @param {string} fmt    "DMY" | "MDY" | "AUTO" (defaults to "DMY")
* @returns {string}      YYYY-MM-DD on a recognised input, else the input unchanged
*/
function toISO(answer, fmt) {
    if (typeof answer !== "string") return answer;

    // Already ISO (YYYY-MM-DD): return as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(answer)) return answer;

    const match = answer.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!match) return answer;

    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    const year = match[3];

    let day;
    let month;

    if (fmt === "MDY") {
        month = p1;
        day = p2;
    } else if (fmt === "AUTO") {
        if (p1 > 12) {
            // First component can't be a month -> DMY.
            day = p1;
            month = p2;
        } else if (p2 > 12) {
            // Second component can't be a month -> MDY.
            month = p1;
            day = p2;
        } else {
            // Ambiguous: documented tie-break is DMY.
            day = p1;
            month = p2;
        }
    } else {
        // Default + explicit "DMY".
        day = p1;
        month = p2;
    }

    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}


// import { GetBestMatch } from './LevenshteinSimilarity.js';
const threshold = 79; // TODO: Not calculated best treshold.

/**
* Find best match for the title over the threshold
* TODO: make formData to more generic data type
*/
function findBestMatch(title, formData) {
    let bestMatch = null;
    let bestScore = 0;

    const t = title.trim().toLowerCase();
    for (const key in formData) {
        const k = key.trim().toLowerCase();
        const score = CalculateSimilarity(t, k);
        if (score <= threshold) continue;
        // On equal scores prefer the key closest in length to the title, so
        // "Email ID" picks a saved "Email ID" over "College Email id".
        const better = score > bestScore ||
            (score === bestScore && Math.abs(k.length - t.length) < Math.abs(bestMatch.trim().length - t.length));
        if (better) {
            bestScore = score;
            bestMatch = key;
        }
    }

    return bestMatch;
}

/**
* Calculate similarity percent.
*
* Returns the better of two scores so verbose form titles still match short
* saved keys without dropping the threshold:
*   - whole-string: normalized Levenshtein over the full strings. Handles
*     punctuation-level differences ("e-mail" vs "email").
*   - token-coverage: when one side is a multi-word phrase ("Email Address"),
*     match it against a shorter key ("Email") if every token of the shorter
*     side clears the threshold against some token of the longer side.
* Whitespace-only tokenization keeps "e-mail" a single token, so the
* whole-string path still owns the punctuation case.
*/
function CalculateSimilarity(a, b) {
    return Math.max(wholeStringSimilarity(a, b), tokenCoverageSimilarity(a, b));
}

/**
* Normalized Levenshtein similarity over the full strings.
*/
function wholeStringSimilarity(a, b) {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 100; // two empty strings are identical
    const distance = levenshteinDistance(a, b);
    return (1 - distance / maxLength) * 100;
}

/**
* Coverage of the shorter token list by the longer one. Every token on the
* shorter side must have a whole-string match above `threshold` among the
* longer side's tokens; the score is the mean of those best per-token matches.
* Returns 0 if any token is uncovered (so it never lowers the final max).
*/
function tokenCoverageSimilarity(a, b) {
    const ta = a.split(/\s+/).filter(Boolean);
    const tb = b.split(/\s+/).filter(Boolean);
    if (ta.length === 0 || tb.length === 0) return 0;

    const [few, many] = ta.length <= tb.length ? [ta, tb] : [tb, ta];

    let total = 0;
    for (const token of few) {
        let best = 0;
        for (const candidate of many) {
            const score = wholeStringSimilarity(token, candidate);
            if (score > best) best = score;
        }
        if (best <= threshold) return 0; // an uncovered token -> no coverage match
        total += best;
    }
    return total / few.length;
}


/**
* Find levenshtein Distance of two string
* TODO: Might optimizing or caching needed. O(n * m)
*/
function levenshteinDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
            }
        }
    }

    return dp[a.length][b.length];
}

const GetBestMatch = findBestMatch;


// ===================== Choice-question helpers (pure, unit-tested) =====================

/** Lowercase, collapse whitespace, trim. */
function normalizeLabel(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Question heading text without the trailing required-asterisk. */
function cleanTitle(t) {
    return String(t == null ? "" : t).replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim();
}

const OPTION_THRESHOLD = 80;

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `needle` (>= 3 chars) occurs in `hay` as a whole word/phrase. */
function containsWord(hay, needle) {
    if (!hay || !needle || needle.length < 3) return false;
    return new RegExp("(^|[^\\p{L}\\p{N}])" + escapeRegExp(needle) + "([^\\p{L}\\p{N}]|$)", "u").test(hay);
}

/**
* Pick the option whose label best matches a saved answer.
* Order: exact -> close spelling (Levenshtein) -> whole-word containment, the
* last only when exactly one option qualifies. Returns an index or -1.
*/
function matchOption(answer, labels, allowContainment = true) {
    const a = normalizeLabel(answer);
    if (!a) return -1;
    const norm = labels.map(normalizeLabel);

    const exact = norm.indexOf(a);
    if (exact !== -1) return exact;

    let best = -1;
    let bestScore = 0;
    norm.forEach((l, i) => {
        if (!l) return;
        const s = wholeStringSimilarity(a, l);
        if (s >= OPTION_THRESHOLD && s > bestScore) { best = i; bestScore = s; }
    });
    if (best !== -1) return best;

    if (!allowContainment) return -1;
    const hits = [];
    norm.forEach((l, i) => {
        if (l && (containsWord(l, a) || containsWord(a, l))) hits.push(i);
    });
    return hits.length === 1 ? hits[0] : -1;
}

/** "Python, Java; C++" -> ["Python", "Java", "C++"] */
function splitMultiAnswer(answer) {
    return String(answer == null ? "" : answer).split(/[;|\n,]+/).map(s => s.trim()).filter(Boolean);
}

/**
* For checkbox questions: indexes of every option the saved answer selects.
* A whole-answer match wins first so option labels that contain commas survive.
*/
function matchMany(answer, labels) {
    const whole = matchOption(answer, labels, false);
    if (whole !== -1) return [whole];
    const out = [];
    splitMultiAnswer(answer).forEach(token => {
        const i = matchOption(token, labels);
        if (i !== -1 && out.indexOf(i) === -1) out.push(i);
    });
    return out;
}

/**
* Parse "9:30 PM", "9.30pm", "21:30" into 24-hour parts. Returns null when invalid.
*/
function parseTime(answer) {
    const m = String(answer == null ? "" : answer).trim()
        .match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*([ap])\.?\s*m\.?)?$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const mer = m[3] ? m[3].toUpperCase() : null;
    if (min > 59) return null;
    if (mer) {
        if (h < 1 || h > 12) return null;
        h = (h % 12) + (mer === "P" ? 12 : 0);
    } else if (h > 23) {
        return null;
    }
    return { h24: h, min: min };
}


// ===================== Question detection (DOM) =====================

/**
* Every top-level question block that has a heading. Google nests list items
* inside some question types, so wrappers inside another list item are skipped.
*/
function getQuestionItems(root) {
    const items = [];
    root.querySelectorAll("div[role='listitem']").forEach(el => {
        if (!el.querySelector("[role='heading']")) return;
        const parent = el.parentElement;
        if (parent && parent.closest("div[role='listitem']")) return;
        items.push(el);
    });
    return items;
}

function getQuestionTitle(item) {
    const h = item.querySelector("[role='heading']");
    return h ? cleanTitle(h.textContent) : "";
}

/** "radio" | "checkbox" | "dropdown" | "time" | "file" | "grid" (unsupported) | "text" */
function detectQuestionKind(item) {
    if (item.querySelector("input[type='file']") ||
        /\bAdd file\b|Upload \d+ supported file/i.test(item.textContent || "")) return "file";

    if (item.querySelector("input[aria-label='Hour' i]") &&
        item.querySelector("input[aria-label='Minute' i]") &&
        !item.querySelector("input[aria-label='Second' i]")) return "time";

    const groups = item.querySelectorAll("[role='radiogroup']");
    if (groups.length > 1) return "grid";
    if (item.querySelector("[role='radio']")) return "radio";

    const boxes = item.querySelectorAll("[role='checkbox']");
    if (boxes.length) {
        const isGrid = Array.prototype.some.call(boxes, b => /response for/i.test(b.getAttribute("aria-label") || ""));
        return isGrid ? "grid" : "checkbox";
    }
    if (item.querySelector("[role='listbox']")) return "dropdown";
    return "text";
}

const CHOICE_KINDS = new Set(["radio", "checkbox", "dropdown", "time"]);
const OTHER_VALUE = "__other_option__";

function optionLabel(el) {
    return (el.getAttribute("data-answer-value") || el.getAttribute("data-value") ||
            el.getAttribute("aria-label") || el.textContent || "").trim();
}

function choiceElements(item, role) {
    return Array.prototype.filter.call(item.querySelectorAll("[role='" + role + "']"), el => {
        const v = el.getAttribute("data-value") || el.getAttribute("data-answer-value");
        return v !== OTHER_VALUE;
    });
}


// ===================== Choice-question fillers =====================

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function isVisible(el) {
    return !!(el && el.getClientRects && el.getClientRects().length > 0);
}

function setInputValue(el, value) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
* Click a radio/checkbox and wait for Google to mark it checked. A click Google
* ignores is retried once with a full mouse sequence. Never clicks an element that
* is already checked, so a checkbox can't be toggled off by a repeat pass.
*/
async function clickUntilChecked(el) {
    const checked = () => el.getAttribute("aria-checked") === "true";
    if (checked()) return true;
    el.click();
    if (await waitFor(checked, 700)) return true;
    clickAtCentre(el);
    return waitFor(checked, 700);
}

/** Returns the chosen label, or null when no option matches or the click didn't stick. */
async function fillRadio(item, answer) {
    const radios = choiceElements(item, "radio");
    const labels = radios.map(optionLabel);
    const i = matchOption(answer, labels);
    if (i === -1) return null;
    return (await clickUntilChecked(radios[i])) ? labels[i] : null;
}

async function fillCheckboxes(item, answer) {
    const boxes = choiceElements(item, "checkbox");
    const labels = boxes.map(optionLabel);
    const picked = matchMany(answer, labels);
    const done = [];
    for (const i of picked) {
        if (await clickUntilChecked(boxes[i])) done.push(labels[i]);
    }
    return done.length ? done.join(", ") : null;
}

/** Poll until `test()` is true or `ms` elapses. */
async function waitFor(test, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (test()) return true;
        await sleep(50);
    }
    return test();
}

/** Full mouse sequence aimed at the element's centre, for widgets that ignore a bare click(). */
function clickAtCentre(el) {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, button: 0,
                   clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ["mousedown", "mouseup", "click"].forEach(type => el.dispatchEvent(new MouseEvent(type, init)));
}

/**
* Open a custom dropdown and click the option whose data-value equals `value`.
* Google ignores an option click that lands while the list is still opening, so
* after it reports aria-expanded we wait for it to settle, then verify the
* selection. Up to three attempts: plain click, mouse sequence, plain click.
*/
async function pickListboxValue(item, listbox, value) {
    const isTarget = o => (o.getAttribute("data-value") || "") === value;
    const isDone = () => Array.prototype.some.call(item.querySelectorAll("[role='option']"),
        o => o.getAttribute("aria-selected") === "true" && isTarget(o));
    if (isDone()) return true;

    for (let attempt = 0; attempt < 3; attempt++) {
        if (listbox.getAttribute("aria-expanded") !== "true") listbox.click();
        await waitFor(() => listbox.getAttribute("aria-expanded") === "true", 1000);
        await sleep(650);

        let candidates = Array.prototype.filter.call(item.querySelectorAll("[role='option']"), isTarget);
        if (!candidates.length) {
            candidates = Array.prototype.filter.call(document.querySelectorAll("[role='option']"), isTarget);
        }
        if (!candidates.length) return false;
        const target = candidates.filter(isVisible).pop() || candidates[candidates.length - 1];
        if (attempt === 1) clickAtCentre(target); else target.click();
        if (await waitFor(isDone, 800)) return true;
    }
    return false;
}

/** Distinct selectable option values of a dropdown (placeholder excluded). */
function dropdownValues(item) {
    const seen = [];
    Array.prototype.forEach.call(item.querySelectorAll("[role='option']"), o => {
        const v = o.getAttribute("data-value") || "";
        if (v && seen.indexOf(v) === -1) seen.push(v);
    });
    return seen;
}

async function fillDropdown(item, answer) {
    const listbox = item.querySelector("[role='listbox']");
    if (!listbox) return { ready: false, label: null };
    const values = dropdownValues(item);
    if (!values.length) return { ready: false, label: null };
    const i = matchOption(answer, values);
    if (i === -1) return { ready: true, label: null };
    const ok = await pickListboxValue(item, listbox, values[i]);
    return { ready: true, label: ok ? values[i] : null };
}

async function fillTime(item, answer) {
    const t = parseTime(answer);
    if (!t) return { ready: true, label: null };
    const hourEl = item.querySelector("input[aria-label='Hour' i]");
    const minEl = item.querySelector("input[aria-label='Minute' i]");
    if (!hourEl || !minEl) return { ready: false, label: null };

    const meridiem = item.querySelector("[role='listbox']");
    let hourText;
    if (meridiem) {
        hourText = String(t.h24 % 12 || 12);
    } else {
        hourText = String(t.h24);
    }
    setInputValue(hourEl, hourText);
    setInputValue(minEl, String(t.min).padStart(2, "0"));
    if (meridiem) {
        await pickListboxValue(item, meridiem, t.h24 >= 12 ? "PM" : "AM");
    }
    return { ready: true, label: String(answer).trim() };
}

/** { ready, label }: ready=false means the options are not in the DOM yet. */
async function fillChoiceQuestion(item, kind, answer) {
    if (kind === "radio") {
        const has = choiceElements(item, "radio").length > 0;
        return { ready: has, label: has ? await fillRadio(item, answer) : null };
    }
    if (kind === "checkbox") {
        const has = choiceElements(item, "checkbox").length > 0;
        return { ready: has, label: has ? await fillCheckboxes(item, answer) : null };
    }
    if (kind === "dropdown") return fillDropdown(item, answer);
    if (kind === "time") return fillTime(item, answer);
    return { ready: true, label: null };
}


// GoogleForm.js script beginning
let form;
let formObserver = null;

// Debounce observer-driven fills so a burst of mutations coalesces into one fill.
let fillTimer = null;
function scheduleFill() {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => FillGoogleForms(), 120);
}

// Memoize best-match per title for a given formData key-set. The match depends
// only on the keys, not their values, so the stamp is built from sorted keys.
let matchCache = new Map();
let cacheStamp = null;

/**
* Cached wrapper around GetBestMatch. Clears the cache whenever the formData
* key-set changes (stamp mismatch).
*/
function getBestMatchCached(title, formData) {
    const stamp = JSON.stringify(Object.keys(formData).sort());
    if (stamp !== cacheStamp) {
        matchCache.clear();
        cacheStamp = stamp;
    }
    if (matchCache.has(title)) {
        return matchCache.get(title);
    }
    const bestMatch = GetBestMatch(title, formData);
    matchCache.set(title, bestMatch);
    return bestMatch;
}

// Choice questions are filled once per element, so a later re-render or a
// manual change by the user is never overridden. Reset on explicit refills.
let filledItems = new WeakSet();
let fillRunning = false;
let fillQueued = false;

const COLOR_FILLED = "#34a853";
const COLOR_REVIEW = "#d93025";
let lastCtx = null;

/** Record what happened to a question. Painting happens in reviewForm(). */
function setState(item, state, key, label, reason) {
    item.setAttribute("data-gfaf-state", state);
    const put = (name, v) => v ? item.setAttribute(name, v) : item.removeAttribute(name);
    put("data-gfaf-key", key);
    put("data-gfaf-value", label);
    put("data-gfaf-reason", reason);
}

/** Does this question have something to answer? (skips section headers and descriptions) */
function hasControl(item, kind) {
    if (kind !== "text") return true;
    return !!item.querySelector("input:not([type='hidden']), textarea");
}

/** Has the question got an answer right now, whoever put it there? */
function isAnswered(item, kind) {
    if (kind === "text") {
        return Array.prototype.some.call(item.querySelectorAll("input:not([type='hidden']), textarea"),
            el => (el.value || "").trim() !== "");
    }
    if (kind === "time") {
        const h = item.querySelector("input[aria-label='Hour' i]");
        return !!(h && (h.value || "").trim());
    }
    if (kind === "dropdown") {
        return Array.prototype.some.call(item.querySelectorAll("[role='option']"),
            o => o.getAttribute("aria-selected") === "true" && (o.getAttribute("data-value") || "") !== "");
    }
    if (kind === "file") return false;
    return !!item.querySelector("[aria-checked='true']");
}

/** Outline a question (or clear our outline when color is null). */
function paint(item, color, tip) {
    if (color) {
        item.style.outline = "2px solid " + color;
        item.style.outlineOffset = "2px";
        item.title = tip || "";
        item.setAttribute("data-gfaf-painted", "1");
    } else if (item.getAttribute("data-gfaf-painted")) {
        item.style.outline = "";
        item.style.outlineOffset = "";
        item.removeAttribute("title");
        item.removeAttribute("data-gfaf-painted");
    }
}

// ===================== Learn mode: offer to save answers typed by hand =====================

// Elements the user really touched (isTrusted events only, never our own clicks).
let userTouched = new WeakSet();
let suppressReset = false;

function outermostItem(el) {
    let it = el && el.closest ? el.closest("div[role='listitem']") : null;
    while (it && it.parentElement && it.parentElement.closest("div[role='listitem']")) {
        it = it.parentElement.closest("div[role='listitem']");
    }
    return it;
}

function onUserEvent(e) {
    if (e.isTrusted) {
        const it = outermostItem(e.target);
        if (it) userTouched.add(it);
    }
    scheduleReview();
}

function clip(text, n) {
    const t = String(text);
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** The answer currently in a question, as saved-answer text. "" when empty. */
function readAnswer(item, kind) {
    if (kind === "text") {
        const el = Array.prototype.find.call(item.querySelectorAll("input:not([type='hidden']), textarea"),
            x => (x.value || "").trim() !== "");
        return el ? el.value.trim() : "";
    }
    if (kind === "radio") {
        const r = item.querySelector("[role='radio'][aria-checked='true']");
        if (!r) return "";
        if (r.getAttribute("data-value") === OTHER_VALUE) {
            const other = item.querySelector("input[aria-label='Other response']");
            return other ? (other.value || "").trim() : "";
        }
        return optionLabel(r);
    }
    if (kind === "checkbox") {
        return Array.prototype.filter.call(item.querySelectorAll("[role='checkbox'][aria-checked='true']"),
            c => c.getAttribute("data-answer-value") !== OTHER_VALUE).map(optionLabel).join(", ");
    }
    if (kind === "dropdown") {
        const o = Array.prototype.find.call(item.querySelectorAll("[role='option']"),
            x => x.getAttribute("aria-selected") === "true" && (x.getAttribute("data-value") || "") !== "");
        return o ? o.getAttribute("data-value") : "";
    }
    if (kind === "time") {
        const h = item.querySelector("input[aria-label='Hour' i]");
        const m = item.querySelector("input[aria-label='Minute' i]");
        if (!h || !m || !(h.value || "").trim()) return "";
        const mer = Array.prototype.find.call(item.querySelectorAll("[role='listbox'] [role='option']"),
            x => x.getAttribute("aria-selected") === "true" && (x.getAttribute("data-value") || "") !== "");
        return h.value.trim() + ":" + (m.value || "00").trim().padStart(2, "0") + (mer ? " " + mer.getAttribute("data-value") : "");
    }
    return "";
}

function removeChip(item) {
    const chip = item.querySelector(".gfaf-chip");
    if (chip) chip.remove();
}

function chipButton(label, primary) {
    const b = document.createElement("button");
    b.type = "button"; // inside a <form>: must never submit it
    b.textContent = label;
    b.style.cssText = "margin-left:8px;border:0;border-radius:4px;padding:3px 10px;cursor:pointer;font:inherit;" +
        (primary ? "background:#1a73e8;color:#fff;" : "background:transparent;color:#1a73e8;");
    return b;
}

function chipText(existing, value, key) {
    return (existing ? "Update" : "Save") + ' "' + clip(value, 40) + '" as your answer to "' + clip(key, 40) + '"?';
}

function offerSave(item, kind, value, key, existing) {
    const chip = document.createElement("div");
    chip.className = "gfaf-chip";
    chip.style.cssText = "margin:10px 0 0;padding:8px 10px;background:#e8f0fe;border-radius:6px;font:13px/1.4 Roboto,Arial,sans-serif;color:#202124;";
    const msg = document.createElement("span");
    msg.textContent = chipText(existing, value, key);
    const yes = chipButton(existing ? "Update" : "Save", true);
    const no = chipButton("Not now", false);
    chip.appendChild(msg); chip.appendChild(yes); chip.appendChild(no);

    no.addEventListener("click", () => { item.setAttribute("data-gfaf-dismissed", "1"); chip.remove(); });
    yes.addEventListener("click", () => {
        const latest = readAnswer(item, kind); // the answer as it is now, not when the chip appeared
        if (!latest) { chip.remove(); return; }
        saveLearnedAnswer(item, key, latest, chip, msg);
    });
    item.appendChild(chip);
}

function saveLearnedAnswer(item, key, value, chip, msg) {
    GFAFStorage.getFormData((readErr, data) => {
        if (readErr) { msg.textContent = "Could not save: " + readErr.message; return; }
        data[key] = value;
        suppressReset = true; // our own write must not trigger a refill that overwrites your edits
        setTimeout(() => { suppressReset = false; }, 1500);
        GFAFStorage.setFormData(data, (writeErr) => {
            if (writeErr) { suppressReset = false; msg.textContent = "Could not save: " + writeErr.message; return; }
            setState(item, "filled", key, value);
            item.setAttribute("data-gfaf-baseline", value);
            chip.setAttribute("data-done", "1");
            Array.prototype.forEach.call(chip.querySelectorAll("button"), b => b.remove());
            msg.textContent = "Saved. Next time this question fills itself.";
            setTimeout(() => chip.remove(), 2200);
            if (lastCtx && form) reviewForm(getQuestionItems(form), lastCtx);
        });
    });
}

/** Is the user still typing in a text box inside this question? */
function isTypingIn(item) {
    const a = document.activeElement;
    return !!(a && item.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
}

function manageChip(item, kind, state, ctx) {
    const chip = item.querySelector(".gfaf-chip");
    const answered = isAnswered(item, kind);
    const answer = answered ? readAnswer(item, kind) : "";
    const baseline = item.getAttribute("data-gfaf-baseline");

    // Until you touch a question, whatever is in it is the baseline (our fill or an old saved answer).
    if (!userTouched.has(item)) {
        if (answer) item.setAttribute("data-gfaf-baseline", answer);
        return;
    }
    if (chip) {
        if (chip.hasAttribute("data-done")) return;
        if (!answer || (state === "filled" && answer === baseline)) { chip.remove(); return; }
        const msg = chip.querySelector("span");
        if (msg && !isTypingIn(item)) {
            const key = item.getAttribute("data-gfaf-key") || getQuestionTitle(item);
            msg.textContent = chipText(!!item.getAttribute("data-gfaf-key"), answer, key); // keep the chip's text current
        }
        return;
    }
    if (!ctx.learn || kind === "file" || kind === "grid" || !answer) return;
    if (item.querySelector("textarea")) return; // paragraph questions are never learned
    if (item.hasAttribute("data-gfaf-dismissed") || isTypingIn(item)) return;
    if (state === "filled" && answer === baseline) return; // nothing changed from what we filled
    if (state !== "none" && state !== "unsure" && state !== "filled") return;
    const existingKey = item.getAttribute("data-gfaf-key");
    const key = existingKey || getQuestionTitle(item);
    if (!key) return;
    offerSave(item, kind, answer, key, !!existingKey);
}


// ===================== Summary badge =====================

let badgeHost = null;
let badgeTargets = [];
let badgeCursor = 0;
let badgeCollapsed = false;

function ensureBadge() {
    if (badgeHost) return badgeHost.shadowRoot;
    badgeHost = document.createElement("div");
    badgeHost.id = "gfaf-badge";
    badgeHost.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = badgeHost.attachShadow({ mode: "open" });
    root.innerHTML =
        "<style>" +
        ".box{font:13px/1.4 Roboto,Arial,sans-serif;background:#fff;color:#202124;border:1px solid #dadce0;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.2);padding:10px 12px;min-width:200px}" +
        ".title{font-weight:500;display:flex;align-items:center}" +
        ".row{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}" +
        ".ok{color:#188038;font-weight:500}.bad{color:#d93025;font-weight:500}.up{color:#5f6368}" +
        "button{font:inherit;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;background:#1a73e8;color:#fff}" +
        "button.x{background:transparent;color:#5f6368;padding:0 4px;margin-left:auto;font-size:16px}" +
        ".hide{display:none}" +
        "</style>" +
        '<div class="box"><div class="title"><span>FormFlow</span><button class="x" data-act="toggle" title="Collapse">–</button></div>' +
        '<div class="row" id="stats"></div><div class="row" id="actions"></div></div>';
    root.addEventListener("click", (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
        if (act === "toggle") {
            badgeCollapsed = !badgeCollapsed;
            applyBadgeCollapse(root);
        } else if (act === "next") {
            goToNextTarget();
        }
    });
    document.documentElement.appendChild(badgeHost);
    return root;
}

function applyBadgeCollapse(root) {
    root.getElementById("stats").classList.toggle("hide", badgeCollapsed);
    root.getElementById("actions").classList.toggle("hide", badgeCollapsed);
    const x = root.querySelector("button.x");
    x.textContent = badgeCollapsed ? "+" : "–";
    x.title = badgeCollapsed ? "Expand" : "Collapse";
}

function goToNextTarget() {
    if (!badgeTargets.length) return;
    const target = badgeTargets[badgeCursor % badgeTargets.length];
    badgeCursor++;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.style.outlineWidth = "5px";
    setTimeout(() => { target.style.outlineWidth = "2px"; }, 800);
}

function statSpan(cls, text) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
}

function updateBadge(counts, targets, ctx) {
    if (!ctx || !ctx.highlight) {
        if (badgeHost) { badgeHost.remove(); badgeHost = null; }
        return;
    }
    if (counts.filled + counts.need + counts.uploads === 0) return;
    const root = ensureBadge();
    badgeTargets = targets;

    const stats = root.getElementById("stats");
    stats.textContent = "";
    stats.appendChild(statSpan("ok", "✓ " + counts.filled + " filled"));
    if (counts.need) stats.appendChild(statSpan("bad", "⚠ " + counts.need + " need you"));
    if (counts.uploads) stats.appendChild(statSpan("up", counts.uploads + (counts.uploads === 1 ? " file upload" : " file uploads")));

    const actions = root.getElementById("actions");
    actions.textContent = "";
    if (targets.length) {
        const next = document.createElement("button");
        next.setAttribute("data-act", "next");
        next.textContent = "Next question that needs you →";
        actions.appendChild(next);
    } else {
        actions.appendChild(statSpan("ok", "All set. Review, then submit."));
    }
    applyBadgeCollapse(root);
}


/**
* Green = filled from a saved answer. Red = needs you: no saved answer matched,
* the saved answer did not fit, a file upload, or an unsupported grid. A red
* question turns plain as soon as it has an answer, from you or from us.
*/
function reviewForm(items, ctx) {
    const counts = { filled: 0, need: 0, uploads: 0 };
    const targets = [];
    items.forEach(item => {
        const kind = detectQuestionKind(item);
        if (!hasControl(item, kind)) return;
        if (!ctx || !ctx.highlight) { paint(item, null); removeChip(item); return; }

        const state = item.getAttribute("data-gfaf-state");
        let color = null;
        let tip = "";
        if (kind === "file") {
            color = COLOR_REVIEW; tip = "File upload: attach your file yourself";
        } else if (state === "filled") {
            color = COLOR_FILLED; tip = "Filled from saved answer: " + (item.getAttribute("data-gfaf-key") || "");
        } else if (isAnswered(item, kind)) {
            color = null;
        } else if (kind === "grid") {
            color = COLOR_REVIEW; tip = "Grid questions are not filled automatically: answer this one yourself";
        } else if (state === "unsure") {
            color = COLOR_REVIEW; tip = "Check this: " + (item.getAttribute("data-gfaf-reason") || "could not be filled");
        } else if (state === "none") {
            color = COLOR_REVIEW; tip = "Not filled: no saved answer matches this question";
        }
        paint(item, color, tip);

        if (isVisible(item)) {
            if (kind === "file") { counts.uploads++; targets.push(item); }
            else if (color === COLOR_REVIEW) { counts.need++; targets.push(item); }
            else if (color === COLOR_FILLED) counts.filled++;
        }
        manageChip(item, kind, state, ctx);
    });
    updateBadge(counts, targets, ctx);
}

// Re-check the outlines shortly after the user answers something themselves.
let reviewTimer = null;
function scheduleReview() {
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(() => {
        if (fillRunning || !form || !lastCtx) return;
        reviewForm(getQuestionItems(form), lastCtx);
    }, 250);
}

/** Text, textarea and date inputs (the original behaviour). */
function fillTextQuestions(items, formData, ctx) {
    items.forEach(item => {
        if (detectQuestionKind(item) !== "text" || !hasControl(item, "text")) return;
        const title = getQuestionTitle(item);
        const bestMatch = title ? getBestMatchCached(title, formData) : null;
        if (!bestMatch) { setState(item, "none"); return; }

        if (filledItems.has(item)) return; // already filled once: never overwrite the user's edits
        const answer = formData[bestMatch];
        let wrote = false;
        Object.values(Handlers).forEach(handler => {
            item.querySelectorAll(handler.selector).forEach(field => {
                handler.fill(field, answer, ctx);
                if ((field.value || "") !== "") wrote = true;
            });
        });
        if (wrote) { filledItems.add(item); setState(item, "filled", bestMatch, String(answer)); }
        else setState(item, "unsure", bestMatch, null, 'the field did not accept "' + answer + '"');
    });
}

async function fillPass(formData, ctx) {
    if (!form) return;
    if (fillRunning) { fillQueued = true; return; }
    fillRunning = true;
    // Pause the observer so our own events and clicks don't re-trigger it.
    if (formObserver) formObserver.disconnect();
    try {
        const items = getQuestionItems(form);
        fillTextQuestions(items, formData, ctx);

        for (const item of items) {
            const kind = detectQuestionKind(item);
            if (kind === "grid") { setState(item, "unsure", null, null, "grid questions are not supported yet"); continue; }
            if (!CHOICE_KINDS.has(kind)) continue;
            const title = getQuestionTitle(item);
            if (!title) continue;
            const key = getBestMatchCached(title, formData);
            if (!key) { setState(item, "none"); continue; }
            if (filledItems.has(item)) continue;
            try {
                const result = await fillChoiceQuestion(item, kind, formData[key]);
                if (result.ready) filledItems.add(item);
                if (result.label) setState(item, "filled", key, result.label);
                else if (result.ready) setState(item, "unsure", key, null, 'saved answer "' + formData[key] + '" did not match any option');
            } catch (e) {
                filledItems.add(item);
                setState(item, "unsure", key, null, "it could not be filled automatically");
                console.warn("GFAF: could not fill '" + title + "':", e);
            }
        }
        lastCtx = ctx;
        reviewForm(items, ctx);
    } finally {
        fillRunning = false;
        // Reconnect with the same options so legitimately new DOM still fires.
        if (formObserver && form) {
            formObserver.observe(form, { childList: true, subtree: true });
        }
        if (fillQueued) { fillQueued = false; scheduleFill(); }
    }
}

/**
* Fills inputs on forms page with the data
*/
function FillGoogleForms() {
    GFAFStorage.getFormData((dataError, formData) => {
        if (dataError || !formData || Object.keys(formData).length === 0) {
            console.log("No form data found in storage.");
            return;
        }
        GFAFStorage.getSettings((settingsError, settings) => {
            if (settingsError) console.warn("settings read failed, using default date format:", settingsError.message);
            const ctx = {
                dateFormat: (settings && settings.dateFormat) || "DMY",
                highlight: !(settings && settings.highlight === false),
                learn: !(settings && settings.learn === false),
            };
            fillPass(formData, ctx);
        });
    });
}

/** Explicit refill (popup edit or button): forget what was filled before. */
function RefillGoogleForms() {
    filledItems = new WeakSet();
    FillGoogleForms();
}

/**
* Observe the form changes and refill the form
*/
function ObserveFormChanges() {
    formObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === "childList") {
                scheduleFill();
                return;
            }
        }
    });

    formObserver.observe(form, {
        childList: true,
        subtree: true,
    });
}

function startFilling() {
    ["input", "change", "click", "focusout"].forEach(type => form.addEventListener(type, onUserEvent, true));
    GFAFStorage.migrateSyncToLocal(() => {
        FillGoogleForms();
    });
    ObserveFormChanges();
}

function OnPageLoad() {
    form = document.querySelector("form");
    if (form) {
        startFilling();
        return;
    }
    // No form yet: the "already responded" page, or Google rendering late.
    // Wait quietly, and stop watching after a minute so a static page costs nothing.
    const waiter = new MutationObserver(() => {
        const found = document.querySelector("form");
        if (found) {
            waiter.disconnect();
            form = found;
            startFilling();
        }
    });
    waiter.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => waiter.disconnect(), 60000);
}

if(document.readyState == 'complete'){
    OnPageLoad();
} else {
    window.onload = () => OnPageLoad();
}

// Clear the match cache and refill when popup edits change stored formData,
// so live edits reflect on the form without a reload.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[GFAFStorage.STORAGE_KEYS.settings]) scheduleFill(); // e.g. outlines toggled
    const change = changes[GFAFStorage.STORAGE_KEYS.formData];
    if (change && suppressReset) {
        suppressReset = false;
        matchCache.clear();
        cacheStamp = null;
        return;
    }
    if (change) {
        // The popup rewrites identical data on every row edit; ignore no-op writes.
        if (JSON.stringify(change.oldValue) === JSON.stringify(change.newValue)) return;
        matchCache.clear();
        cacheStamp = null;
        filledItems = new WeakSet();
        scheduleFill();
    }
});

// Add listener for popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'FillGoogleForms') {
      RefillGoogleForms();
      sendResponse({ status: 'Function executed' });
    }
});
