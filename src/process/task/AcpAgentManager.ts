import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IConfirmMessageParams, IResponseMessage } from '@/common/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import { ProcessConfig } from '../initStorage';
import { addMessage, addOrUpdateMessage, clearMessages, nextTickToLocalFinish, updateMessage } from '../message';
import BaseAgentManager from './BaseAgentManager';
import { handlePreviewOpenEvent } from '../utils/previewUtils';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackend;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
  customAgentId?: string; // 用于标识特定自定义代理的 UUID / UUID for identifying specific custom agent
}

type AcpSessionUpdateResult = { success: boolean; newSessionId?: string };

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined;
  options: AcpAgentManagerData;

  constructor(data: AcpAgentManagerData) {
    super('acp', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
  }

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrap = (async () => {
      let cliPath = data.cliPath;
      let customArgs: string[] | undefined;
      let customEnv: Record<string, string> | undefined;

      // 处理自定义后端：从 acp.customAgents 配置数组中读取
      // Handle custom backend: read from acp.customAgents config array
      if (data.backend === 'custom' && data.customAgentId) {
        const customAgents = await ProcessConfig.get('acp.customAgents');
        // 通过 UUID 查找对应的自定义代理配置 / Find custom agent config by UUID
        const customAgentConfig = customAgents?.find((agent) => agent.id === data.customAgentId);
        if (customAgentConfig?.defaultCliPath) {
          // Parse defaultCliPath which may contain command + args (e.g., "node /path/to/file.js" or "goose acp")
          const parts = customAgentConfig.defaultCliPath.trim().split(/\s+/);
          cliPath = parts[0]; // First part is the command

          // 参数优先级：acpArgs > defaultCliPath 中解析的参数
          // Argument priority: acpArgs > args parsed from defaultCliPath
          if (customAgentConfig.acpArgs) {
            customArgs = customAgentConfig.acpArgs;
          } else if (parts.length > 1) {
            customArgs = parts.slice(1); // Fallback to parsed args
          }
          customEnv = customAgentConfig.env;
        }
      } else if (data.backend !== 'custom') {
        // Handle built-in backends: read from acp.config
        const config = await ProcessConfig.get('acp.config');
        if (!cliPath && config?.[data.backend]?.cliPath) {
          cliPath = config[data.backend].cliPath;
        }

        // Get acpArgs from backend config (for goose, auggie, etc.)
        const backendConfig = ACP_BACKENDS_ALL[data.backend];
        if (backendConfig?.acpArgs) {
          customArgs = backendConfig.acpArgs;
        }
      } else {
        // backend === 'custom' but no customAgentId - this is an invalid state
        // 自定义后端但缺少 customAgentId - 这是无效状态
        console.warn('[AcpAgentManager] Custom backend specified but customAgentId is missing');
      }

      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        customArgs: customArgs,
        customEnv: customEnv,
        onStreamEvent: (v) => {
          // Handle preview_open event (chrome-devtools navigation interception)
          // 处理 preview_open 事件（chrome-devtools 导航拦截）
          if (handlePreviewOpenEvent(v)) {
            return; // Don't process further / 不需要继续处理
          }

          if (v.type === 'clear_history') {
            clearMessages(v.conversation_id);
            ipcBridge.acpConversation.responseStream.emit(v);
            return;
          }

          if (v.type === 'history_index_update') {
            this.applyHistoryIndexUpdate(v.conversation_id, v.data as { lastUserIndex?: number; lastModelIndex?: number });
            ipcBridge.acpConversation.responseStream.emit(v);
            return;
          }

          if (v.type !== 'thought') {
            const tMessage = transformMessage(v as IResponseMessage);
            if (tMessage) {
              addOrUpdateMessage(v.conversation_id, tMessage, data.backend);
            }
          }
          ipcBridge.acpConversation.responseStream.emit(v);
        },
        onSignalEvent: (v) => {
          // 仅发送信号到前端，不更新消息列表
          ipcBridge.acpConversation.responseStream.emit(v);
        },
      });
      return this.agent.start().then(() => this.agent);
    })();
    return this.bootstrap;
  }

  private applyHistoryIndexUpdate(conversationId: string, payload: { lastUserIndex?: number; lastModelIndex?: number }): void {
    updateMessage(conversationId, (messages) => {
      const updated = messages.slice();
      const hasUserIndex = typeof payload.lastUserIndex === 'number';
      const hasModelIndex = typeof payload.lastModelIndex === 'number';

      if (hasUserIndex) {
        for (let i = updated.length - 1; i >= 0; i--) {
          const msg = updated[i];
          if (msg.type === 'text' && msg.position === 'right' && typeof msg.historyIndex !== 'number') {
            updated[i] = { ...msg, historyIndex: payload.lastUserIndex };
            break;
          }
        }
      }

      if (hasModelIndex) {
        for (let i = updated.length - 1; i >= 0; i--) {
          const msg = updated[i];
          if (msg.type === 'text' && msg.position === 'left' && typeof msg.historyIndex !== 'number') {
            updated[i] = { ...msg, historyIndex: payload.lastModelIndex };
            break;
          }
        }
      }

      return updated;
    });
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    try {
      await this.initAgent(this.options);
      const trimmed = data.content.trim();
      const isSlashCommand = trimmed.startsWith('/') && trimmed.length > 1;
      // Save user message to chat history ONLY after successful sending
      if (data.msg_id && data.content && !isSlashCommand) {
        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: {
            content: data.content,
          },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
        const userResponseMessage: IResponseMessage = {
          type: 'user_content',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id,
          data: userMessage.content.content,
        };
        ipcBridge.acpConversation.responseStream.emit(userResponseMessage);
      }
      return await this.agent.sendMessage(data);
    } catch (e) {
      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: parseError(e),
      };

      // Backend handles persistence before emitting to frontend
      const tMessage = transformMessage(message);
      if (tMessage) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      }

      // Emit to frontend for UI display only
      ipcBridge.acpConversation.responseStream.emit(message);
      return new Promise((_, reject) => {
        nextTickToLocalFinish(() => {
          reject(e);
        });
      });
    }
  }

  async confirmMessage(data: Omit<IConfirmMessageParams, 'conversation_id'>) {
    await this.bootstrap;
    await this.agent.confirmMessage(data);
  }

  private requireSessionId(): string {
    const sessionId = this.agent.getSessionId();
    if (!sessionId) {
      throw new Error('No active ACP session');
    }
    return sessionId;
  }

  /**
   * Get slash command completions from the ACP backend
   */
  async completeCommand(partial: string): Promise<Array<{ name: string; description: string; category: string; text?: string; isArgument?: boolean }>> {
    await this.bootstrap;

    // Call the commands/complete RPC on the ACP connection
    const sessionId = this.agent.getSessionId() ?? undefined;
    const result = await this.agent.callMethod<{ partial: string; sessionId?: string }, { suggestions: Array<{ name: string; description: string; category: string; text?: string; isArgument?: boolean }> }>('commands/complete', { partial, ...(sessionId ? { sessionId } : {}) });

    return result?.suggestions ?? [];
  }

  async getEditableMessage(
    messageIndex: number,
    options?: { exactIndex?: boolean }
  ): Promise<{
    content: string;
    format: string;
    tokenSetId?: string;
    parts: Array<{ tokenId: string; part: Record<string, unknown> }>;
    resolvedIndex?: number;
  }> {
    await this.initAgent(this.options);
    const sessionId = this.requireSessionId();
    return await this.agent.callMethod('session/getMessageForEdit', {
      sessionId,
      messageIndex,
      exactIndex: options?.exactIndex,
    });
  }

  async editMessage(params: { messageIndex: number; content: string; mode: 'inPlace' | 'fork'; format?: string; tokenSetId?: string; partOverrides?: Array<{ tokenId: string; part: Record<string, unknown> }> }): Promise<{ success: boolean; newSessionId?: string }> {
    await this.initAgent(this.options);
    const sessionId = this.requireSessionId();
    const result = await this.agent.callMethod<
      {
        sessionId: string;
        messageIndex: number;
        newContent: string;
        mode: 'inPlace' | 'fork';
        format?: string;
        tokenSetId?: string;
        partOverrides?: Array<{ tokenId: string; part: Record<string, unknown> }>;
      },
      AcpSessionUpdateResult
    >('session/editMessage', {
      sessionId,
      messageIndex: params.messageIndex,
      newContent: params.content,
      mode: params.mode,
      format: params.format,
      tokenSetId: params.tokenSetId,
      partOverrides: params.partOverrides,
    });

    if (result?.newSessionId) {
      this.agent.setSessionId(result.newSessionId);
    }

    return result;
  }

  async regenerateMessage(params: { messageIndex: number; mode: 'inPlace' | 'fork' }): Promise<{ success: boolean; newSessionId?: string }> {
    await this.initAgent(this.options);
    const sessionId = this.requireSessionId();
    const result = await this.agent.callMethod<
      {
        sessionId: string;
        messageIndex: number;
        mode: 'inPlace' | 'fork';
      },
      AcpSessionUpdateResult
    >('session/regenerate', {
      sessionId,
      messageIndex: params.messageIndex,
      mode: params.mode,
    });

    if (result?.newSessionId) {
      this.agent.setSessionId(result.newSessionId);
    }

    return result;
  }

  async deleteMessage(messageIndex: number): Promise<void> {
    await this.initAgent(this.options);
    const sessionId = this.requireSessionId();
    await this.agent.callMethod('session/deleteMessage', {
      sessionId,
      messageIndex,
    });
  }

  async saveFromPoint(
    messageIndex: number,
    saveName: string
  ): Promise<{
    success: boolean;
    savePath: string;
  }> {
    await this.initAgent(this.options);
    const sessionId = this.requireSessionId();
    return await this.agent.callMethod('session/saveFromPoint', {
      sessionId,
      messageIndex,
      saveName,
    });
  }
}

export default AcpAgentManager;
