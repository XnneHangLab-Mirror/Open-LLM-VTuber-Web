import {
  LOGICAL_CHANNELS,
  LogicalChannel,
  PoseFrame,
  PoseValues,
} from '@/live2d/mixer/logical-channels';

export interface PoseLayer {
  id: string;
  weight: number;
  frame: PoseFrame | null;

  // Reserved for future extensions (mask / priority / blend mode).
  enabled?: boolean;
  priority?: number;
  blendMode?: 'weighted';
  mask?: Partial<Record<LogicalChannel, number>>;
}

export interface MixerApplyOptions {
  mouthOpen?: {
    preferLayerId?: string;
  };
}

export class Mixer {
  private readonly mouthOpenPreferLayerId: string;

  constructor(options: MixerApplyOptions = {}) {
    this.mouthOpenPreferLayerId = options.mouthOpen?.preferLayerId ?? 'speech_layer';
  }

  /**
   * Blend multiple layers into a final (partial) pose.
   * - Missing channels are allowed
   * - First version: weighted average blend
   */
  public apply(layers: PoseLayer[]): PoseValues {
    const activeLayers = layers.filter((layer) => {
      if (layer.enabled === false) {
        return false;
      }
      if (!layer.frame) {
        return false;
      }
      return Number.isFinite(layer.weight) && layer.weight > 0;
    });

    const finalPose: PoseValues = {};

    LOGICAL_CHANNELS.forEach((channel) => {
      let weightedSum = 0;
      let weightSum = 0;

      activeLayers.forEach((layer) => {
        const value = layer.frame?.values?.[channel];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return;
        }

        const channelMask = layer.mask?.[channel];
        const channelWeightMultiplier = typeof channelMask === 'number' && Number.isFinite(channelMask)
          ? channelMask
          : 1;

        const effectiveWeight = layer.weight * channelWeightMultiplier;
        if (effectiveWeight <= 0) {
          return;
        }

        weightedSum += value * effectiveWeight;
        weightSum += effectiveWeight;
      });

      if (weightSum > 0) {
        finalPose[channel] = weightedSum / weightSum;
      }
    });

    // Special-case: mouth should prefer speech layer when present.
    const preferredLayer = activeLayers.find((layer) => layer.id === this.mouthOpenPreferLayerId);
    const preferredMouthOpen = preferredLayer?.frame?.values?.mouth_open;
    if (typeof preferredMouthOpen === 'number' && Number.isFinite(preferredMouthOpen)) {
      finalPose.mouth_open = preferredMouthOpen;
    }

    return finalPose;
  }
}

