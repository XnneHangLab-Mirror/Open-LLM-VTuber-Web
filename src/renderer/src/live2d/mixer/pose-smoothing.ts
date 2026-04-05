import type { LogicalChannel, PoseValues } from './logical-channels.js';

const CHANNEL_RELEASE_EPSILON = 0.01;

const CHANNEL_NEUTRAL_VALUES: Record<LogicalChannel, number> = {
  head_yaw: 0,
  head_pitch: 0,
  head_roll: 0,
  body_yaw: 0,
  body_pitch: 0,
  body_roll: 0,
  gaze_x: 0,
  gaze_y: 0,
  eye_l_open: 1,
  eye_r_open: 1,
  brow_raise: 0,
  mouth_open: 0,
  mouth_form: 0,
};

const CHANNEL_TRANSITION_MS: Record<LogicalChannel, number> = {
  head_yaw: 220,
  head_pitch: 220,
  head_roll: 220,
  body_yaw: 320,
  body_pitch: 320,
  body_roll: 320,
  gaze_x: 160,
  gaze_y: 160,
  eye_l_open: 220,
  eye_r_open: 220,
  brow_raise: 360,
  mouth_open: 180,
  mouth_form: 240,
};

const CHANNEL_RELEASE_MS: Record<LogicalChannel, number> = {
  head_yaw: 280,
  head_pitch: 280,
  head_roll: 280,
  body_yaw: 360,
  body_pitch: 360,
  body_roll: 360,
  gaze_x: 200,
  gaze_y: 200,
  eye_l_open: 240,
  eye_r_open: 240,
  brow_raise: 360,
  mouth_open: 220,
  mouth_form: 300,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getChannelStepAlpha(durationMs: number, dtMs: number): number {
  if (durationMs <= 0) {
    return 1;
  }

  const safeDtMs = clamp(dtMs, 1000 / 240, 120);
  return 1 - Math.exp(-safeDtMs / durationMs);
}

export function smoothPoseTowardsTarget(previousPose: PoseValues, targetPose: PoseValues, dtMs: number): PoseValues {
  const nextPose: PoseValues = {};
  const channels = new Set<LogicalChannel>([
    ...(Object.keys(targetPose) as LogicalChannel[]),
    ...(Object.keys(previousPose) as LogicalChannel[]),
  ]);

  channels.forEach((channel) => {
    const targetValue = targetPose[channel];
    const previousValue = previousPose[channel];

    if (typeof targetValue === 'number' && Number.isFinite(targetValue)) {
      if (typeof previousValue !== 'number' || !Number.isFinite(previousValue)) {
        nextPose[channel] = targetValue;
        return;
      }

      const alpha = getChannelStepAlpha(CHANNEL_TRANSITION_MS[channel], dtMs);
      nextPose[channel] = previousValue + ((targetValue - previousValue) * alpha);
      return;
    }

    if (typeof previousValue !== 'number' || !Number.isFinite(previousValue)) {
      return;
    }

    const neutralValue = CHANNEL_NEUTRAL_VALUES[channel];
    const alpha = getChannelStepAlpha(CHANNEL_RELEASE_MS[channel], dtMs);
    const releasedValue = previousValue + ((neutralValue - previousValue) * alpha);
    if (Math.abs(releasedValue - neutralValue) > CHANNEL_RELEASE_EPSILON) {
      nextPose[channel] = releasedValue;
    }
  });

  return nextPose;
}
