import {
  getDefaultLive2DParameterProfile,
  Live2DParameterApplyMode,
  Live2DParameterProfile,
} from '@/live2d/mixer/live2d-parameter-profile';
import { LogicalChannel, PoseValues } from '@/live2d/mixer/logical-channels';
import { Mixer, PoseLayer } from '@/live2d/mixer/pose-mixer';

interface PatchedModel {
  _poseMixerController?: {
    controller: Live2DPoseMixerController;
    originalUpdate: () => void;
  };
  _model?: {
    addParameterValueById: (id: unknown, value: number, weight?: number) => void;
    setParameterValueById: (id: unknown, value: number, weight?: number) => void;
    update: () => void;
  };
  update: () => void;
}

export type PoseLayerId = 'idle_layer' | 'speech_layer' | 'backend_pose_layer';

interface LayerState {
  weight: number;
  values: PoseValues;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitizeChannelValue(channel: LogicalChannel, value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (channel === 'mouth_open') {
    return clamp(value, 0, 1);
  }

  return clamp(value, -1, 1);
}

function isEmptyPose(values: PoseValues): boolean {
  return Object.keys(values).length === 0;
}

export class Live2DPoseMixerController {
  private readonly mixer = new Mixer({ mouthOpen: { preferLayerId: 'speech_layer' } });

  private profile: Live2DParameterProfile = getDefaultLive2DParameterProfile();

  private layers: Record<PoseLayerId, LayerState> = {
    idle_layer: { weight: 1, values: {} },
    speech_layer: { weight: 1, values: {} },
    backend_pose_layer: { weight: 1, values: {} },
  };

  private lastFinalPose: PoseValues = {};

  /**
   * Replace the entire pose for a layer (partial poses are allowed).
   */
  public setLayerPose(layerId: PoseLayerId, values: PoseValues, weight?: number): void {
    this.layers[layerId] = {
      weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : this.layers[layerId].weight,
      values: { ...values },
    };
    this.refreshFinalPoseSnapshot();
  }

  /**
   * Merge a partial pose into an existing layer.
   * Useful for backends that stream only changed channels.
   */
  public patchLayerPose(layerId: PoseLayerId, values: PoseValues, weight?: number): void {
    const nextWeight = typeof weight === 'number' && Number.isFinite(weight) ? weight : this.layers[layerId].weight;
    this.layers[layerId] = {
      weight: nextWeight,
      values: { ...this.layers[layerId].values, ...values },
    };
    this.refreshFinalPoseSnapshot();
  }

  public clearLayerPose(layerId: PoseLayerId): void {
    this.layers[layerId] = {
      ...this.layers[layerId],
      values: {},
    };
    this.refreshFinalPoseSnapshot();
  }

  public setBackendPose(values: PoseValues, weight?: number): void {
    this.setLayerPose('backend_pose_layer', values, weight);
  }

  public patchBackendPose(values: PoseValues, weight?: number): void {
    this.patchLayerPose('backend_pose_layer', values, weight);
  }

  public clearBackendPose(): void {
    this.clearLayerPose('backend_pose_layer');
  }

  public setSpeechMouthOpen(mouthOpen: number, weight?: number): void {
    this.patchLayerPose('speech_layer', { mouth_open: mouthOpen }, weight);
  }

  public clearSpeech(): void {
    this.clearLayerPose('speech_layer');
  }

  public setIdlePose(values: PoseValues, weight?: number): void {
    this.setLayerPose('idle_layer', values, weight);
  }

  public clearIdlePose(): void {
    this.clearLayerPose('idle_layer');
  }

  public setProfile(profile: Live2DParameterProfile): void {
    this.profile = profile;
    this.refreshFinalPoseSnapshot();
  }

  public getProfile(): Live2DParameterProfile {
    return this.profile;
  }

  public getLayerStates(): Record<PoseLayerId, LayerState> {
    return {
      idle_layer: {
        weight: this.layers.idle_layer.weight,
        values: { ...this.layers.idle_layer.values },
      },
      speech_layer: {
        weight: this.layers.speech_layer.weight,
        values: { ...this.layers.speech_layer.values },
      },
      backend_pose_layer: {
        weight: this.layers.backend_pose_layer.weight,
        values: { ...this.layers.backend_pose_layer.values },
      },
    };
  }

  public getFinalMixedPose(): PoseValues {
    return { ...this.lastFinalPose };
  }

  public getDebugState() {
    return {
      layers: this.getLayerStates(),
      finalPose: this.getFinalMixedPose(),
      profile: this.getProfile(),
    };
  }

