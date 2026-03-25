import { LogicalChannel, PoseValues } from '@/live2d/mixer/logical-channels';

export type IdlePlaybackMode = 'random' | 'random_no_repeat';

export interface IdleBankClip {
  id?: string;
  url: string;
  weight?: number;
}

export interface IdleBankConfig {
  clips: IdleBankClip[];
  mode?: IdlePlaybackMode;
}

type MotionSegmentType = 0 | 1 | 2 | 3;

interface Motion3Meta {
  Duration?: number;
  Loop?: boolean;
}

interface Motion3Curve {
  Target?: string;
  Id?: string;
  Segments?: number[];
}

interface Motion3File {
  Meta?: Motion3Meta;
  Curves?: Motion3Curve[];
}

interface MotionKeyframe {
  timeSeconds: number;
  value: number;
}

interface ParsedIdleClip {
  sourceUrl: string;
  durationSeconds: number;
  loop: boolean;
  channelCurves: Partial<Record<LogicalChannel, MotionKeyframe[]>>;
}

interface MotionParameterToChannel {
  channel: LogicalChannel;
  normalizeScale: number;
  priority?: number;
}

const MOTION_PARAMETER_CHANNEL_MAP: Record<string, MotionParameterToChannel> = {
  ParamAngleX: { channel: 'head_yaw', normalizeScale: 30 },
  ParamAngleX2: { channel: 'head_yaw', normalizeScale: 30 },
  ParamAngleX3: { channel: 'head_yaw', normalizeScale: 30 },
  ParamAngleY: { channel: 'head_pitch', normalizeScale: 30 },
  ParamAngleY2: { channel: 'head_pitch', normalizeScale: 30 },
  ParamAngleY3: { channel: 'head_pitch', normalizeScale: 30 },
  ParamAngleZ: { channel: 'head_roll', normalizeScale: 30 },
  ParamAngleZ2: { channel: 'head_roll', normalizeScale: 30 },
  ParamBodyAngleX: { channel: 'body_yaw', normalizeScale: 10, priority: 0 },
  ParamBodyAngleY: { channel: 'body_pitch', normalizeScale: 10, priority: 0 },
  ParamBodyAngleZ: { channel: 'body_roll', normalizeScale: 10, priority: 0 },
  bodyX: { channel: 'body_yaw', normalizeScale: 30, priority: 1 },
  bodyX2: { channel: 'body_yaw', normalizeScale: 30, priority: 2 },
  bodyX3: { channel: 'body_yaw', normalizeScale: 30, priority: 2 },
  bodyY: { channel: 'body_pitch', normalizeScale: 30, priority: 1 },
  bodyZ: { channel: 'body_roll', normalizeScale: 30, priority: 1 },
  bodyZ2: { channel: 'body_roll', normalizeScale: 30, priority: 2 },
  bodyZZ: { channel: 'body_roll', normalizeScale: 30, priority: 2 },
  bodyZZ2: { channel: 'body_roll', normalizeScale: 30, priority: 2 },
  ParamEyeBallX: { channel: 'gaze_x', normalizeScale: 1 },
  ParamEyeBallY: { channel: 'gaze_y', normalizeScale: 1 },
  ParamMouthOpenY: { channel: 'mouth_open', normalizeScale: 1 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeMotionSegmentType(value: number): MotionSegmentType | null {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }
  return null;
}

function parseCurveKeyframes(segments: number[] | undefined): MotionKeyframe[] {
  if (!segments || segments.length < 2) {
    return [];
  }

  const keyframes: MotionKeyframe[] = [];
  const startTime = segments[0];
  const startValue = segments[1];
  if (Number.isFinite(startTime) && Number.isFinite(startValue)) {
    keyframes.push({
      timeSeconds: startTime,
      value: startValue,
    });
  }

  let cursor = 2;
  while (cursor < segments.length) {
    const segmentType = normalizeMotionSegmentType(segments[cursor]);
    if (segmentType === null) {
      break;
    }
    cursor += 1;

    let endTime = Number.NaN;
    let endValue = Number.NaN;

    switch (segmentType) {
      case 0: {
        // Linear: [type, time, value]
        if (cursor + 1 >= segments.length) {
          return keyframes;
        }
        endTime = segments[cursor];
        endValue = segments[cursor + 1];
        cursor += 2;
        break;
      }
      case 1: {
        // Bezier (restricted or unrestricted): [type, c1t, c1v, c2t, c2v, endT, endV]
        if (cursor + 5 >= segments.length) {
          return keyframes;
        }
        endTime = segments[cursor + 4];
        endValue = segments[cursor + 5];
        cursor += 6;
        break;
      }
      case 2:
      case 3: {
        // Stepped / inverse stepped: [type, time, value]
        if (cursor + 1 >= segments.length) {
          return keyframes;
        }
        endTime = segments[cursor];
        endValue = segments[cursor + 1];
        cursor += 2;
        break;
      }
      default:
        return keyframes;
    }

    if (!Number.isFinite(endTime) || !Number.isFinite(endValue)) {
      continue;
    }

    if (keyframes.length > 0 && endTime < keyframes[keyframes.length - 1].timeSeconds) {
      continue;
    }

    keyframes.push({
      timeSeconds: endTime,
      value: endValue,
    });
  }

  return keyframes;
}

function sampleCurveValueAtTime(curve: MotionKeyframe[], timeSeconds: number): number {
  if (curve.length === 0) {
    return 0;
  }

  if (timeSeconds <= curve[0].timeSeconds) {
    return curve[0].value;
  }

  const last = curve[curve.length - 1];
  if (timeSeconds >= last.timeSeconds) {
    return last.value;
  }

  let left = 0;
  let right = curve.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midTime = curve[mid].timeSeconds;
    if (midTime === timeSeconds) {
      return curve[mid].value;
    }
    if (midTime < timeSeconds) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const nextIndex = clamp(left, 1, curve.length - 1);
  const prevIndex = nextIndex - 1;
  const prev = curve[prevIndex];
  const next = curve[nextIndex];
  const duration = next.timeSeconds - prev.timeSeconds;
  if (duration <= 0) {
    return next.value;
  }

  const t = (timeSeconds - prev.timeSeconds) / duration;
  return prev.value + (next.value - prev.value) * t;
}

function getCurveRange(curve: MotionKeyframe[]): number {
  if (curve.length === 0) {
    return 0;
  }

  let minValue = curve[0].value;
  let maxValue = curve[0].value;
  for (let index = 1; index < curve.length; index += 1) {
    const value = curve[index].value;
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
  }
  return maxValue - minValue;
}

function parseMotion3Clip(sourceUrl: string, data: Motion3File): ParsedIdleClip | null {
  const durationSeconds = Number.isFinite(data.Meta?.Duration) ? Number(data.Meta?.Duration) : 0;
  if (durationSeconds <= 0) {
    return null;
  }

  const channelCurves: Partial<Record<LogicalChannel, MotionKeyframe[]>> = {};
  const channelCurveMeta: Partial<Record<LogicalChannel, { priority: number; range: number; keyCount: number }>> = {};

  (data.Curves ?? []).forEach((curve) => {
    if (curve.Target !== 'Parameter' || typeof curve.Id !== 'string') {
      return;
    }

    const mapping = MOTION_PARAMETER_CHANNEL_MAP[curve.Id];
    if (!mapping) {
      return;
    }

    const keyframes = parseCurveKeyframes(curve.Segments);
    if (keyframes.length === 0) {
      return;
    }

    const normalized = keyframes.map((point) => ({
      timeSeconds: point.timeSeconds,
      value: point.value / mapping.normalizeScale,
    }));

    const nextPriority = mapping.priority ?? 0;
    const nextRange = getCurveRange(normalized);
    const nextKeyCount = normalized.length;
    const existing = channelCurves[mapping.channel];
    const existingMeta = channelCurveMeta[mapping.channel];
    if (!existing) {
      channelCurves[mapping.channel] = normalized;
      channelCurveMeta[mapping.channel] = {
        priority: nextPriority,
        range: nextRange,
        keyCount: nextKeyCount,
      };
      return;
    }

    const shouldReplace = !existingMeta
      || nextPriority < existingMeta.priority
      || (nextPriority === existingMeta.priority
        && (nextRange > existingMeta.range
          || (Math.abs(nextRange - existingMeta.range) <= 1e-6 && nextKeyCount > existingMeta.keyCount)));
    if (shouldReplace) {
      channelCurves[mapping.channel] = normalized;
      channelCurveMeta[mapping.channel] = {
        priority: nextPriority,
        range: nextRange,
        keyCount: nextKeyCount,
      };
    }
  });

  if (Object.keys(channelCurves).length === 0) {
    return null;
  }

  return {
    sourceUrl,
    durationSeconds,
    loop: data.Meta?.Loop === true,
    channelCurves,
  };
}

function toAbsoluteUrl(pathOrUrl: string, modelUrl?: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return trimmed;
  }

  try {
    if (modelUrl) {
      return new URL(trimmed, modelUrl).toString();
    }
    return new URL(trimmed, window.location.href).toString();
  } catch {
    return trimmed;
  }
}

