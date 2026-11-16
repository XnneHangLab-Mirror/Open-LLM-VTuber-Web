import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWebSocket } from '@/context/websocket-context';
import { wsService, type MessageEvent } from '@/services/websocket-service';

interface RecordingContext {
  state: MessageEvent['recording_state'];
  error: string;
  pending: boolean;
  wsState: string;
  control: (action: 'start' | 'stop') => void;
}
const Context = createContext<RecordingContext | null>(null);

export function ScreenRecordProvider({ children }: { children: ReactNode }): JSX.Element {
  const { sendMessage, wsState } = useWebSocket();
  const [state, setState] = useState<MessageEvent['recording_state']>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (wsState !== 'OPEN') {
      setState(undefined);
      setPending(false);
      return undefined;
    }
    const subscription = wsService.onMessage((message) => {
      if (message.type !== 'screen-record-state') return;
      setState(message.recording_state);
      // Status polls must not hide an action error or unlock a pending action.
      if (message.action !== 'status') {
        setPending(false);
        setError(message.error ?? '');
      }
    });
    sendMessage({ type: 'screen-record-control', action: 'status' });
    const timer = window.setInterval(() => {
      sendMessage({ type: 'screen-record-control', action: 'status' });
    }, 2000);
    return () => {
      subscription.unsubscribe();
      window.clearInterval(timer);
    };
  }, [sendMessage, wsState]);

  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setTimeout(() => {
      setPending(false);
      setError('操作未收到确认，请检查连接和记录状态。');
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const control = useCallback((action: 'start' | 'stop') => {
    setPending(true);
    setError('');
    sendMessage({ type: 'screen-record-control', action });
  }, [sendMessage]);


  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return undefined;
    const onControl = (_event: unknown, action: unknown) => {
      if (wsState === 'OPEN' && !pending && (action === 'start' || action === 'stop')) control(action);
    };
    ipc.on('screen-record-control', onControl);
    return () => { ipc.removeListener('screen-record-control', onControl); };
  }, [control, pending, wsState]);

  useEffect(() => {
    window.electron?.ipcRenderer.send('screen-record-menu-state', {
      available: wsState === 'OPEN' && Boolean(state?.available),
      recording: wsState === 'OPEN' && Boolean(state?.recording),
      pending,
      remaining: state?.remaining_seconds ?? 0,
      error: error || state?.error || '',
    });
  }, [state, pending, error, wsState]);

  const value = useMemo(() => ({ state, error, pending, wsState, control }), [state, error, pending, wsState, control]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useScreenRecording(): RecordingContext {
  const context = useContext(Context);
  if (!context) throw new Error('ScreenRecordProvider is required');
  return context;
}
