import { Box, Button, Text } from '@chakra-ui/react';
import { useScreenRecording } from '@/context/screen-record-context';

/** Shared controls for the sidebar and pet-mode input toolbar. */
export function ScreenRecordControls(): JSX.Element {
  const { state, error, pending, wsState, control } = useScreenRecording();
  const recording = state?.recording ?? false;
  const reason = state?.stop_reason === 'idle-timeout'
    ? '已因 2 分钟未回顾自动停止'
    : state?.stop_reason === 'duration-limit' ? '已达到记录时限，自动停止' : '未记录';
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
        本地缓存最近画面，不自动发言；读取画面时才调用模型。与屏幕共享独立。
      </Text>
      {(error || state?.error) && <Text role="alert" fontSize="xs" color="red.300">{error || state?.error}</Text>}
    </Box>
  );
}
