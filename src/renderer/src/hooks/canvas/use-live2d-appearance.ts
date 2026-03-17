import { useEffect, useRef } from 'react';
import { ModelInfo } from '@/context/live2d-config-context';

type ExpressionBlend = 'Add' | 'Multiply' | 'Overwrite';

interface ExpressionReference {
  Name?: string;
  File?: string;
}

interface ExpressionParameter {
  Id?: string;
  Value?: number;
  Blend?: string;
}

interface ExpressionFile {
  Parameters?: ExpressionParameter[];
}

interface Model3File {
  FileReferences?: {
    Expressions?: ExpressionReference[];
  };
}

interface AppearanceOperation {
  id: string;
  value: number;
  blend: ExpressionBlend;
}

interface AppearancePatch {
  expressionName: string;
  operations: AppearanceOperation[];
}

interface PatchedModel {
  _appearancePatchController?: {
    getPatches: () => AppearancePatch[];
  };
  _model?: {
    addParameterValueById: (id: unknown, value: number, weight?: number) => void;
    multiplyParameterValueById: (id: unknown, value: number, weight?: number) => void;
    setParameterValueById: (id: unknown, value: number, weight?: number) => void;
    update: () => void;
  };
  update: () => void;
}

const expressionFileMapCache = new Map<string, Promise<Map<string, string>>>();
const appearancePatchCache = new Map<string, Promise<AppearancePatch>>();

function normalizeBlend(blend: string | undefined): ExpressionBlend {
  if (blend === 'Add' || blend === 'Multiply' || blend === 'Overwrite') {
    return blend;
  }
  return 'Overwrite';
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function resolveAssetUrl(modelUrl: string, relativePath: string): string {
  return new URL(relativePath, modelUrl).toString();
}

function getExpressionFileMap(modelUrl: string): Promise<Map<string, string>> {
  const cached = expressionFileMapCache.get(modelUrl);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    const model3 = await fetchJson<Model3File>(modelUrl);
    const expressions = model3.FileReferences?.Expressions ?? [];
    const expressionFileMap = new Map<string, string>();

    expressions.forEach((expression) => {
      if (expression.Name && expression.File) {
        expressionFileMap.set(expression.Name, resolveAssetUrl(modelUrl, expression.File));
      }
    });

    return expressionFileMap;
  })();

  expressionFileMapCache.set(modelUrl, loader);
  return loader;
}

async function resolveAppearancePatch(
  modelInfo: ModelInfo,
  expressionName: string,
): Promise<AppearancePatch | null> {
  const expressionFileMap = await getExpressionFileMap(modelInfo.url);
  const fileUrl = expressionFileMap.get(expressionName);
  if (!fileUrl) {
    return null;
  }

  const cacheKey = `${modelInfo.url}::${expressionName}`;
  const cached = appearancePatchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    const expressionFile = await fetchJson<ExpressionFile>(fileUrl);
    return {
      expressionName,
      operations: (expressionFile.Parameters ?? [])
        .filter((parameter): parameter is ExpressionParameter & { Id: string; Value: number } =>
          typeof parameter.Id === 'string' && typeof parameter.Value === 'number')
        .map((parameter) => ({
          id: parameter.Id,
          value: parameter.Value,
          blend: normalizeBlend(parameter.Blend),
        })),
    };
  })();

  appearancePatchCache.set(cacheKey, loader);
  return loader;
}

function applyAppearancePatches(model: PatchedModel, lappAdapter: any, patches: AppearancePatch[]): void {
  if (!model._model || patches.length === 0) {
    return;
  }

  const idManager = lappAdapter.getIdManager?.();
  if (!idManager?.getId) {
    return;
  }

  patches.forEach((patch) => {
    patch.operations.forEach((operation) => {
      const parameterId = idManager.getId(operation.id);
      switch (operation.blend) {
        case 'Add':
          model._model?.addParameterValueById(parameterId, operation.value, 1);
          break;
        case 'Multiply':
          model._model?.multiplyParameterValueById(parameterId, operation.value, 1);
          break;
        case 'Overwrite':
        default:
          model._model?.setParameterValueById(parameterId, operation.value, 1);
          break;
      }
    });
  });

  model._model.update();
}

function installAppearancePatchRunner(lappAdapter: any, getPatches: () => AppearancePatch[]): boolean {
  const model = lappAdapter.getModel?.() as PatchedModel | null | undefined;
  if (!model || !model._model || typeof model.update !== 'function') {
    return false;
  }

  if (model._appearancePatchController) {
    model._appearancePatchController.getPatches = getPatches;
    return true;
  }

  const originalUpdate = model.update.bind(model);
  model._appearancePatchController = { getPatches };
  model.update = () => {
    originalUpdate();
    const patches = model._appearancePatchController?.getPatches() ?? [];
    applyAppearancePatches(model, lappAdapter, patches);
  };
  return true;
}

export const useLive2DAppearance = (
  modelInfo?: ModelInfo,
  persistentAppearance?: string,
) => {
  const appearancePatchesRef = useRef<AppearancePatch[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadAppearancePatches = async () => {
      if (!modelInfo) {
        appearancePatchesRef.current = [];
        return;
      }

      try {
        const patches: AppearancePatch[] = [];

        if (typeof modelInfo.defaultEmotion === 'string') {
          const basePatch = await resolveAppearancePatch(modelInfo, modelInfo.defaultEmotion);
          if (basePatch) {
            patches.push(basePatch);
          }
        }

        if (persistentAppearance) {
          const persistentPatch = await resolveAppearancePatch(modelInfo, persistentAppearance);
          if (persistentPatch) {
            patches.push(persistentPatch);
          }
        }

        if (!cancelled) {
          appearancePatchesRef.current = patches;
        }
      } catch (error) {
        console.warn('Failed to load Live2D appearance patches:', error);
        if (!cancelled) {
          appearancePatchesRef.current = [];
        }
      }
    };

    void loadAppearancePatches();

    return () => {
      cancelled = true;
    };
  }, [modelInfo, persistentAppearance]);

  useEffect(() => {
    let frameId = 0;
    let cancelled = false;

    const ensureRunnerInstalled = () => {
      if (cancelled) {
        return;
      }

      const lappAdapter = (window as any).getLAppAdapter?.();
      if (!lappAdapter || !installAppearancePatchRunner(lappAdapter, () => appearancePatchesRef.current)) {
        frameId = window.requestAnimationFrame(ensureRunnerInstalled);
      }
    };

    ensureRunnerInstalled();

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [modelInfo?.url]);
};
