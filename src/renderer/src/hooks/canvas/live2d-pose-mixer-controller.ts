import {
  getDefaultLive2DParameterProfile,
  Live2DParameterApplyMode,
  Live2DParameterProfile,
} from '@/live2d/mixer/live2d-parameter-profile';
import { LogicalChannel, PoseValues } from '@/live2d/mixer/logical-channels';
import { IdleBankConfig, RecordedIdleDriver } from '@/live2d/mixer/recorded-idle-driver';
import { Mixer, PoseLayer } from '@/live2d/mixer/pose-mixer';

interface PatchedModel {
  _poseMixerController?: {
    controller: Live2DPoseMixerController;
    originalUpdate: () => void;
  };
  setDragging?: (x: number, y: number) => void;
  _model?: {
    addParameterValueById: (id: unknown, value: number, weight?: number) => void;
    setParameterValueById: (id: unknown, value: number, weight?: number) => void;
    update: () => void;
  };
  update: () => void;
}

export type PoseLayerId = 'idle_layer' | 'speech_layer' | 'backend_pose_layer' | 'mouse_attention_layer';

interface LayerState {
  weight: number;
  values: PoseValues;
}

const DEFAULT_LAYER_WEIGHTS: Record<PoseLayerId, number> = {
  idle_layer: 1,
  speech_layer: 1,
  backend_pose_layer: 1,
  mouse_attention_layer: 0.35,
};

