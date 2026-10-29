// End-to-end test: runs the real content script in Chromium against a mock of Google's form markup.
// Setup:  npm i -D playwright && npx playwright install chromium
// Run:    node test/e2e/run.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MOCK = path.join(__dirname, 'mockform.html');
const SAVED = {
  'Full name': 'Shubh Bohra', 'Email': 'shubh@example.com', 'About': 'Final-year student',
  'Date of birth': '03/04/2003', 'Gender': 'male', 'Branch': 'Computer Science',
  'Skills': 'Python, Java', 'Year': 'Final year', 'Preferred call time': '9:30 PM', 'Rate': 'Good', 'Rating': '4', 'Program': 'B.E.'
};

async function waitQuiet(page, quietMs = 2500, maxMs = 40000) {
  const start = Date.now(); let last = -1, since = Date.now();
  while (Date.now() - start < maxMs) {
    const n = await page.evaluate(() => (window.__clicks || []).length);
    if (n !== last) { last = n; since = Date.now(); }
    if (Date.now() - since >= quietMs && n > 0) return;
    await page.waitForTimeout(250);
  }
}
const SAVEDCOPY = SAVED;
let pass = 0, fail = 0;
const ok = (c, name, extra='') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : '  ' + extra)); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.addInitScript(saved => {
    const store = { formData: saved, _migrated: true };
    const mk = () => ({ get(k, cb){ const keys = Array.isArray(k)?k:[k]; const o={}; keys.forEach(x=>{ if(x in store) o[x]=store[x]; }); cb(o); },
                        set(o, cb){ Object.assign(store, o); cb && cb(); } });
    window.chrome = { runtime:{ onMessage:{addListener(){}}, lastError:null }, storage:{ local: mk(), sync: mk(), onChanged:{addListener(){}} } };
    window.__store = store;
  }, SAVED);
  await page.route('https://docs.google.com/forms/mock', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(MOCK,'utf8') }));
  await page.addInitScript(() => { window.__flaky = true; });
  await page.goto('https://docs.google.com/forms/mock');
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/storage.js','utf8') });
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/GoogleForm.js','utf8') });
  await waitQuiet(page);

  const v = sel => page.$eval(sel, e => e.value);
  const checked = sel => page.$$eval(sel+' [aria-checked="true"]', els => els.map(e => e.getAttribute('data-value')||e.getAttribute('data-answer-value')));

  ok(await v('#q-name input') === 'Shubh Bohra', 'text: Full name filled');
  ok(await v('#q-email input') === 'shubh@example.com', 'text: "Email Address" -> saved Email');
  ok(await v('#q-bio textarea') === 'Final-year student', 'textarea filled');
  ok(await v('#q-dob input') === '2003-04-03', 'date: DD/MM -> ISO', await v('#q-dob input'));
  let g = await checked('#q-gender'); ok(g.length===1 && g[0]==='Male', 'radio: "male" selects Male', JSON.stringify(g));
  let b = await checked('#q-branch'); ok(b.length===1 && b[0]==='Computer Science and Engineering', 'radio: containment picks CSE, not Other', JSON.stringify(b));
  ok(await v('#q-branch input') === '', 'radio: Other text box left empty');
  let s = await checked('#q-skills'); ok(JSON.stringify(s.sort())===JSON.stringify(['Java','Python']), 'checkbox: Python and Java only', JSON.stringify(s));
  let r = await checked('#q-scale'); ok(r.length===1 && r[0]==='4', 'scale: 4 selected', JSON.stringify(r));
  ok(await page.$eval('#q-year .shown', e=>e.textContent) === 'Final year', 'dropdown: Final year chosen');
  ok(await page.$eval('#q-year [role=option][aria-selected=true]', e=>e.getAttribute('data-value')) === 'Final year', 'dropdown: option marked selected');
  ok(await v('#q-time input[aria-label=Hour]') === '9', 'time: hour 9 (12h)', await v('#q-time input[aria-label=Hour]'));
  ok(await v('#q-time input[aria-label=Minute]') === '30', 'time: minute 30');
  ok(await page.$eval('#q-time .shown', e=>e.textContent) === 'PM', 'time: PM chosen');
  let gr = await checked('#q-grid'); ok(gr.length===0, 'grid: left untouched (unsupported)', JSON.stringify(gr));
  ok(await page.$eval('#q-gender', e=>e.getAttribute('data-gfaf-key')) === 'Gender', 'review: filled question tagged with matched key');
  ok((await page.$eval('#q-gender', e=>e.style.outline)).includes('solid'), 'review: filled question highlighted');


  // ---- review outlines ----
  const RED = 'rgb(217, 48, 37)', GREEN = 'rgb(52, 168, 83)';
  const outline = sel => page.$eval(sel, e => getComputedStyle(e).outlineColor + '|' + getComputedStyle(e).outlineStyle);
  const tip = sel => page.$eval(sel, e => e.title);
  ok((await outline('#q-name')).startsWith(GREEN), 'outline: filled text question is green', await outline('#q-name'));
  ok((await outline('#q-gender')).startsWith(GREEN), 'outline: filled radio question is green');
  ok((await outline('#q-hobby')).startsWith(RED), 'outline: question with no saved answer is red', await outline('#q-hobby'));
  ok((await tip('#q-hobby')).includes('no saved answer'), 'outline: red tooltip explains why', await tip('#q-hobby'));
  ok((await outline('#q-file')).startsWith(RED), 'outline: file upload is red', await outline('#q-file'));
  ok((await tip('#q-file')).includes('File upload'), 'outline: file upload tooltip', await tip('#q-file'));
  ok((await outline('#q-prog')).startsWith(RED), 'outline: saved answer with no matching option is red', await outline('#q-prog'));
  ok((await tip('#q-prog')).includes('did not match any option'), 'outline: unsure tooltip names the problem', await tip('#q-prog'));
  ok((await outline('#q-grid')).startsWith(RED), 'outline: grid is red', await outline('#q-grid'));
  ok((await outline('#q-header')).includes('none') || !(await outline('#q-header')).startsWith(RED), 'outline: section header is left alone', await outline('#q-header'));
  // the user answers a red question: red must clear by itself
  await page.fill('#q-hobby input', 'Badminton');
  await page.waitForTimeout(700);
  ok(!(await outline('#q-hobby')).startsWith(RED) , 'outline: red clears once the user answers', await outline('#q-hobby'));
  await page.click('#q-prog [data-value="BCA"]'); await page.waitForTimeout(300); await page.click('#q-prog [data-value="BCA"]');
  await page.waitForTimeout(700);
  ok(!(await outline('#q-prog')).startsWith(RED), 'outline: red clears after picking an option by hand', await outline('#q-prog'));

  // user changes mind: choose Female manually; churn (ripple) must NOT cause a re-fill back to Male
  await page.click('#q-gender [data-value="Female"]'); await page.waitForTimeout(300); await page.click('#q-gender [data-value="Female"]'); /* mock ignores a first click */
  await page.waitForTimeout(1200);
  g = await checked('#q-gender'); ok(g.length===1 && g[0]==='Female', 'manual change survives (no override after DOM churn)', JSON.stringify(g));
  // no infinite loop: count clicks over a quiet period
  const before = (await page.evaluate(() => window.__clicks.length));
  await page.waitForTimeout(1500);
  const after = (await page.evaluate(() => window.__clicks.length));
  ok(before === after, 'no refill loop while idle', before + ' -> ' + after);
  ok(!logs.some(l => /PAGEERROR|could not fill/.test(l)), 'no script errors', logs.filter(l=>/PAGEERROR|could not fill/.test(l)).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
})().then(() => run2());

