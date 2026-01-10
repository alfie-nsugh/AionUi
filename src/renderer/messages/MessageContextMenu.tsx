/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { Dropdown, Menu, Modal, Input } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useState } from 'react';

interface MessageContextMenuProps {
  message: TMessage;
  conversationId: string;
  children: React.ReactNode;
  /** Callback when edit is triggered */
  onEdit?: (message: TMessage, mode: 'inPlace' | 'fork') => void;
  /** Callback when tool call edit is triggered */
  onEditToolCall?: (toolCall: ToolCallEditTarget) => void;
  /** Callback when tool result edit is triggered */
  onEditToolResult?: (toolCall: ToolCallEditTarget) => void;
  /** Callback when delete is triggered */
  onDelete?: (message: TMessage) => void;
  /** Callback when regenerate is triggered */
  onRegenerate?: (message: TMessage, mode: 'inPlace' | 'fork') => void;
  /** Callback when save from here is triggered */
  onSaveFromHere?: (message: TMessage, saveName: string) => void;
  /** Callback when hide/show is triggered */
  onToggleHidden?: (message: TMessage) => void;
}

/**
 * Context menu wrapper for messages
 * Provides right-click menu with edit, delete, save, regenerate options
 */
type ToolCallEditTarget = {
  callId: string;
  name: string;
  callHistoryIndex?: number;
  responseHistoryIndex?: number;
};

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({ message, conversationId: _conversationId, children, onEdit, onEditToolCall, onEditToolResult, onDelete, onRegenerate, onSaveFromHere, onToggleHidden }) => {
  const { t } = useTranslation();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveName, setSaveName] = useState('');
  const toolEntries = React.useMemo(() => {
    if (message.type === 'tool_group') {
      const entries = message.content as Extract<TMessage, { type: 'tool_group' }>['content'];
      return entries.map((item) => ({
        callId: item.callId,
        name: item.name,
        callHistoryIndex: item.callHistoryIndex,
        responseHistoryIndex: item.responseHistoryIndex,
      }));
    }
    if (message.type === 'acp_tool_call') {
      const update = message.content?.update;
      if (!update) return [];
      return [
        {
          callId: update.toolCallId,
          name: update.title || update.toolCallId,
          callHistoryIndex: update.callHistoryIndex,
          responseHistoryIndex: update.responseHistoryIndex,
        },
      ];
    }
    return [];
  }, [message]);
  const toolEntryById = React.useMemo(() => new Map(toolEntries.map((entry) => [entry.callId, entry])), [toolEntries]);

  const isAiMessage = message.position === 'left';
  const isHidden = (message as { hidden?: boolean }).hidden === true;

  const handleMenuClick = useCallback(
    (key: string) => {
      const editToolCallPrefix = 'edit-tool-call:';
      const editToolResultPrefix = 'edit-tool-result:';
      if (key.startsWith(editToolCallPrefix)) {
        const toolCallId = key.slice(editToolCallPrefix.length);
        const toolCall = toolEntryById.get(toolCallId);
        if (toolCall) {
          onEditToolCall?.(toolCall);
        }
        return;
      }
      if (key.startsWith(editToolResultPrefix)) {
        const toolCallId = key.slice(editToolResultPrefix.length);
        const toolCall = toolEntryById.get(toolCallId);
        if (toolCall) {
          onEditToolResult?.(toolCall);
        }
        return;
      }
      switch (key) {
        case 'edit-inplace':
          onEdit?.(message, 'inPlace');
          break;
        case 'edit-fork':
          onEdit?.(message, 'fork');
          break;
        case 'delete':
          onDelete?.(message);
          break;
        case 'regenerate-inplace':
          onRegenerate?.(message, 'inPlace');
          break;
        case 'regenerate-fork':
          onRegenerate?.(message, 'fork');
          break;
        case 'save-from-here':
          setSaveModalVisible(true);
          break;
        case 'toggle-hidden':
          onToggleHidden?.(message);
          break;
        case 'copy':
          if (message.type === 'text') {
            void navigator.clipboard.writeText(message.content?.content || '');
          }
          break;
      }
    },
    [message, onEdit, onEditToolCall, onEditToolResult, onDelete, onRegenerate, onToggleHidden, toolEntryById]
  );

  const handleSaveConfirm = useCallback(() => {
    if (saveName.trim()) {
      onSaveFromHere?.(message, saveName.trim());
      setSaveModalVisible(false);
      setSaveName('');
    }
  }, [saveName, message, onSaveFromHere]);

  const contextMenu = (
    <Menu onClickMenuItem={handleMenuClick}>
      {/* Copy option - always available for text messages */}
      {message.type === 'text' && <Menu.Item key='copy'>{t('messages.contextMenu.copy', { defaultValue: 'Copy' })}</Menu.Item>}

      {/* Edit submenu - for non-tool messages */}
      {message.type !== 'tool_group' && message.type !== 'acp_tool_call' && onEdit && (
        <Menu.SubMenu key='edit' title={t('messages.contextMenu.edit', { defaultValue: 'Edit' })}>
          <Menu.Item key='edit-inplace'>{t('messages.contextMenu.editInPlace', { defaultValue: 'In Place' })}</Menu.Item>
          <Menu.Item key='edit-fork'>{t('messages.contextMenu.editFork', { defaultValue: 'Fork' })}</Menu.Item>
        </Menu.SubMenu>
      )}

      {toolEntries.length > 0 && onEditToolCall && (
        <Menu.SubMenu key='edit-tool-call' title={t('messages.contextMenu.editToolCall', { defaultValue: 'Edit tool call' })}>
          {toolEntries.map((tool) => (
            <Menu.Item key={`edit-tool-call:${tool.callId}`} disabled={typeof tool.callHistoryIndex !== 'number'}>
              {tool.name}
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}

      {toolEntries.length > 0 && onEditToolResult && (
        <Menu.SubMenu key='edit-tool-result' title={t('messages.contextMenu.editToolResult', { defaultValue: 'Edit tool result' })}>
          {toolEntries.map((tool) => (
            <Menu.Item key={`edit-tool-result:${tool.callId}`} disabled={typeof tool.responseHistoryIndex !== 'number'}>
              {tool.name}
            </Menu.Item>
          ))}
        </Menu.SubMenu>
      )}

      {/* Regenerate submenu - only for AI messages */}
      {isAiMessage && onRegenerate && (
        <Menu.SubMenu key='regenerate' title={t('messages.contextMenu.regenerate', { defaultValue: 'Regenerate' })}>
          <Menu.Item key='regenerate-inplace'>{t('messages.contextMenu.regenerateInPlace', { defaultValue: 'In Place' })}</Menu.Item>
          <Menu.Item key='regenerate-fork'>{t('messages.contextMenu.regenerateFork', { defaultValue: 'Fork' })}</Menu.Item>
        </Menu.SubMenu>
      )}

      {/* Divider */}
      <div className='h-1px bg-[var(--color-border-2)] my-4px mx-8px' />

      {/* Save from here */}
      {onSaveFromHere && <Menu.Item key='save-from-here'>{t('messages.contextMenu.saveFromHere', { defaultValue: 'Save from here...' })}</Menu.Item>}

      {/* Hide/Show toggle */}
      {onToggleHidden && <Menu.Item key='toggle-hidden'>{isHidden ? t('messages.contextMenu.showMessage', { defaultValue: 'Show message' }) : t('messages.contextMenu.hideMessage', { defaultValue: 'Hide message' })}</Menu.Item>}

      {/* Delete */}
      {onDelete && [
        <div key='delete-divider' className='h-1px bg-[var(--color-border-2)] my-4px mx-8px' />,
        <Menu.Item key='delete' className='text-[rgb(var(--danger-6))]'>
          {t('messages.contextMenu.delete', { defaultValue: 'Delete' })}
        </Menu.Item>,
      ]}
    </Menu>
  );

  return (
    <>
      <Dropdown droplist={contextMenu} trigger='contextMenu' position='bl' getPopupContainer={() => document.body} triggerProps={{ alignPoint: true }}>
        {children}
      </Dropdown>

      {/* Save checkpoint modal */}
      <Modal
        title={t('messages.contextMenu.saveCheckpoint', { defaultValue: 'Save Checkpoint' })}
        visible={saveModalVisible}
        onOk={handleSaveConfirm}
        onCancel={() => {
          setSaveModalVisible(false);
          setSaveName('');
        }}
        okText={t('common.save', { defaultValue: 'Save' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      >
        <Input placeholder={t('messages.contextMenu.checkpointName', { defaultValue: 'Checkpoint name' })} value={saveName} onChange={setSaveName} onPressEnter={handleSaveConfirm} autoFocus />
      </Modal>
    </>
  );
};

export default MessageContextMenu;