function sanitizeClip(clip: IdleBankClip): IdleBankClip | null {
  const normalizedUrl = typeof clip.url === 'string' ? clip.url.trim() : '';
  if (!normalizedUrl) {
    return null;
  }

  const normalizedWeight = typeof clip.weight === 'number' && Number.isFinite(clip.weight)
    ? Math.max(0, clip.weight)
    : undefined;

  return {
    id: typeof clip.id === 'string' && clip.id.trim() ? clip.id.trim() : undefined,
    url: normalizedUrl,
    weight: normalizedWeight,
  };
}

export function normalizeIdleBankConfig(input: IdleBankConfig | null | undefined): IdleBankConfig | null {
  if (!input || !Array.isArray(input.clips)) {
    return null;
  }

  const clips = input.clips
    .map((clip) => sanitizeClip(clip))
    .filter((clip): clip is IdleBankClip => clip !== null);

  if (clips.length === 0) {
    return null;
  }

  const mode = input.mode === 'random' || input.mode === 'random_no_repeat'
    ? input.mode
    : 'random_no_repeat';

  return {
    clips,
    mode,
  };
}

export class RecordedIdleDriver {
  private readonly clipCache = new Map<string, Promise<ParsedIdleClip | null>>();

  private modelUrl?: string;

  private bank: IdleBankConfig | null = null;