// ---- scenario 2: page has no form at load (e.g. "already responded"), form appears later ----
async function run2() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.addInitScript(saved => {
    const store = { formData: saved, _migrated: true };
    const mk = () => ({ get(k, cb){ const keys = Array.isArray(k)?k:[k]; const o={}; keys.forEach(x=>{ if(x in store) o[x]=store[x]; }); cb(o); }, set(o, cb){ Object.assign(store, o); cb && cb(); } });
    window.chrome = { runtime:{ onMessage:{addListener(){}}, lastError:null }, storage:{ local: mk(), sync: mk(), onChanged:{addListener(){}} } };
  }, SAVED);
  await page.route('https://docs.google.com/forms/late', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(MOCK,'utf8') }));
  await page.goto('https://docs.google.com/forms/late');
  await page.evaluate(() => { const f = document.querySelector('form'); window.__f = f; f.remove(); });
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/storage.js','utf8') });
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/GoogleForm.js','utf8') });
  await page.waitForTimeout(800);
  const early = logs.filter(l => l.startsWith('error'));
  ok(early.length === 0, 'late form: no console error while waiting for the form', early.join(' | '));
  await page.evaluate(() => document.body.appendChild(window.__f));
  await page.waitForTimeout(2500);
  ok(await page.$eval('#q-name input', e => e.value) === 'Shubh Bohra', 'late form: filled once the form appears');
  await browser.close();
  await run3();
}

