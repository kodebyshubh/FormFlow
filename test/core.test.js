// Core-logic tests for Google Forms Auto Filler.
//
// No test framework, no dependencies (matches the project's zero-build stance).
// Loads the REAL source files into a sandboxed vm context, stubbing the browser
// APIs the content script touches at load time, then asserts on the actual
// exported functions.
//
//   Run:  node test/core.test.js
//   Exit: 0 = all passed, 1 = one or more failed.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

// ---- Sandbox with browser stubs so the content script loads under Node ----
const sandbox = {
  console,
  JSON,
  Math,
  Array,
  Object,
  String,
  parseInt,
  setTimeout: () => 0,
  clearTimeout: () => {},
  Event: class Event {},
  MutationObserver: class MutationObserver { observe() {} disconnect() {} },
  document: { readyState: "loading", querySelector: () => null },
  window: {},
  chrome: {
    storage: { onChanged: { addListener: () => {} } },
    runtime: { onMessage: { addListener: () => {} } },
  },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ["scripts/csvParser.js", "scripts/GoogleForm.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
}

const parseCSV = sandbox.GFAFCsv.parseCSV;
const toISO = sandbox.toISO;
const similarity = sandbox.CalculateSimilarity;
const findBestMatch = sandbox.findBestMatch;

// ===================== CSV parser =====================
eq(parseCSV("name,John\nemail,john@x.com"),
   { name: "John", email: "john@x.com" }, "CSV: basic two rows");
eq(parseCSV('addr,"123 Main, Apt 4"'),
   { addr: "123 Main, Apt 4" }, "CSV: quoted comma kept in value");
eq(parseCSV('bio,"line1\nline2"'),
   { bio: "line1\nline2" }, "CSV: quoted newline kept in value");
eq(parseCSV('q,"He said ""hi"""'),
   { q: 'He said "hi"' }, 'CSV: "" escapes to literal quote');
eq(parseCSV("﻿name,John"),
   { name: "John" }, "CSV: leading BOM stripped");
eq(parseCSV("a,1\r\nb,2\rc,3"),
   { a: "1", b: "2", c: "3" }, "CSV: CRLF / CR / LF all terminate rows");
eq(parseCSV("name,John\nonlyonecol\nemail,x@y.com"),
   { name: "John", email: "x@y.com" }, "CSV: row with <2 cells skipped");
eq(parseCSV('k,"unterminated'),
   { k: "unterminated" }, "CSV: unterminated quote flushed, no throw");
eq(parseCSV("  name  ,  John  "),
   { name: "John" }, "CSV: key/value trimmed");
eq(parseCSV(""), {}, "CSV: empty input -> empty object");

// ===================== toISO (date normalization) =====================
eq(toISO("2026-03-04", "DMY"), "2026-03-04", "date: ISO passes through");
eq(toISO("03/04/2026", "DMY"), "2026-04-03", "date: DMY -> day=03 month=04");
eq(toISO("03/04/2026", "MDY"), "2026-03-04", "date: MDY -> month=03 day=04");
eq(toISO("13/04/2026", "AUTO"), "2026-04-13", "date: AUTO first>12 => DMY");
eq(toISO("03/14/2026", "AUTO"), "2026-03-14", "date: AUTO second>12 => MDY");
eq(toISO("03/04/2026", "AUTO"), "2026-04-03", "date: AUTO ambiguous => DMY tie-break");
eq(toISO("5/6/2026", "DMY"), "2026-06-05", "date: single-digit padded");
eq(toISO("03.04.2026", "DMY"), "2026-04-03", "date: dot separator");
eq(toISO("not a date", "DMY"), "not a date", "date: unparseable passes through");
eq(toISO("03/04/2026", undefined), "2026-04-03", "date: default fmt is DMY");

// ===================== Fuzzy matching =====================
const fd = { Email: "a@b.com", Phone: "555-1234", Name: "Jo" };

eq(similarity("email", "email"), 100, "match: identical strings = 100");

// Punctuation-level fuzziness (full-string Levenshtein path) — pre-existing.
eq(findBestMatch("E-mail", fd), "Email", "match: 'E-mail' -> 'Email' (full-string fuzzy)");
eq(findBestMatch("Name", fd), "Name", "match: exact title matches key");
eq(findBestMatch("totally unrelated xyz", fd), null, "match: below threshold returns null");

// Token-coverage path — verbose form titles vs short saved keys (NEW behavior).
eq(findBestMatch("Email Address", fd), "Email", "match: 'Email Address' -> 'Email' (token coverage)");
eq(findBestMatch("Phone Number", fd), "Phone", "match: 'Phone Number' -> 'Phone' (token coverage)");

// Must NOT match: 'Username' is a single token, only 50% similar to 'Name'.
eq(findBestMatch("Username", fd), null, "match: 'Username' does NOT reach 'Name' (single token, 50%)");

// Documented residual of token coverage: a content word collides with a key.
eq(findBestMatch("Project Name", fd), "Name", "match: 'Project Name' -> 'Name' (accepted residual)");

// Ties between equally good keys: the closest-length key must win.
const emailKeys = { "College Email id": "college@x.edu", "Email ID": "me@gmail.com" };
eq(findBestMatch("Email ID", emailKeys), "Email ID", "tie: 'Email ID' prefers exact key over 'College Email id'");
eq(findBestMatch("Email ID", { "Email ID": "a", "College Email id": "b" }), "Email ID", "tie: order of keys does not matter");
eq(findBestMatch("College Email id", emailKeys), "College Email id", "tie: college email question still gets the college key");
eq(findBestMatch("College Name", { "College / University Name": "x", "College": "y" }), "College", "tie: shortest-distance key wins for College Name");

// ===================== Choice-question helpers =====================
const matchOption = sandbox.matchOption;
const matchMany = sandbox.matchMany;
const splitMultiAnswer = sandbox.splitMultiAnswer;
const parseTime = sandbox.parseTime;
const cleanTitle = sandbox.cleanTitle;

eq(cleanTitle("Full name *"), "Full name", "title: trailing asterisk stripped");
eq(cleanTitle("  Email   address  "), "Email address", "title: whitespace collapsed");

eq(matchOption("male", ["Male", "Female", "Other"]), 0, "option: exact, case-insensitive");
eq(matchOption("Female", ["Male", "Female"]), 1, "option: Female is not confused with Male");
eq(matchOption("Computr Science", ["Mechanical", "Computer Science"]), 1, "option: close spelling matches");
eq(matchOption("Computer Science", ["Computer Science and Engineering", "Mechanical"]), 0, "option: unique whole-word containment");
eq(matchOption("Engineering", ["Computer Engineering", "Mechanical Engineering"]), -1, "option: ambiguous containment rejected");
eq(matchOption("Bangalore", ["Delhi", "Mumbai"]), -1, "option: no match returns -1");
eq(matchOption("", ["A"]), -1, "option: empty answer returns -1");
eq(matchOption("No", ["Not sure", "No"]), 1, "option: short answer exact only");
eq(matchOption("4", ["1", "2", "3", "4", "5"]), 3, "option: linear-scale number");

eq(splitMultiAnswer("Python, Java; C++ | Go\nRust"), ["Python", "Java", "C++", "Go", "Rust"], "split: commas, semicolons, pipes, newlines");
eq(matchMany("Python, Java", ["Python", "Java", "C++"]), [0, 1], "many: two of three options");
eq(matchMany("Python, Rust", ["Python", "Java"]), [0], "many: unknown token ignored");
eq(matchMany("Tea, with milk", ["Tea, with milk", "Coffee"]), [0], "many: label containing a comma kept whole");
eq(matchMany("Java", ["Java", "JavaScript"]), [0], "many: Java does not select JavaScript");
eq(matchMany("", ["A", "B"]), [], "many: empty answer selects nothing");

eq(parseTime("9:30 PM"), { h24: 21, min: 30 }, "time: 12-hour PM");
eq(parseTime("9.30pm"), { h24: 21, min: 30 }, "time: dot and compact meridiem");
eq(parseTime("12:05 AM"), { h24: 0, min: 5 }, "time: 12 AM is hour 0");
eq(parseTime("12:00 PM"), { h24: 12, min: 0 }, "time: 12 PM is hour 12");
eq(parseTime("21:45"), { h24: 21, min: 45 }, "time: 24-hour");
eq(parseTime("25:00"), null, "time: invalid hour rejected");
eq(parseTime("10:75"), null, "time: invalid minute rejected");
eq(parseTime("13:00 PM"), null, "time: 13 with meridiem rejected");
eq(parseTime("lunch"), null, "time: text rejected");

// ===================== Report =====================
console.log("");
for (const f of failures) console.log(f);
console.log("");
console.log(`${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
