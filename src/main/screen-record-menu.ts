import type { MenuItemConstructorOptions } from 'electron';

export interface ScreenRecordMenuState {
  available?: boolean;
  recording?: boolean;
  pending?: boolean;
  remaining?: number;
  error?: string;
}

export function screenRecordMenuItems(
  state: ScreenRecordMenuState,
  send: (action: 'start' | 'stop') => void,
): MenuItemConstructorOptions[] {
  const remaining = typeof state.remaining === 'number' && Number.isFinite(state.remaining)
    ? Math.max(0, Math.ceil(state.remaining)) : 0;
  let label = '屏幕记录：未记录';
  if (!state.available) label = '屏幕记录：后端未连接或工具未启用';
  else if (state.pending) label = '屏幕记录：处理中…';
  else if (state.recording) label = `屏幕记录中 · 最长剩余 ${remaining} 秒`;
  else if (state.error) label = `屏幕记录：${String(state.error).slice(0, 100)}`;
  return [
    { label, enabled: false },
    {
      label: state.recording ? '停止并清空屏幕记录' : '开始屏幕记录（最多 10 分钟）',
      enabled: state.available === true && state.pending !== true,
      click: () => send(state.recording ? 'stop' : 'start'),
    },
  ];
}