// ---- scenario 3: outlines turned off in the popup settings ----
async function run3() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(saved => {
    const store = { formData: saved, settings: { highlight: false }, _migrated: true };
    const mk = () => ({ get(k, cb){ const keys = Array.isArray(k)?k:[k]; const o={}; keys.forEach(x=>{ if(x in store) o[x]=store[x]; }); cb(o); }, set(o, cb){ Object.assign(store, o); cb && cb(); } });
    window.chrome = { runtime:{ onMessage:{addListener(){}}, lastError:null }, storage:{ local: mk(), sync: mk(), onChanged:{addListener(){}} } };
  }, SAVED);
  await page.route('https://docs.google.com/forms/off', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(MOCK,'utf8') }));
  await page.goto('https://docs.google.com/forms/off');
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/storage.js','utf8') });
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/GoogleForm.js','utf8') });
  await page.waitForTimeout(4000);
  ok(await page.$eval('#q-name input', e => e.value) === 'Shubh Bohra', 'toggle off: still fills');
  ok(await page.$eval('#q-name', e => e.style.outline) === '' && await page.$eval('#q-hobby', e => e.style.outline) === '', 'toggle off: no outlines at all');
  await browser.close();
  await run4();
}

// ---- scenario 4: summary badge and learn mode (real, trusted mouse and keyboard input) ----
async function run4() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(saved => {
    const store = { formData: JSON.parse(JSON.stringify(saved)), _migrated: true };
    const mk = () => ({ get(k, cb){ const keys = Array.isArray(k)?k:[k]; const o={}; keys.forEach(x=>{ if(x in store) o[x]=store[x]; }); cb(o); }, set(o, cb){ Object.assign(store, o); cb && cb(); } });
    window.chrome = { runtime:{ onMessage:{addListener(){}}, lastError:null }, storage:{ local: mk(), sync: mk(), onChanged:{addListener(){}} } };
    window.__store = store;
  }, SAVED);
  await page.route('https://docs.google.com/forms/learn', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(MOCK,'utf8') }));
  await page.goto('https://docs.google.com/forms/learn');
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/storage.js','utf8') });
  await page.addScriptTag({ content: fs.readFileSync(ROOT+'/scripts/GoogleForm.js','utf8') });
  await page.waitForTimeout(6000);

  const badgeText = () => page.evaluate(() => { const h = document.getElementById('gfaf-badge'); return h ? h.shadowRoot.textContent : ''; });
  let bt = await badgeText();
  ok(/filled/.test(bt) && /need you/.test(bt), 'badge: shows filled and need-you counts', bt);
  ok(/1 file upload/.test(bt), 'badge: counts the file upload', bt);
  const before = (bt.match(/(\d+) need you/) || [])[1];

  // Next button scrolls to a red question
  await page.evaluate(() => document.getElementById('gfaf-badge').shadowRoot.querySelector('[data-act=next]').click());
  await page.waitForTimeout(300);
  const flashed = await page.evaluate(() => [...document.querySelectorAll('div[role=listitem]')].some(e => e.style.outlineWidth === '5px'));
  ok(flashed, 'badge: Next flashes a red question');

  // Learn mode: type an answer by hand into the unmatched Hobbies question
  await page.click('#q-hobby input');
  await page.keyboard.type('Chess');
  await page.click('#q-name input'); // blur
  await page.waitForTimeout(700);
  ok(await page.$('#q-hobby .gfaf-chip') !== null, 'learn: chip offered after typing by hand');
  ok(await page.$('#q-name .gfaf-chip') === null, 'learn: no chip on a question we filled ourselves');
  await page.click('#q-hobby .gfaf-chip button');
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => window.__store.formData);
  ok(saved['Hobbies'] === 'Chess', 'learn: Save stores the answer under the question title', JSON.stringify(saved['Hobbies']));
  ok(Object.keys(saved).length === Object.keys(SAVEDCOPY).length + 1, 'learn: no other saved entry changed');
  ok(await page.$eval('#q-hobby input', e => e.value) === 'Chess', 'learn: your answer is not overwritten by a refill');
  await page.waitForTimeout(2800);
  ok(await page.$('#q-hobby .gfaf-chip') === null, 'learn: chip goes away after saving');
  ok(await page.$eval('#q-hobby', e => e.style.outline.includes('rgb(52, 168, 83)')), 'learn: question turns green after saving');
  bt = await badgeText();
  ok(Number((bt.match(/(\d+) need you/) || [])[1]) === Number(before) - 1, 'badge: need-you count dropped by one', bt);

  // Editing a question we filled offers an Update, and the chip text follows later edits
  await page.click('#q-skills [data-answer-value=JavaScript]');
  await page.waitForTimeout(700);
  let ct = await page.$eval('#q-skills .gfaf-chip', e => e.textContent).catch(() => '');
  ok(/Update/.test(ct) && /JavaScript/.test(ct), 'learn: editing a filled checkbox offers Update', ct);
  await page.click('#q-skills [data-answer-value="C++"]');
  await page.waitForTimeout(700);
  ct = await page.$eval('#q-skills .gfaf-chip', e => e.textContent).catch(() => '');
  ok(/C\+\+/.test(ct) && /JavaScript/.test(ct), 'learn: chip text refreshes after another tick', ct);
  await page.click('#q-skills [data-answer-value="C++"]');
  await page.click('#q-skills [data-answer-value=JavaScript]');
  await page.waitForTimeout(700);
  ok(await page.$('#q-skills .gfaf-chip') === null, 'learn: chip disappears when the answer goes back to the saved one');

  // Other box: chip waits until you stop typing and then shows the final text
  await page.click('#q-branch [data-value=__other_option__]');
  await page.click('#q-branch input[aria-label="Other response"]');
  await page.keyboard.type('un');
  await page.waitForTimeout(600);
  ok(await page.$('#q-branch .gfaf-chip') === null, 'learn: no chip while still typing in Other');
  await page.keyboard.type('employed');
  await page.click('#q-name input');
  await page.waitForTimeout(700);
  ct = await page.$eval('#q-branch .gfaf-chip', e => e.textContent).catch(() => '');
  ok(/unemployed/.test(ct) && /Update/.test(ct), 'learn: Other chip shows the full final text', ct);
  await page.click('#q-branch input[aria-label="Other response"]');
  await page.keyboard.type('x');
  await page.click('#q-name input');
  await page.waitForTimeout(700);
  ct = await page.$eval('#q-branch .gfaf-chip', e => e.textContent).catch(() => '');
  ok(/unemployedx/.test(ct), 'learn: chip text follows a later edit', ct);
  await page.evaluate(() => [...document.querySelectorAll('#q-branch .gfaf-chip button')].find(b => /Update/.test(b.textContent)).click());
  await page.waitForTimeout(600);
  ok((await page.evaluate(() => window.__store.formData))['Branch'] === 'unemployedx', 'learn: Update saves the latest value, not the first one');

  // Paragraph questions are never learned
  await page.click('#q-bio textarea'); await page.keyboard.type(' more');
  await page.click('#q-name input');
  await page.waitForTimeout(700);
  ok(await page.$('#q-bio .gfaf-chip') === null, 'learn: no chip for paragraph questions');

  // Not now: pick a radio by hand, dismiss, chip must not return
  await page.click('#q-prog [data-value=BCA]');
  await page.waitForTimeout(700);
  ok(await page.$('#q-prog .gfaf-chip') !== null, 'learn: chip offered after picking an option by hand');
  await page.evaluate(() => [...document.querySelectorAll('#q-prog .gfaf-chip button')].find(b => b.textContent === 'Not now').click());
  await page.waitForTimeout(700);
  ok(await page.$('#q-prog .gfaf-chip') === null, 'learn: Not now removes the chip');
  await page.click('#q-name input'); await page.keyboard.press('End'); await page.keyboard.type('x');
  await page.waitForTimeout(700);
  ok(await page.$('#q-prog .gfaf-chip') === null, 'learn: dismissed chip does not come back');
  ok(errs.length === 0, 'no script errors', errs.join(' | '));
  console.log(`\n${pass} passed total, ${fail} failed total`);
  await browser.close();
  process.exit(fail ? 1 : 0);
}
