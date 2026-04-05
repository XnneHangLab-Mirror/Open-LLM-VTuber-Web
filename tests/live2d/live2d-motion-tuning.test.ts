import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNeutralMouseFollowPose,
  stepMouseFollowPose,
} from '../../src/renderer/src/hooks/canvas/live2d-mouse-follow.js';
import { smoothPoseTowardsTarget } from '../../src/renderer/src/live2d/mixer/pose-smoothing.js';

test('mouse follow keeps smoothing but reaches the target faster', () => {
  const previous = createNeutralMouseFollowPose();
  const target = {
    head_yaw: 1,
    head_pitch: 0.6,
    head_roll: -0.2,
    body_yaw: 0.8,
    gaze_x: 1,
    gaze_y: 0.6,
  };

  const next = stepMouseFollowPose(previous, target, 0.05);

  assert.ok(next.head_yaw > 0.16);
  assert.ok(next.head_yaw < 1);
  assert.ok(next.gaze_x > 0.16);
  assert.ok(next.gaze_x < 1);
  assert.ok(next.body_yaw > 0.12);
});

test('pose smoothing keeps mouth smoother while head and body respond faster', () => {
  const previous = {
    head_yaw: 0,
    body_yaw: 0,
    mouth_form: 0,
  };
  const target = {
    head_yaw: 1,
    body_yaw: 1,
    mouth_form: 1,
  };

  const next = smoothPoseTowardsTarget(previous, target, 100);

  assert.ok((next.head_yaw ?? 0) > 0.3);
  assert.ok((next.body_yaw ?? 0) > 0.25);
  assert.ok((next.head_yaw ?? 0) > (next.mouth_form ?? 0));
  assert.ok((next.mouth_form ?? 0) < 1);
});
