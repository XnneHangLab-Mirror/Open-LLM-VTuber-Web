export interface MouseFollowPose {
  head_yaw: number;
  head_pitch: number;
  head_roll: number;
  body_yaw: number;
  gaze_x: number;
  gaze_y: number;
}

export interface MouseFollowMotionConfig {
  smoothTimeSeconds: number;
  maxSpeedPerSecond: number;
}

export const DEFAULT_MOUSE_FOLLOW_MOTION_CONFIG: MouseFollowMotionConfig = {
  smoothTimeSeconds: 0.18,
  maxSpeedPerSecond: 4.2,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createNeutralMouseFollowPose(): MouseFollowPose {
  return {
    head_yaw: 0,
    head_pitch: 0,
    head_roll: 0,
    body_yaw: 0,
    gaze_x: 0,
    gaze_y: 0,
  };
}

export function stepMouseFollowPose(
  previous: MouseFollowPose,
  target: MouseFollowPose,
  dtSeconds: number,
  config: MouseFollowMotionConfig = DEFAULT_MOUSE_FOLLOW_MOTION_CONFIG,
): MouseFollowPose {
  const safeDtSeconds = clamp(dtSeconds, 1 / 240, 0.1);
  const alpha = 1 - Math.exp(-safeDtSeconds / config.smoothTimeSeconds);
  const maxStep = config.maxSpeedPerSecond * safeDtSeconds;

  const smooth = (from: number, to: number): number => {
    const interpolated = from + ((to - from) * alpha);
    const delta = clamp(interpolated - from, -maxStep, maxStep);
    return clamp(from + delta, -1, 1);
  };

  return {
    head_yaw: smooth(previous.head_yaw, target.head_yaw),
    head_pitch: smooth(previous.head_pitch, target.head_pitch),
    head_roll: smooth(previous.head_roll, target.head_roll),
    body_yaw: smooth(previous.body_yaw, target.body_yaw),
    gaze_x: smooth(previous.gaze_x, target.gaze_x),
    gaze_y: smooth(previous.gaze_y, target.gaze_y),
  };
}
