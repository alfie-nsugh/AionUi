/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { ipcBridge } from '../../common';
import WorkerManage from '../WorkerManage';
import type AcpAgentManager from '../task/AcpAgentManager';

export function initAcpConversationBridge(): void {
  // ACP 专用的 confirmMessage provider (for backward compatibility with 'acp.input.confirm.message' channel)
  ipcBridge.acpConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager;
    if (!task) {
      return { success: false, msg: 'conversation not found' };
    }

    if (task.type !== 'acp') {
      return { success: false, msg: 'not support' };
    }

    try {
      await task.confirmMessage({ confirmKey, msg_id, callId });
      return { success: true };
    } catch (err) {
      return { success: false, msg: err };
    }
  });

  // Debug provider to check environment variables
  ipcBridge.acpConversation.checkEnv.provider(() => {
    return Promise.resolve({
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
        NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
      },
    });
  });

  // 保留旧的detectCliPath接口用于向后兼容，但使用新检测器的结果
  ipcBridge.acpConversation.detectCliPath.provider(({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);

    if (agent?.cliPath) {
      return Promise.resolve({ success: true, data: { path: agent.cliPath } });
    }

    return Promise.resolve({ success: false, msg: `${backend} CLI not found. Please install it and ensure it's accessible.` });
  });

  // 新的ACP检测接口 - 基于全局标记位
  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    try {
      const agents = acpDetector.getDetectedAgents();
      return Promise.resolve({ success: true, data: agents });
    } catch (error) {
      return Promise.resolve({
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Refresh custom agents detection - called when custom agents config changes
  ipcBridge.acpConversation.refreshCustomAgents.provider(async () => {
    try {
      await acpDetector.refreshCustomAgents();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Slash command completions - routes to the ACP connection if available
  ipcBridge.acpConversation.completeCommand.provider(async ({ sessionId, partial }) => {
    try {
      // If no sessionId, return a static list of commands (no backend call possible)
      if (!sessionId) {
        // Return static commands for the main page (no active session)
        const staticCommands = [
          { name: '/help', description: 'Show available commands', category: 'built-in' },
          { name: '/copy', description: 'Copy last response to clipboard', category: 'built-in' },
          { name: '/chat save', description: 'Save the current conversation', category: 'built-in' },
          { name: '/chat resume', description: 'Resume a saved conversation', category: 'built-in' },
          { name: '/chat list', description: 'List saved checkpoints', category: 'built-in' },
          { name: '/chat delete', description: 'Delete a saved checkpoint', category: 'built-in' },
        ];

        const lowerPartial = partial.toLowerCase();
        const filtered = staticCommands.filter((c) => c.name.toLowerCase().startsWith(lowerPartial));
        return { success: true, data: { suggestions: filtered } };
      }

      // Get the task/conversation to access its ACP connection
      const task = WorkerManage.getTaskById(sessionId) as AcpAgentManager;
      if (!task || task.type !== 'acp') {
        return { success: false, msg: 'ACP session not found' };
      }

      // Call the ACP connection's commands/complete RPC
      const result = await task.completeCommand(partial);
      return { success: true, data: { suggestions: result } };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
