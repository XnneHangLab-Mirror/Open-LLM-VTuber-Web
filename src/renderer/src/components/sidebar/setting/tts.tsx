/* eslint-disable react/no-unstable-nested-components */
import {
  Button,
  Stack,
  Text,
  createListCollection,
} from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '@/context/websocket-context';
import { settingStyles } from './setting-styles';
import { SelectField, SwitchField } from './common';

interface TTSProps {
  onSave?: (callback: () => void) => () => void
  onCancel?: (callback: () => void) => () => void
}

interface LabConfigFormResponse {
  values: any
}

interface QwenTTSStatus {
  loaded: boolean
  configured_model: string
  loaded_model: string | null
  loaded_model_matches_config: boolean
  loaded_model_source: string | null
}

function TTS({ onSave, onCancel }: TTSProps): JSX.Element {
  const { i18n } = useTranslation();
  const { baseUrl } = useWebSocket();
  const isZh = i18n.language.toLowerCase().startsWith('zh');
  const [originalConfig, setOriginalConfig] = useState<any | null>(null);
  const [draftConfig, setDraftConfig] = useState<any | null>(null);
  const [status, setStatus] = useState<QwenTTSStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const labels = useMemo(() => ({
    speakerModel: isZh ? 'TTS 提供方' : 'TTS Provider',
    qwenPackage: isZh ? '启用 Qwen-TTS 服务' : 'Enable Qwen-TTS Service',
    qwenModel: isZh ? 'Qwen-TTS 规格' : 'Qwen-TTS Model',
    load: isZh ? '加载' : 'Load',
    reload: isZh ? '重载' : 'Reload',
    refresh: isZh ? '刷新状态' : 'Refresh Status',
    note: isZh
      ? '保存选择不会自动加载模型。未加载时会直接报错，不会热加载。'
      : 'Saving the selection does not load the model. Unloaded models fail directly and are never hot-loaded.',
    loaded: isZh ? '已加载' : 'Loaded',
    notLoaded: isZh ? '未加载' : 'Not loaded',
    configured: isZh ? '配置模型' : 'Configured model',
    active: isZh ? '当前已加载' : 'Loaded model',
    enableHint: isZh ? '选择 qwen_tts 之前需要先启用服务。' : 'Enable the service before selecting qwen_tts.',
    saveOk: isZh ? 'TTS 设置已保存' : 'TTS settings saved',
  }), [isZh]);

  const speakerModelCollection = useMemo(
    () => createListCollection({
      items: [
        { label: 'GPT-SoVITS', value: 'gpt_sovits' },
        { label: 'Qwen-TTS', value: 'qwen_tts' },
      ],
    }),
    [],
  );

  const qwenModelCollection = useMemo(
    () => createListCollection({
      items: [
        { label: 'Qwen3-TTS 0.6B', value: '0.6b' },
        { label: 'Qwen3-TTS 1.7B', value: '1.7b' },
      ],
    }),
    [],
  );

  const fetchConfig = useCallback(async () => {
    const response = await fetch(`${baseUrl}/admin/api/config/lab/form`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const payload = await response.json() as LabConfigFormResponse;
    setOriginalConfig(payload.values);
    setDraftConfig(payload.values);
  }, [baseUrl]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/tts/qwen-tts/status`);
      if (!response.ok) {
        setStatus(null);
        return;
      }
      const payload = await response.json() as QwenTTSStatus;
      setStatus(payload);
    } catch {
      setStatus(null);
    }
  }, [baseUrl]);

  useEffect(() => {
    const run = async (): Promise<void> => {
      setBusy(true);
      setError('');
      try {
        await Promise.all([fetchConfig(), fetchStatus()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    };
    void run();
  }, [fetchConfig, fetchStatus]);

  const handleSave = useCallback(() => {
    const run = async (): Promise<void> => {
      if (!draftConfig) return;
      setBusy(true);
      setError('');
      setMessage('');
      try {
        const response = await fetch(`${baseUrl}/admin/api/config/lab/form`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: draftConfig }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = await response.json() as LabConfigFormResponse;
        setOriginalConfig(payload.values);
        setDraftConfig(payload.values);
        setMessage(labels.saveOk);
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    };
    void run();
  }, [baseUrl, draftConfig, fetchStatus, labels.saveOk]);

  const handleCancel = useCallback(() => {
    setDraftConfig(originalConfig);
    setError('');
    setMessage('');
  }, [originalConfig]);

  useEffect(() => {
    if (!onSave || !onCancel) return undefined;
    const cleanupSave = onSave(handleSave);
    const cleanupCancel = onCancel(handleCancel);
    return (): void => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [handleCancel, handleSave, onCancel, onSave]);

  const handleQwenAction = useCallback((action: 'load' | 'reload') => {
    const run = async (): Promise<void> => {
      if (!draftConfig) return;
      setBusy(true);
      setError('');
      setMessage('');
      try {
        const response = await fetch(`${baseUrl}/tts/qwen-tts/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: draftConfig.agent.qwen_tts.model_name }),
        });
        const payload = await response.json() as { message?: string; status?: QwenTTSStatus };
        if (!response.ok) {
          throw new Error(payload.message || JSON.stringify(payload));
        }
        setMessage(payload.message || action);
        if (payload.status) {
          setStatus(payload.status);
        } else {
          await fetchStatus();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    };
    void run();
  }, [baseUrl, draftConfig, fetchStatus]);

  if (!draftConfig) {
    return (
      <Stack {...settingStyles.common.container}>
        <Text color="whiteAlpha.700">{busy ? 'Loading...' : error || 'No data'}</Text>
      </Stack>
    );
  }

  const speakerModel = draftConfig.agent?.tts?.provider || draftConfig.agent?.speaker_model || 'gpt_sovits';
  const qwenEnabled = Boolean(draftConfig.package?.qwen_tts);
  const qwenModel = draftConfig.agent?.qwen_tts?.model_name || '1.7b';

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={labels.speakerModel}
        value={[speakerModel]}
        onChange={(value) => {
          const next = value[0] || 'gpt_sovits';
          setDraftConfig((prev: any) => ({
            ...prev,
            agent: {
              ...prev.agent,
              tts: {
                ...prev.agent?.tts,
                provider: next,
              },
            },
          }));
        }}
        collection={speakerModelCollection}
        placeholder={labels.speakerModel}
      />

      <SwitchField
        label={labels.qwenPackage}
        checked={qwenEnabled}
        onChange={(checked) => {
          setDraftConfig((prev: any) => ({
            ...prev,
            package: {
              ...prev.package,
              qwen_tts: checked,
            },
          }));
        }}
        help={labels.enableHint}
      />

      <SelectField
        label={labels.qwenModel}
        value={[qwenModel]}
        onChange={(value) => {
          const next = value[0] || '1.7b';
          setDraftConfig((prev: any) => ({
            ...prev,
            agent: {
              ...prev.agent,
              qwen_tts: {
                ...prev.agent.qwen_tts,
                model_name: next,
              },
            },
          }));
        }}
        collection={qwenModelCollection}
        placeholder={labels.qwenModel}
      />

      <Text color="whiteAlpha.700" fontSize="sm">
        {labels.note}
      </Text>

      <Stack direction="row" gap={2}>
        <Button
          size="sm"
          onClick={() => handleQwenAction('load')}
          disabled={busy || !qwenEnabled}
        >
          {labels.load}
        </Button>
        <Button
          size="sm"
          onClick={() => handleQwenAction('reload')}
          disabled={busy || !qwenEnabled}
        >
          {labels.reload}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { void fetchStatus(); }}
          disabled={busy}
        >
          {labels.refresh}
        </Button>
      </Stack>

      {status && (
        <Stack gap={1}>
          <Text color="whiteAlpha.900">
            {labels.loaded}: {status.loaded ? labels.loaded : labels.notLoaded}
          </Text>
          <Text color="whiteAlpha.700">
            {labels.configured}: {status.configured_model}
          </Text>
          <Text color="whiteAlpha.700">
            {labels.active}: {status.loaded_model || '-'}
          </Text>
        </Stack>
      )}

      {message ? <Text color="green.300">{message}</Text> : null}
      {error ? <Text color="red.300" whiteSpace="pre-wrap">{error}</Text> : null}
    </Stack>
  );
}

export default TTS;

