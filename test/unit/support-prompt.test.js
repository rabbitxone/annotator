import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickPrompt, RATE_AFTER_OPENS } from '../../src/shared/support-prompt.js';

test('support is shown until someone has used Annotator a few times', () => {
  for (let opens = 0; opens < RATE_AFTER_OPENS; opens++) assert.equal(pickPrompt({ opens }), 'support');
});

test('after that rate and support take turns', () => {
  assert.equal(pickPrompt({ opens: 5 }), 'rate');
  assert.equal(pickPrompt({ opens: 6 }), 'support');
  assert.equal(pickPrompt({ opens: 7 }), 'rate');
});

test('rate never comes back once clicked', () => {
  for (const opens of [5, 7, 99]) assert.equal(pickPrompt({ opens, rated: true }), 'support');
  assert.equal(pickPrompt(), 'support');
});