  private isLoading = false;

  private activeClip: ParsedIdleClip | null = null;

  private activeClipIndex = -1;

  private previousClipIndex = -1;

  private activeClipStartTimeSeconds = 0;

  private requestToken = 0;

  private latestPose: PoseValues = {};

  constructor(private readonly onPose: (pose: PoseValues) => void) {}

  public setModelUrl(modelUrl?: string): void {
    if (this.modelUrl === modelUrl) {
      return;
    }

    this.modelUrl = modelUrl;
    this.resetPlaybackState();
  }

  public setIdleBank(bank: IdleBankConfig | null): void {
    const normalized = normalizeIdleBankConfig(bank);
    this.bank = normalized;
    this.resetPlaybackState();

    if (!this.bank) {
      this.pushPose({});
    }
  }

  public clearIdleBank(): void {
    this.bank = null;
    this.resetPlaybackState();
    this.pushPose({});
  }

  public update(nowSeconds: number): void {
    if (!this.bank || this.bank.clips.length === 0) {
      return;
    }

    if (!Number.isFinite(nowSeconds)) {
      return;
    }

    if (!this.activeClip) {
      if (!this.isLoading) {
        void this.selectNextClip(nowSeconds);
      }
      return;
    }

    const duration = Math.max(0.001, this.activeClip.durationSeconds);
    const elapsed = nowSeconds - this.activeClipStartTimeSeconds;
    if (elapsed >= duration) {
      if (this.bank.clips.length === 1 && this.activeClip.loop) {
        this.activeClipStartTimeSeconds = nowSeconds;
      } else {
        void this.selectNextClip(nowSeconds);
        return;
      }
    }

    const boundedElapsed = this.activeClip
      ? Math.min(Math.max(0, nowSeconds - this.activeClipStartTimeSeconds), this.activeClip.durationSeconds)
      : 0;
    const pose = this.activeClip ? this.samplePose(this.activeClip, boundedElapsed) : {};
    this.pushPose(pose);
  }

