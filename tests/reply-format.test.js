const test = require("node:test");
const assert = require("node:assert/strict");
const {cleanPeerReply} = require("../reply-format.js");

test("removes question paragraphs and AI notes but retains references", () => {
  const original = [
    "Pradeep — the difference is in the leader's response to failure.",
    "",
    "Question: How would you operationalize accountability?",
    "",
    "Reference",
    "Shannon, M. R., Buford, M., Winston, B. E., & Wood, J. A. (2020).",
    "",
    "Note: Course requires disclosure of AI assistance when used."
  ].join("\n");
  const cleaned = cleanPeerReply(original);
  assert.match(cleaned, /leader's response/);
  assert.match(cleaned, /Shannon, M\. R\./);
  assert.doesNotMatch(cleaned, /How would|AI assistance|\?/);
});

test("removes a standalone question and inline source verification note", () => {
  const original = "Sri — valuable connection.\nWhich practice would you implement?\nReference\nShannon (2020). Source verification needed.";
  const cleaned = cleanPeerReply(original);
  assert.equal(cleaned, "Sri, valuable connection.\nReference\nShannon (2020).");
});

test("preserves a scholarly, declarative closing", () => {
  const input = "Regular debriefs and candid upward feedback make accountability part of the team's routine.";
  assert.equal(cleanPeerReply(input), input);
});

test("replaces dash greeting and avoids generic praise opener", () => {
  const reply = "Pradeep — strong synthesis linking biblical examples. I agree that repentance matters. A leader—especially under pressure—needs accountability.";
  const cleaned = cleanPeerReply(reply);
  assert.match(cleaned, /^Pradeep, I agree that repentance matters\./);
  assert.doesNotMatch(cleaned, /—|strong synthesis/);
  assert.match(cleaned, /needs accountability/);
});

test("retains specific argument when greeting uses em dash", () => {
  assert.equal(
    cleanPeerReply("Sri — your analysis links integrity and leadership responsibility."),
    "Sri, your analysis links integrity and leadership responsibility."
  );
});
