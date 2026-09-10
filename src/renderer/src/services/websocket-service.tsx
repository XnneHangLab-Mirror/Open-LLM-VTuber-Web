/* eslint-disable no-use-before-define */
import i18next from 'i18next';
import { Subject } from 'rxjs';
import { ModelInfo } from '@/context/live2d-config-context';
import { HistoryInfo } from '@/context/websocket-context';
import { ConfigFile } from '@/context/character-config-context';
import { toaster } from '@/components/ui/toaster';
import { ImagePayload } from '@/types/media';
import { PoseValues } from '@/live2d/mixer/logical-channels';
import { IdleBankConfig, IdlePlaybackMode, IdlePlayCommand } from '@/live2d/mixer/recorded-idle-driver';
import type { PoseLayerId } from '@/hooks/canvas/live2d-pose-mixer-controller';

export interface DisplayText {
  text: string;
  name: string;
  avatar: string;
}

interface BackgroundFile {
  name: string;
  url: string;
}

export interface AudioPayload {
  type: 'audio';
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  display_text?: DisplayText;
  actions?: Actions;
  turn_id?: string;
  tts_error?: boolean;
}

export interface Message {
  id: string;
  content: string;
  role: "ai" | "human";
  timestamp: string;
  name?: string;
  avatar?: string;
  images?: ImagePayload[];

  // Fields for different message types (make optional)
  type?: 'text' | 'tool_call_status'; // Add possible types, default to 'text' if omitted
  tool_id?: string; // Specific to tool calls
  tool_name?: string; // Specific to tool calls
  status?: 'running' | 'completed' | 'error'; // Specific to tool calls
}

export interface Actions {
  expressions?: string[] | number [];
  pictures?: string[];
  sounds?: string[];

  /**
   * Minimal logical pose input for the Live2D pose mixer (backend_pose_layer).
   * Values are logical channels (normalized), not raw Live2D parameter IDs.
   */
  pose?: PoseValues | null;
  pose_patch?: PoseValues | null;
  pose_mode?: 'set' | 'patch' | 'clear';
  pose_weight?: number;
  mixer_weights?: Partial<Record<PoseLayerId, number>>;
  mixer_weights_mode?: 'patch' | 'reset';

  /**
   * Minimal recorded-idle inputs (P2):
   * - `idle_list` is the compact shape for quick integration.
   * - `idle_bank` is a structured form for future metadata (weight/scene/mood).
   */
  idle_list?: string[] | null;
  idle_mode?: IdlePlaybackMode;
  idle_bank?: IdleBankConfig | null;
  idle_state?: string;
  idle_play?: IdlePlayCommand | string | null;
}

export interface MessageEvent {
  tool_id: any;
  tool_name: any;
  name: any;
  status: any;
  content: string;
  timestamp: string;
  type: string;
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  files?: BackgroundFile[];
  actions?: Actions;
  text?: string;
  model_info?: ModelInfo;
  conf_name?: string;
  conf_uid?: string;
  uids?: string[];
  messages?: Message[];
  history_uid?: string;
  success?: boolean;
  histories?: HistoryInfo[];
  configs?: ConfigFile[];
  message?: string;
  score?: number;
  members?: string[];
  is_owner?: boolean;
  client_uid?: string;
  forwarded?: boolean;
  display_text?: DisplayText;
  turn_id?: string;
  tts_error?: boolean;
  live2d_model?: string;
  expression?: string | number;
  idle_state?: string;
  idle_list?: string[] | null;
  idle_mode?: IdlePlaybackMode;
  idle_bank?: IdleBankConfig | null;
  mixer_weights?: Partial<Record<PoseLayerId, number>>;
  mixer_weights_mode?: 'patch' | 'reset';
  idle_play?: IdlePlayCommand | string | null;
  browser_view?: {
    debuggerFullscreenUrl: string;
    debuggerUrl: string;
    pages: {
      id: string;
      url: string;
      faviconUrl: string;
      title: string;
      debuggerUrl: string;
      debuggerFullscreenUrl: string;
    }[];
    wsUrl: string;
    sessionId?: string;
  };
}

class WebSocketService {
  private static instance: WebSocketService;

  private ws: WebSocket | null = null;

  private messageSubject = new Subject<MessageEvent>();

  private stateSubject = new Subject<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>();

  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private initializeConnection() {
    this.sendMessage({
      type: 'fetch-backgrounds',
    });
    this.sendMessage({
      type: 'fetch-configs',
    });
    this.sendMessage({
      type: 'fetch-history-list',
    });
    this.sendMessage({
      type: 'create-new-history',
    });
  }

  connect(url: string) {
    if (this.ws?.readyState === WebSocket.CONNECTING ||
        this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    try {
      this.ws = new WebSocket(url);
      this.stateSubject.next('CONNECTING');

      this.ws.onopen = () => {
        this.stateSubject.next('OPEN');
        this.initializeConnection();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.messageSubject.next(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          toaster.create({
            title: `${i18next.t('error.failedParseWebSocket')}: ${error}`,
            type: "error",
            duration: 2000,
          });
        }
      };

      this.ws.onclose = () => {
        this.stateSubject.next('CLOSED');
      };

      this.ws.onerror = () => {
        this.stateSubject.next('CLOSED');
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.stateSubject.next('CLOSED');
    }
  }

  sendMessage(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      toaster.create({
        title: i18next.t('error.websocketNotOpen'),
        type: 'error',
        duration: 2000,
      });
    }
  }

  onMessage(callback: (message: MessageEvent) => void) {
    return this.messageSubject.subscribe(callback);
  }

  onStateChange(callback: (state: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED') => void) {
    return this.stateSubject.subscribe(callback);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

export const wsService = WebSocketService.getInstance();
