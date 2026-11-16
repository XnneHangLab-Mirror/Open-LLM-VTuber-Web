import { useEffect, useState } from 'react';
import { Box, Button, Text } from '@chakra-ui/react';
import { useWebSocket } from '@/context/websocket-context';
import { wsService, type MessageEvent } from '@/services/websocket-service';

/** This controls backend capture, independently of browser screen sharing or LLM turns. */
export function ScreenRecordControls(): JSX.Element {
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

  const recording = state?.recording ?? false;
  const reason = state?.stop_reason === 'idle-timeout'
    ? '已因 2 分钟未回顾自动停止'
    : state?.stop_reason === 'duration-limit' ? '已达到记录时限，自动停止' : '未记录';

  function control(action: 'start' | 'stop') {
    setPending(true);
    setError('');
    sendMessage({ type: 'screen-record-control', action });
  }

  return (
    <Box width="100%" padding={2} borderTopWidth="1px" borderColor="whiteAlpha.200">
      <Text fontSize="sm" fontWeight="medium">最近画面记录</Text>
      <Text fontSize="xs" color="whiteAlpha.700" aria-live="polite">
        {wsState !== 'OPEN' ? '未连接后端' : recording
          ? `记录中 · 最长剩余 ${state?.remaining_seconds ?? 0} 秒 · 未回顾 ${state?.idle_remaining_seconds ?? 0} 秒后停止`
          : state?.available === false ? '当前角色未启用屏幕记录' : reason}
      </Text>
      <Button size="xs" marginTop={2} disabled={wsState !== 'OPEN' || !state?.available || pending}
        onClick={() => control(recording ? 'stop' : 'start')}>
        {pending ? '处理中…' : recording ? '停止并清空记录' : '开始记录（最多 10 分钟）'}
      </Button>
      <Text fontSize="xs" color="whiteAlpha.600" marginTop={1}>
        本地缓存最近画面，不自动发言；回顾时才调用模型。与上方屏幕共享独立。
      </Text>
      {(error || state?.error) && <Text role="alert" fontSize="xs" color="red.300">{error || state?.error}</Text>}
    </Box>
  );
}
