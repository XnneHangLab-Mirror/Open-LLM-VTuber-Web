import { LogicalChannel } from '@/live2d/mixer/logical-channels';

export interface Live2DParameterTarget {
  id: string;
  scale: number;
}

/**
 * Mapping profile from logical channels -> Live2D parameter IDs.
 *
 * First version:
 * - 1 logical channel can map to 0..N Live2D params (most are 1:1).
 * - Missing channels are allowed (e.g. `brow_raise` is model-dependent).
 */
export type Live2DParameterProfile = Partial<Record<LogicalChannel, Live2DParameterTarget[]>>;

export function getDefaultLive2DParameterProfile(): Live2DParameterProfile {
  return {
    head_yaw: [{ id: 'ParamAngleX', scale: 30 }],
    head_pitch: [{ id: 'ParamAngleY', scale: 30 }],
    head_roll: [{ id: 'ParamAngleZ', scale: 30 }],
    body_yaw: [{ id: 'ParamBodyAngleX', scale: 10 }],
    gaze_x: [{ id: 'ParamEyeBallX', scale: 1 }],
    gaze_y: [{ id: 'ParamEyeBallY', scale: 1 }],

    // brow_raise: model dependent (reserved for future profiles)

    mouth_open: [{ id: 'ParamMouthOpenY', scale: 1 }],
  };
}