const ORIENTATION_CHANNELS: LogicalChannel[] = [
  'head_yaw',
  'head_pitch',
  'head_roll',
  'body_yaw',
  'gaze_x',
  'gaze_y',
];

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

  private modelUrl?: string;

  private layers: Record<PoseLayerId, LayerState> = {
    idle_layer: { weight: DEFAULT_LAYER_WEIGHTS.idle_layer, values: {} },
    speech_layer: { weight: DEFAULT_LAYER_WEIGHTS.speech_layer, values: {} },
    backend_pose_layer: { weight: DEFAULT_LAYER_WEIGHTS.backend_pose_layer, values: {} },
    mouse_attention_layer: { weight: DEFAULT_LAYER_WEIGHTS.mouse_attention_layer, values: {} },
  };

  private readonly recordedIdleDriver = new RecordedIdleDriver((pose) => {
    this.setIdlePose(pose);
  });

  private lastFinalPose: PoseValues = {};

  private getMouseAttentionDragInput(): { x: number; y: number } {
    const layer = this.layers.mouse_attention_layer;
    const layerWeight = layer?.weight;
    if (!layer || typeof layerWeight !== 'number' || !Number.isFinite(layerWeight) || layerWeight <= 0) {
      return { x: 0, y: 0 };
    }

    const values = layer.values ?? {};
    const rawX = [values.gaze_x, values.head_yaw, values.body_yaw]
      .find((value) => typeof value === 'number' && Number.isFinite(value));
    const rawY = [values.gaze_y, values.head_pitch]
      .find((value) => typeof value === 'number' && Number.isFinite(value));

    // Respect mixer weight amplitude for drag compatibility path:
    // - weight = 0   => no mouse-attention drag
    // - weight = 0.5 => half-strength drag
    // - weight = 1   => full-strength drag
    const x = typeof rawX === 'number' ? clamp(rawX * layerWeight, -1, 1) : 0;
    const y = typeof rawY === 'number' ? clamp(rawY * layerWeight, -1, 1) : 0;
    return { x, y };
  }

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

  public setMouseAttentionPose(values: PoseValues, weight?: number): void {
    this.setLayerPose('mouse_attention_layer', values, weight);
  }

  public clearMouseAttention(): void {
    this.clearLayerPose('mouse_attention_layer');
  }

  public setLayerWeight(layerId: PoseLayerId, weight: number): void {
    if (!Number.isFinite(weight) || weight < 0) {
      return;
    }
    this.layers[layerId] = {
      ...this.layers[layerId],
      weight,
    };
    this.refreshFinalPoseSnapshot();
  }

  public patchLayerWeights(weights: Partial<Record<PoseLayerId, number>>): void {
    let changed = false;
    (Object.keys(weights) as PoseLayerId[]).forEach((layerId) => {
      const weight = weights[layerId];
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        return;
      }
      this.layers[layerId] = {
        ...this.layers[layerId],
        weight,
      };
      changed = true;
    });

    if (changed) {
      this.refreshFinalPoseSnapshot();
    }
  }

  public resetLayerWeights(): void {
    (Object.keys(DEFAULT_LAYER_WEIGHTS) as PoseLayerId[]).forEach((layerId) => {
      this.layers[layerId] = {
        ...this.layers[layerId],
        weight: DEFAULT_LAYER_WEIGHTS[layerId],
      };
    });
    this.refreshFinalPoseSnapshot();
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

  public setModelUrl(modelUrl?: string): void {
    this.modelUrl = modelUrl;
    this.recordedIdleDriver.setModelUrl(modelUrl);
  }

  public setRecordedIdleBank(bank: IdleBankConfig | null): void {
    this.recordedIdleDriver.setIdleBank(bank);
  }

  public clearRecordedIdleBank(): void {
    this.recordedIdleDriver.clearIdleBank();
  }

  public getRecordedIdleState() {
    return this.recordedIdleDriver.getDebugState();
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
      mouse_attention_layer: {
        weight: this.layers.mouse_attention_layer.weight,
        values: { ...this.layers.mouse_attention_layer.values },
      },
    };
  }

  public getFinalMixedPose(): PoseValues {
    return { ...this.lastFinalPose };
  }

  public getDebugState() {
    return {
      modelUrl: this.modelUrl ?? null,
      layers: this.getLayerStates(),
      finalPose: this.getFinalMixedPose(),
      profile: this.getProfile(),
      recordedIdle: this.getRecordedIdleState(),
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

    // Disable SDK built-in drag parameter injection; mouse attention is now a mixer layer.
    const manager = (window as any).LAppLive2DManager?.getInstance?.();
    manager?.setDragInputEnabled?.(false);

    model.update = () => {
      const runner = model._poseMixerController;
      const dragInput = this.getMouseAttentionDragInput();
      model.setDragging?.(dragInput.x, dragInput.y);
      runner?.originalUpdate();
      this.recordedIdleDriver.update(performance.now() * 0.001);

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
      setMouseAttentionPose: (pose: PoseValues, weight?: number) => this.setMouseAttentionPose(pose, weight),
      clearMouseAttention: () => this.clearMouseAttention(),
      setLayerWeight: (layerId: PoseLayerId, weight: number) => this.setLayerWeight(layerId, weight),
      patchLayerWeights: (weights: Partial<Record<PoseLayerId, number>>) => this.patchLayerWeights(weights),
      resetLayerWeights: () => this.resetLayerWeights(),
      setSpeechMouthOpen: (value: number, weight?: number) => this.setSpeechMouthOpen(value, weight),
      clearSpeech: () => this.clearSpeech(),
      setIdlePose: (pose: PoseValues, weight?: number) => this.setIdlePose(pose, weight),
      clearIdlePose: () => this.clearIdlePose(),
      clearAllLayers: () => {
        this.clearIdlePose();
        this.clearSpeech();
        this.clearBackendPose();
        this.clearMouseAttention();
      },
      getLayers: () => this.getLayerStates(),
      getFinalPose: () => this.getFinalMixedPose(),
      getDebugState: () => this.getDebugState(),
      getRecordedIdleState: () => this.getRecordedIdleState(),
      setRecordedIdleBank: (bank: IdleBankConfig | null) => this.setRecordedIdleBank(bank),
      clearRecordedIdleBank: () => this.clearRecordedIdleBank(),
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
      {
        id: 'mouse_attention_layer',
        weight: this.layers.mouse_attention_layer.weight,
        frame: isEmptyPose(this.layers.mouse_attention_layer.values) ? null : { values: this.layers.mouse_attention_layer.values },
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
    const finalPose: PoseValues = { ...this.lastFinalPose };

    const isMouseOnlyMode = this.layers.mouse_attention_layer.weight > 0
      && this.layers.idle_layer.weight <= 0
      && this.layers.speech_layer.weight <= 0
      && this.layers.backend_pose_layer.weight <= 0;

    if (isMouseOnlyMode) {
      ORIENTATION_CHANNELS.forEach((channel) => {
        const value = finalPose[channel];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          // Mouse-only mode should still pin orientation channels to neutral 0
          // when pointer data is temporarily unavailable, to avoid inheriting
          // stale orientation from legacy motions/previous frames.
          finalPose[channel] = 0;
        }
      });
    }

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