  public getDebugState() {
    const clip = this.bank?.clips[this.activeClipIndex];
    return {
      hasBank: Boolean(this.bank),
      mode: this.bank?.mode ?? null,
      clipCount: this.bank?.clips.length ?? 0,
      isLoading: this.isLoading,
      modelUrl: this.modelUrl ?? null,
      activeClipIndex: this.activeClipIndex,
      activeClipId: clip?.id ?? null,
      activeClipUrl: clip?.url ?? null,
      activeClipResolvedUrl: this.activeClip?.sourceUrl ?? null,
      activeClipDurationSeconds: this.activeClip?.durationSeconds ?? null,
      latestPose: { ...this.latestPose },
    };
  }

  private resetPlaybackState(): void {
    this.requestToken += 1;
    this.isLoading = false;
    this.activeClip = null;
    this.activeClipIndex = -1;
    this.activeClipStartTimeSeconds = 0;
  }

  private pushPose(pose: PoseValues): void {
    this.latestPose = { ...pose };
    this.onPose(this.latestPose);
  }

  private samplePose(clip: ParsedIdleClip, elapsedSeconds: number): PoseValues {
    const pose: PoseValues = {};

    (Object.keys(clip.channelCurves) as LogicalChannel[]).forEach((channel) => {
      const curve = clip.channelCurves[channel];
      if (!curve || curve.length === 0) {
        return;
      }

      pose[channel] = sampleCurveValueAtTime(curve, elapsedSeconds);
    });

    return pose;
  }

  private pickWeightedRandomIndex(candidateIndexes: number[]): number {
    if (!this.bank || candidateIndexes.length === 0) {
      return -1;
    }

    const weighted = candidateIndexes.map((index) => {
      const weight = this.bank?.clips[index]?.weight;
      const normalized = typeof weight === 'number' && Number.isFinite(weight) ? Math.max(0, weight) : 1;
      return { index, weight: normalized };
    });

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      const randomIndex = Math.floor(Math.random() * candidateIndexes.length);
      return candidateIndexes[randomIndex];
    }

    let cursor = Math.random() * totalWeight;
    for (let i = 0; i < weighted.length; i += 1) {
      cursor -= weighted[i].weight;
      if (cursor <= 0) {
        return weighted[i].index;
      }
    }

    return weighted[weighted.length - 1].index;
  }

  private pickNextClipIndex(): number {
    if (!this.bank || this.bank.clips.length === 0) {
      return -1;
    }

    const clipCount = this.bank.clips.length;
    const allIndexes = Array.from({ length: clipCount }, (_, index) => index);
    const mode = this.bank.mode ?? 'random_no_repeat';

    if (mode === 'random_no_repeat' && clipCount > 1 && this.previousClipIndex >= 0) {
      const withoutPrevious = allIndexes.filter((index) => index !== this.previousClipIndex);
      return this.pickWeightedRandomIndex(withoutPrevious);
    }

    return this.pickWeightedRandomIndex(allIndexes);
  }

  private async selectNextClip(nowSeconds: number): Promise<void> {
    if (!this.bank || this.bank.clips.length === 0) {
      return;
    }

    const nextIndex = this.pickNextClipIndex();
    if (nextIndex < 0) {
      return;
    }

    const selectedClip = this.bank.clips[nextIndex];
    const resolvedUrl = toAbsoluteUrl(selectedClip.url, this.modelUrl);
    if (!resolvedUrl) {
      return;
    }

    this.isLoading = true;
    const token = ++this.requestToken;

    const parsedClip = await this.loadClip(resolvedUrl);
    if (token !== this.requestToken) {
      return;
    }

    this.isLoading = false;

    if (!parsedClip) {
      return;
    }

    this.previousClipIndex = nextIndex;
    this.activeClipIndex = nextIndex;
    this.activeClip = parsedClip;
    this.activeClipStartTimeSeconds = nowSeconds;
    this.pushPose(this.samplePose(parsedClip, 0));
  }

  private async loadClip(resolvedUrl: string): Promise<ParsedIdleClip | null> {
    const cached = this.clipCache.get(resolvedUrl);
    if (cached) {
      return cached;
    }

    const loader = (async () => {
      try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch idle clip: ${response.status}`);
        }

        const motion3 = await response.json() as Motion3File;
        const parsed = parseMotion3Clip(resolvedUrl, motion3);
        return parsed;
      } catch (error) {
        console.warn('[RecordedIdleDriver] failed to load idle clip:', resolvedUrl, error);
        return null;
      }
    })();

    this.clipCache.set(resolvedUrl, loader);
    return loader;
  }
}