  /**
   * Install a post-update runner that applies the mixed pose via Live2D parameter IDs.
   *
   * Ordering note:
   * - This is designed to coexist with the existing expression/motion system.
   * - It runs after the underlying Live2D update (and any other wrappers that were installed earlier).
   */
  public installRunner(lappAdapter: any): boolean {
    const model = lappAdapter?.getModel?.() as PatchedModel | null | undefined;
    if (!model || !model._model || typeof model.update !== 'function') {
      return false;
    }

    const existingRunner = model._poseMixerController;
    if (existingRunner?.controller === this) {
      return true;
    }

    const originalUpdate = existingRunner?.originalUpdate ?? model.update.bind(model);
    model._poseMixerController = {
      controller: this,
      originalUpdate,
    };

    model.update = () => {
      const runner = model._poseMixerController;
      runner?.originalUpdate();

      const appliedAnyPose = this.applyMixedPose(model, lappAdapter);
      if (appliedAnyPose) {
        model._model?.update();
      }
    };

    return true;
  }

  public installDebugGlobals(): void {
    const w = window as any;

    const debugApi = {
      setBackendPose: (pose: PoseValues, weight?: number) => this.setBackendPose(pose, weight),
      patchBackendPose: (pose: PoseValues, weight?: number) => this.patchBackendPose(pose, weight),
      clearBackendPose: () => this.clearBackendPose(),
      setSpeechMouthOpen: (value: number, weight?: number) => this.setSpeechMouthOpen(value, weight),
      clearSpeech: () => this.clearSpeech(),
      setIdlePose: (pose: PoseValues, weight?: number) => this.setIdlePose(pose, weight),
      clearIdlePose: () => this.clearIdlePose(),
      clearAllLayers: () => {
        this.clearIdlePose();
        this.clearSpeech();
        this.clearBackendPose();
      },
      getLayers: () => this.getLayerStates(),
      getFinalPose: () => this.getFinalMixedPose(),
      getDebugState: () => this.getDebugState(),
      inspect: () => {
        const debugState = this.getDebugState();
        console.log('[Live2DPoseMixer] debug state', debugState);
        return debugState;
      },
      getProfile: () => this.getProfile(),
      setProfile: (profile: Live2DParameterProfile) => this.setProfile(profile),
    };

    w.Live2DPoseMixer = debugApi;
    w.Live2DPoseMixerDebug = debugApi;
  }

  private getActiveLayers(): PoseLayer[] {
    const layers: PoseLayer[] = [
      {
        id: 'idle_layer',
        weight: this.layers.idle_layer.weight,
        frame: isEmptyPose(this.layers.idle_layer.values) ? null : { values: this.layers.idle_layer.values },
      },
      {
        id: 'speech_layer',
        weight: this.layers.speech_layer.weight,
        frame: isEmptyPose(this.layers.speech_layer.values) ? null : { values: this.layers.speech_layer.values },
      },
      {
        id: 'backend_pose_layer',
        weight: this.layers.backend_pose_layer.weight,
        frame: isEmptyPose(this.layers.backend_pose_layer.values) ? null : { values: this.layers.backend_pose_layer.values },
      },
    ];

    return layers;
  }

  private refreshFinalPoseSnapshot(): void {
    this.lastFinalPose = this.mixer.apply(this.getActiveLayers());
  }

  private applyParameterByMode(
    model: PatchedModel,
    parameterId: unknown,
    value: number,
    applyMode: Live2DParameterApplyMode,
  ): void {
    if (applyMode === 'add' && model._model?.addParameterValueById) {
      model._model.addParameterValueById(parameterId, value, 1);
      return;
    }

    model._model?.setParameterValueById(parameterId, value, 1);
  }

  private applyMixedPose(model: PatchedModel, lappAdapter: any): boolean {
    const idManager = lappAdapter.getIdManager?.();
    if (!idManager?.getId) {
      return false;
    }

    // Mixer owns long-lived head/eye/body orientation channels.
    // Future drag/mouse-attention/event layers should enter here as additional layers.
    this.refreshFinalPoseSnapshot();
    const finalPose = this.lastFinalPose;
    const poseChannels = Object.keys(finalPose) as LogicalChannel[];
    if (poseChannels.length === 0) {
      return false;
    }

    let appliedAny = false;

    poseChannels.forEach((channel) => {
      const rawValue = finalPose[channel];
      if (typeof rawValue !== 'number') {
        return;
      }

      const sanitizedValue = sanitizeChannelValue(channel, rawValue);
      if (sanitizedValue === null) {
        return;
      }

      const targets = this.profile[channel];
      if (!targets || targets.length === 0) {
        return;
      }

      targets.forEach((target) => {
        if (!target?.id || typeof target.scale !== 'number' || !Number.isFinite(target.scale)) {
          return;
        }

        const parameterId = idManager.getId(target.id);
        const applyMode = target.applyMode ?? 'set';
        this.applyParameterByMode(model, parameterId, sanitizedValue * target.scale, applyMode);
        appliedAny = true;
      });
    });

    return appliedAny;
  }
}

const live2DPoseMixerController = new Live2DPoseMixerController();

export function getLive2DPoseMixerController(): Live2DPoseMixerController {
  return live2DPoseMixerController;
}
