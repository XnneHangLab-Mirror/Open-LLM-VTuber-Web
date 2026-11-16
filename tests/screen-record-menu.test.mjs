import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screenRecordMenuItems } from '../src/main/screen-record-menu.ts';

test('pet context and tray controls expose backend state and direct start/stop actions', () => {
  const actions = [];
  const send = (action) => actions.push(action);
  const disconnected = screenRecordMenuItems({}, send);
  assert.equal(disconnected[1].enabled, false);
  assert.match(disconnected[0].label, /未连接/);
  const ready = screenRecordMenuItems({ available: true }, send);
  assert.equal(ready[1].enabled, true);
  ready[1].click();
  const running = screenRecordMenuItems({ available: true, recording: true, remaining: 123.1 }, send);
  assert.match(running[0].label, /124 秒/);
  assert.match(running[1].label, /停止/);
  running[1].click();
  assert.deepEqual(actions, ['start', 'stop']);
  assert.equal(screenRecordMenuItems({ available: true, pending: true }, send)[1].enabled, false);
  assert.match(screenRecordMenuItems({ available: true, error: '未启用视觉模型' }, send)[0].label, /未启用视觉模型/);
  assert.match(screenRecordMenuItems({ available: true, recording: true, remaining: NaN }, send)[0].label, /0 秒/);
});
