/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CodexToolCallUpdate, TMessage } from '@/common/chatLib';
import { useConversationContextSafe } from '@/renderer/context/ConversationContext';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Image, Input, Message, Modal } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import MessageAcpNotice from '@renderer/messages/acp/MessageAcpNotice';
import MessageAcpPermission from '@renderer/messages/acp/MessageAcpPermission';
import MessageAcpToolCall from '@renderer/messages/acp/MessageAcpToolCall';
import MessageAgentStatus from '@renderer/messages/MessageAgentStatus';
import classNames from 'classnames';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MessageCodexPermission from './codex/MessageCodexPermission';
import MessageCodexToolCall from './codex/MessageCodexToolCall';
import MessageFileChanges from './codex/MessageFileChanges';
import { useChatKey, useMessageList } from './hooks';
import MessageTips from './MessageTips';
import MessageToolCall from './MessageToolCall';
import MessageToolGroup from './MessageToolGroup';
import MessageText from './MessagetText';
import MessageContextMenu from './MessageContextMenu';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;
type ToolCallEditTarget = {
  callId: string;
  name: string;
  callHistoryIndex?: number;
  responseHistoryIndex?: number;
};

const HISTORY_MESSAGE_OFFSET = 1; // gemini-cli initial environment context

type EditTokenPart = {
  tokenId: string;
  part: Record<string, unknown>;
};

const isEditableTextMessage = (message: TMessage): boolean => {
  return message.type === 'text' && (message.position === 'left' || message.position === 'right');
};

const isEditableToolGroup = (message: TMessage): boolean => {
  return message.type === 'tool_group' && typeof message.historyIndex === 'number';
};

const isEditableMessage = (message: TMessage): boolean => {
  return isEditableTextMessage(message) || isEditableToolGroup(message);
};

const getMessagePreview = (message: TMessage, fallbackLabel: string): string => {
  if (message.type !== 'text') {
    return fallbackLabel;
  }

  const rawText = message.content.content?.trim();
  if (!rawText) {
    return fallbackLabel;
  }

  const flattened = rawText.replace(/\s+/g, ' ');
  const snippet = flattened.length > 40 ? `${flattened.slice(0, 40)}...` : flattened;
  return `"${snippet}"`;
};

const getPartLabel = (part: Record<string, unknown>): string => {
  const typedPart = part as {
    inlineData?: { mimeType?: string };
    fileData?: { fileUri?: string; mimeType?: string };
    functionCall?: { name?: string };
    functionResponse?: { name?: string };
    executableCode?: unknown;
    codeExecutionResult?: unknown;
    thought?: boolean;
  };

  if (typedPart.functionCall) {
    return `functionCall (${typedPart.functionCall.name ?? 'unknown'})`;
  }
  if (typedPart.functionResponse) {
    return `functionResponse (${typedPart.functionResponse.name ?? 'unknown'})`;
  }
  if (typedPart.inlineData) {
    return `inlineData (${typedPart.inlineData.mimeType ?? 'data'})`;
  }
  if (typedPart.fileData) {
    return `fileData (${typedPart.fileData.fileUri ?? typedPart.fileData.mimeType ?? 'uri'})`;
  }
  if (typedPart.executableCode) {
    return 'executableCode';
  }
  if (typedPart.codeExecutionResult) {
    return 'codeExecutionResult';
  }
  if (typedPart.thought) {
    return 'thought';
  }
  return 'part';
};

const getInlineDataPreviewUrl = (part: Record<string, unknown>): string | null => {
  const inlineData = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData;
  if (!inlineData?.data) {
    return null;
  }
  const mimeType = inlineData.mimeType || 'application/octet-stream';
  return `data:${mimeType};base64,${inlineData.data}`;
};

// 图片预览上下文 Image preview context
export const ImagePreviewContext = createContext<{ inPreviewGroup: boolean }>({ inPreviewGroup: false });

const MessageItemContent: React.FC<{ message: TMessage }> = ({ message }) => {
  const { t } = useTranslation();

  switch (message.type) {
    case 'text':
      return <MessageText message={message}></MessageText>;
    case 'tips':
      return <MessageTips message={message}></MessageTips>;
    case 'tool_call':
      return <MessageToolCall message={message}></MessageToolCall>;
    case 'tool_group':
      return <MessageToolGroup message={message}></MessageToolGroup>;
    case 'agent_status':
      return <MessageAgentStatus message={message}></MessageAgentStatus>;
    case 'acp_notice':
      return <MessageAcpNotice message={message}></MessageAcpNotice>;
    case 'acp_permission':
      return <MessageAcpPermission message={message}></MessageAcpPermission>;
    case 'acp_tool_call':
      return <MessageAcpToolCall message={message}></MessageAcpToolCall>;
    case 'codex_permission':
      return <MessageCodexPermission message={message}></MessageCodexPermission>;
    case 'codex_tool_call':
      return <MessageCodexToolCall message={message}></MessageCodexToolCall>;
    default:
      return <div>{t('messages.unknownMessageType', { type: String(message.type) })}</div>;
  }
};

const MessageItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { message: TMessage }>((props, ref) => {
  const { message, className, children, ...rest } = props;
  return (
    <div
      ref={ref}
      {...rest}
      className={classNames(
        'flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-full md:max-w-780px mx-auto',
        message.type,
        {
          'justify-center': message.position === 'center',
          'justify-end': message.position === 'right',
          'justify-start': message.position === 'left',
        },
        className
      )}
    >
      {children ?? <MessageItemContent message={message} />}
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

const MessageList: React.FC<{ className?: string }> = () => {
  const list = useMessageList();
  const conversationId = useChatKey();
  const conversationContext = useConversationContextSafe();
  const ref = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [messageApi, messageContext] = Message.useMessage();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editMode, setEditMode] = useState<'inPlace' | 'fork'>('inPlace');
  const [editMessageIndex, setEditMessageIndex] = useState<number | null>(null);
  const [editTokenSetId, setEditTokenSetId] = useState<string | undefined>();
  const [editFormat, setEditFormat] = useState<string | undefined>();
  const [editMessageId, setEditMessageId] = useState<string | null>(null);
  const [editTokenParts, setEditTokenParts] = useState<EditTokenPart[]>([]);
  const [editPartOverrides, setEditPartOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [partModalVisible, setPartModalVisible] = useState(false);
  const [activePartTokenId, setActivePartTokenId] = useState<string | null>(null);
  const [activePartText, setActivePartText] = useState('');
  const [activePartError, setActivePartError] = useState<string | null>(null);
  const [activePartPreviewUrl, setActivePartPreviewUrl] = useState<string | null>(null);
  const [activePartIsImage, setActivePartIsImage] = useState(false);
  const previousListLengthRef = useRef(list.length);
  const { t } = useTranslation();

  const editableBackendId = conversationContext?.backend ?? '';
  const isEditableBackend = conversationContext?.type === 'acp' && (editableBackendId === 'flux' || editableBackendId === 'custom');

  const resolveHistoryIndex = useCallback(
    (message: TMessage): number | null => {
      if (typeof message.historyIndex === 'number') {
        return message.historyIndex;
      }
      let ordinal = -1;
      for (const entry of list) {
        if (!isEditableTextMessage(entry)) {
          continue;
        }
        ordinal += 1;
        if (entry.id === message.id) {
          return ordinal + HISTORY_MESSAGE_OFFSET;
        }
      }
      return null;
    },
    [list]
  );

  // 提取所有 Codex turn_diff 消息用于汇总显示 / Extract all Codex turn_diff messages for summary display
  const { turnDiffMessages, firstTurnDiffIndex } = useMemo(() => {
    const turnDiffs: TurnDiffContent[] = [];
    let firstIndex = -1;

    list.forEach((message, index) => {
      // Codex turn_diff 消息 / Codex turn_diff messages
      if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
        if (firstIndex === -1) firstIndex = index;
        turnDiffs.push(message.content as TurnDiffContent);
      }
    });

    return { turnDiffMessages: turnDiffs, firstTurnDiffIndex: firstIndex };
  }, [list]);

  // 判断消息是否为 turn_diff 类型（用于跳过单独渲染）/ Check if message is turn_diff type (for skipping individual render)
  const isTurnDiffMessage = (message: TMessage) => {
    return message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff';
  };

  // 检查是否在底部（允许一定的误差范围）
  const isAtBottom = () => {
    if (!ref.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // 滚动到底部
  const scrollToBottom = (smooth = false) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  // 监听用户滚动
  const handleScroll = () => {
    if (!ref.current) return;
    const atBottom = isAtBottom();
    setShowScrollButton(!atBottom);
    setIsUserScrolling(!atBottom);
  };

  const getTokenPart = useCallback(
    (tokenId: string): Record<string, unknown> | null => {
      if (editPartOverrides[tokenId]) {
        return editPartOverrides[tokenId];
      }
      const entry = editTokenParts.find((item) => item.tokenId === tokenId);
      return entry?.part ?? null;
    },
    [editPartOverrides, editTokenParts]
  );

  const openPartEditor = useCallback(
    (tokenId: string) => {
      const part = getTokenPart(tokenId);
      if (!part) {
        messageApi.error(t('common.error', { defaultValue: 'Error' }));
        return;
      }

      setActivePartTokenId(tokenId);
      setActivePartText(JSON.stringify(part, null, 2));
      setActivePartError(null);
      setActivePartPreviewUrl(getInlineDataPreviewUrl(part));
      setActivePartIsImage(Boolean((part as { inlineData?: unknown; fileData?: unknown }).inlineData || (part as { fileData?: unknown }).fileData));
      setPartModalVisible(true);
    },
    [getTokenPart, messageApi, t]
  );

  const handlePartCancel = useCallback(() => {
    setPartModalVisible(false);
    setActivePartTokenId(null);
    setActivePartText('');
    setActivePartError(null);
    setActivePartPreviewUrl(null);
    setActivePartIsImage(false);
  }, []);

  const handlePartSave = useCallback(() => {
    if (!activePartTokenId) {
      return;
    }

    try {
      const parsed = JSON.parse(activePartText) as Record<string, unknown>;
      setEditPartOverrides((prev) => ({ ...prev, [activePartTokenId]: parsed }));
      setEditTokenParts((prev) => prev.map((entry) => (entry.tokenId === activePartTokenId ? { ...entry, part: parsed } : entry)));
      handlePartCancel();
    } catch (error) {
      setActivePartError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }, [activePartText, activePartTokenId, handlePartCancel]);

  const handleReplaceImage = useCallback(async () => {
    if (!activePartTokenId) {
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(activePartText) as Record<string, unknown>;
    } catch (error) {
      setActivePartError(error instanceof Error ? error.message : 'Invalid JSON');
      return;
    }

    const selection = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'avif'],
        },
      ],
    });

    if (!selection || selection.length === 0) {
      return;
    }

    const dataUrl = await ipcBridge.fs.getImageBase64.invoke({ path: selection[0] });
    const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
    const mimeType = match?.[1] || 'application/octet-stream';
    const data = match?.[2] || '';

    const updated = {
      ...parsed,
      inlineData: {
        mimeType,
        data,
      },
    };
    if ('fileData' in updated) {
      delete (updated as { fileData?: unknown }).fileData;
    }

    setActivePartText(JSON.stringify(updated, null, 2));
    setActivePartPreviewUrl(`data:${mimeType};base64,${data}`);
    setActivePartIsImage(true);
    setActivePartError(null);
  }, [activePartText, activePartTokenId]);

  const startEdit = useCallback(
    async (historyIndex: number, mode: 'inPlace' | 'fork', options?: { exactIndex?: boolean; messageId?: string }) => {
      setEditMode(mode);
      setEditMessageIndex(historyIndex);
      setEditMessageId(options?.messageId ?? null);
      setEditContent('');
      setEditTokenSetId(undefined);
      setEditFormat(undefined);
      setEditTokenParts([]);
      setEditPartOverrides({});
      setEditModalVisible(true);
      setEditLoading(true);

      try {
        const result = await ipcBridge.acpConversation.getEditableMessage.invoke({
          conversation_id: conversationId,
          messageIndex: historyIndex,
          exactIndex: options?.exactIndex,
        });

        if (!result.success || !result.data) {
          throw new Error(result.msg || 'Failed to load editable content.');
        }

        const resolvedIndex = typeof result.data.resolvedIndex === 'number' ? result.data.resolvedIndex : historyIndex;
        setEditMessageIndex(resolvedIndex);
        setEditContent(result.data.content ?? '');
        setEditTokenSetId(result.data.tokenSetId);
        setEditFormat(result.data.format);
        setEditTokenParts(result.data.parts ?? []);
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : String(error));
        setEditModalVisible(false);
      } finally {
        setEditLoading(false);
      }
    },
    [conversationId, messageApi]
  );

  const handleEdit = useCallback(
    async (message: TMessage, mode: 'inPlace' | 'fork') => {
      if (!isEditableBackend) {
        return;
      }

      const historyIndex = resolveHistoryIndex(message);
      if (historyIndex === null) {
        messageApi.error(t('messages.editFailed', { defaultValue: 'Unable to edit this message.' }));
        return;
      }

      await startEdit(historyIndex, mode, { messageId: message.id });
    },
    [isEditableBackend, messageApi, resolveHistoryIndex, startEdit, t]
  );

  const handleEditToolCall = useCallback(
    async (toolCall: ToolCallEditTarget) => {
      if (!isEditableBackend) {
        return;
      }

      if (typeof toolCall.callHistoryIndex !== 'number') {
        messageApi.error(t('messages.editFailed', { defaultValue: 'Unable to edit this message.' }));
        return;
      }

      await startEdit(toolCall.callHistoryIndex, 'inPlace', { exactIndex: true });
    },
    [isEditableBackend, messageApi, startEdit, t]
  );

  const handleEditToolResult = useCallback(
    async (toolCall: ToolCallEditTarget) => {
      if (!isEditableBackend) {
        return;
      }

      if (typeof toolCall.responseHistoryIndex !== 'number') {
        messageApi.error(t('messages.editFailed', { defaultValue: 'Unable to edit this message.' }));
        return;
      }

      await startEdit(toolCall.responseHistoryIndex, 'inPlace', { exactIndex: true });
    },
    [isEditableBackend, messageApi, startEdit, t]
  );

  const handleEditConfirm = useCallback(async () => {
    if (editMessageIndex === null) {
      messageApi.error(t('messages.editFailed', { defaultValue: 'Unable to edit this message.' }));
      return;
    }

    setEditLoading(true);
    try {
      const partOverrides = Object.entries(editPartOverrides).map(([tokenId, part]) => ({
        tokenId,
        part,
      }));

      const result = await ipcBridge.acpConversation.editMessage.invoke({
        conversation_id: conversationId,
        messageIndex: editMessageIndex,
        content: editContent,
        mode: editMode,
        format: editFormat,
        tokenSetId: editTokenSetId,
        partOverrides: partOverrides.length ? partOverrides : undefined,
      });

      if (!result.success) {
        throw new Error(result.msg || 'Failed to update message.');
      }

      messageApi.success(t('common.saveSuccess', { defaultValue: 'Saved successfully' }));
      setEditModalVisible(false);
      setEditContent('');
      setEditMessageIndex(null);
      setEditMessageId(null);
      setEditTokenSetId(undefined);
      setEditFormat(undefined);
      setEditTokenParts([]);
      setEditPartOverrides({});
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : String(error));
    } finally {
      setEditLoading(false);
    }
  }, [conversationId, editContent, editFormat, editMessageIndex, editMode, editPartOverrides, editTokenSetId, messageApi, t]);

  const handleEditCancel = useCallback(() => {
    setEditModalVisible(false);
    setEditContent('');
    setEditMessageIndex(null);
    setEditMessageId(null);
    setEditTokenSetId(undefined);
    setEditFormat(undefined);
    setEditTokenParts([]);
    setEditPartOverrides({});
    handlePartCancel();
  }, [handlePartCancel]);

  const handleDelete = useCallback(
    (message: TMessage) => {
      if (!isEditableBackend) {
        return;
      }

      const historyIndex = resolveHistoryIndex(message);
      if (historyIndex === null) {
        messageApi.error(t('common.deleteFailed', { defaultValue: 'Delete failed' }));
        return;
      }

      const fallbackLabel = t('common.thisMessage', { defaultValue: 'this message' });
      const preview = getMessagePreview(message, fallbackLabel);
      Modal.confirm({
        title: t('messages.contextMenu.delete', { defaultValue: 'Delete' }),
        content: t('messages.deleteMessage', {
          name: preview,
          defaultValue: 'Are you sure you want to delete {{name}}?',
        }),
        okText: t('common.delete', { defaultValue: 'Delete' }),
        cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
        onOk: async () => {
          try {
            const result = await ipcBridge.acpConversation.deleteMessage.invoke({
              conversation_id: conversationId,
              messageIndex: historyIndex,
            });

            if (!result.success) {
              throw new Error(result.msg || 'Failed to delete message.');
            }

            messageApi.success(t('common.deleteSuccess', { defaultValue: 'Deleted successfully' }));
          } catch (error) {
            messageApi.error(error instanceof Error ? error.message : String(error));
          }
        },
      });
    },
    [conversationId, isEditableBackend, messageApi, resolveHistoryIndex, t]
  );

  const handleSaveFromHere = useCallback(
    async (message: TMessage, saveName: string) => {
      if (!isEditableBackend) {
        return;
      }

      const historyIndex = resolveHistoryIndex(message);
      if (historyIndex === null) {
        messageApi.error(t('common.saveFailed', { defaultValue: 'Save failed' }));
        return;
      }

      const result = await ipcBridge.acpConversation.saveFromPoint.invoke({
        conversation_id: conversationId,
        messageIndex: historyIndex,
        saveName,
      });

      if (!result.success) {
        messageApi.error(result.msg || t('common.saveFailed', { defaultValue: 'Save failed' }));
        return;
      }

      messageApi.success(t('common.saveSuccess', { defaultValue: 'Saved successfully' }));
    },
    [conversationId, isEditableBackend, messageApi, resolveHistoryIndex, t]
  );

  const handleRegenerate = useCallback(
    async (message: TMessage, mode: 'inPlace' | 'fork') => {
      if (!isEditableBackend) {
        return;
      }

      const historyIndex = resolveHistoryIndex(message);
      if (historyIndex === null) {
        messageApi.error(t('messages.regenerateFailed', { defaultValue: 'Unable to regenerate this message.' }));
        return;
      }

      messageApi.info(t('messages.regenerating', { defaultValue: 'Regenerating...' }));

      try {
        const result = await ipcBridge.acpConversation.regenerateMessage.invoke({
          conversation_id: conversationId,
          messageIndex: historyIndex,
          mode,
        });

        if (!result.success) {
          throw new Error(result.msg || 'Failed to regenerate message.');
        }
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : String(error));
      }
    },
    [conversationId, isEditableBackend, messageApi, resolveHistoryIndex, t]
  );

  // 当消息列表更新时，智能滚动
  useEffect(() => {
    const currentListLength = list.length;
    const isNewMessage = currentListLength !== previousListLengthRef.current;

    // 更新记录的列表长度
    previousListLengthRef.current = currentListLength;

    // 检查最新消息是否是用户发送的（position === 'right'）
    const lastMessage = list[list.length - 1];
    const isUserMessage = lastMessage?.position === 'right';

    // 如果是用户发送的消息，强制滚动到底部并重置滚动状态
    if (isUserMessage && isNewMessage) {
      setIsUserScrolling(false);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      return;
    }

    // 如果用户正在查看历史消息，不自动滚动
    if (isUserScrolling) return;

    // 只在新消息添加时才自动滚动，而不是消息内容更新时
    if (isNewMessage && isAtBottom()) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [list, isUserScrolling]);

  // 点击滚动按钮
  const handleScrollButtonClick = () => {
    scrollToBottom(true);
    setIsUserScrolling(false);
    setShowScrollButton(false);
  };

  return (
    <>
      {messageContext}
      <div className='relative flex-1 h-full'>
        <div className='flex-1 overflow-auto h-full pb-10px box-border' ref={ref} onScroll={handleScroll}>
          {/* 使用 PreviewGroup 包裹所有消息，实现跨消息预览图片 Use PreviewGroup to wrap all messages for cross-message image preview */}
          <Image.PreviewGroup actionsLayout={['zoomIn', 'zoomOut', 'originalSize', 'rotateLeft', 'rotateRight']}>
            <ImagePreviewContext.Provider value={{ inPreviewGroup: true }}>
              {list.map((message, index) => {
                // 跳过 Codex turn_diff 消息的单独渲染（除了第一个位置显示汇总）
                // Skip individual Codex turn_diff message rendering (show summary at first position)
                if (isTurnDiffMessage(message)) {
                  // 在第一个 turn_diff 位置显示汇总组件 / Show summary component at first turn_diff position
                  if (index === firstTurnDiffIndex && turnDiffMessages.length > 0) {
                    return (
                      <div key={`file-changes-${message.id}`} className='w-full message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'>
                        <MessageFileChanges turnDiffChanges={turnDiffMessages} />
                      </div>
                    );
                  }
                  // 跳过其他 turn_diff 消息 / Skip other turn_diff messages
                  return null;
                }

                const canEdit = isEditableBackend && isEditableMessage(message);
                const isToolCallMessage = message.type === 'tool_group' || message.type === 'acp_tool_call';
                const canEditToolCall = isEditableBackend && isToolCallMessage;
                const editHandler = canEdit && !isToolCallMessage ? handleEdit : undefined;
                const editToolCallHandler = canEditToolCall ? handleEditToolCall : undefined;
                const editToolResultHandler = canEditToolCall ? handleEditToolResult : undefined;
                const deleteHandler = canEdit ? handleDelete : undefined;
                const saveHandler = canEdit ? handleSaveFromHere : undefined;
                const regenerateHandler = canEdit ? handleRegenerate : undefined;
                const contextMenuProps = {
                  message,
                  conversationId,
                  onEdit: editHandler,
                  onEditToolCall: editToolCallHandler,
                  onEditToolResult: editToolResultHandler,
                  onDelete: deleteHandler,
                  onRegenerate: regenerateHandler,
                  onSaveFromHere: saveHandler,
                };
                const hasContextMenu = Boolean(editHandler || editToolCallHandler || editToolResultHandler || deleteHandler || regenerateHandler || saveHandler) || message.type === 'text';

                if (!hasContextMenu) {
                  return <MessageItem key={message.id} message={message} />;
                }

                return (
                  <MessageContextMenu key={message.id} {...contextMenuProps}>
                    <MessageItem message={message} />
                  </MessageContextMenu>
                );
              })}
            </ImagePreviewContext.Provider>
          </Image.PreviewGroup>
        </div>
        {showScrollButton && (
          <>
            {/* 渐变遮罩 Gradient mask */}
            <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
            {/* 滚动按钮 Scroll button */}
            <div className='absolute bottom-20px left-50% transform -translate-x-50% z-100'>
              <div className='flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg cursor-pointer hover:bg-1 transition-all hover:scale-110 border-1 border-solid border-3' onClick={handleScrollButtonClick} title={t('messages.scrollToBottom')} style={{ lineHeight: 0 }}>
                <Down theme='filled' size='20' fill={iconColors.secondary} style={{ display: 'block' }} />
              </div>
            </div>
          </>
        )}
      </div>
      <Modal title={t('messages.contextMenu.edit', { defaultValue: 'Edit' })} visible={editModalVisible} onOk={handleEditConfirm} onCancel={handleEditCancel} okText={t('common.save', { defaultValue: 'Save' })} cancelText={t('common.cancel', { defaultValue: 'Cancel' })} okButtonProps={{ loading: editLoading }} cancelButtonProps={{ disabled: editLoading }}>
        <Input.TextArea value={editContent} onChange={setEditContent} autoSize={{ minRows: 6, maxRows: 16 }} />
        <div className='mt-8px text-12px text-[var(--color-text-3)]'>
          {t('messages.editTokensHint', {
            defaultValue: 'Keep any [[AIONUI_PART:...]] tokens to preserve non-text parts.',
          })}
        </div>
        {editTokenParts.length > 0 && (
          <div className='mt-12px'>
            <div className='text-12px text-[var(--color-text-3)]'>Non-text parts</div>
            <div className='mt-6px flex flex-col gap-6px'>
              {editTokenParts.map((entry) => {
                const part = editPartOverrides[entry.tokenId] ?? entry.part;
                return (
                  <div key={entry.tokenId} className='flex items-center justify-between gap-8px'>
                    <div className='flex flex-col'>
                      <span className='font-mono text-12px text-[var(--color-text-3)] cursor-pointer' onClick={() => openPartEditor(entry.tokenId)}>
                        {`[[AIONUI_PART:${entry.tokenId}]]`}
                      </span>
                      <span className='text-12px text-[var(--color-text-2)]'>{getPartLabel(part)}</span>
                    </div>
                    <Button size='mini' onClick={() => openPartEditor(entry.tokenId)}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>
      <Modal title={t('common.edit', { defaultValue: 'Edit' })} visible={partModalVisible} onOk={handlePartSave} onCancel={handlePartCancel} okText={t('common.save', { defaultValue: 'Save' })} cancelText={t('common.cancel', { defaultValue: 'Cancel' })}>
        <Input.TextArea value={activePartText} onChange={setActivePartText} autoSize={{ minRows: 6, maxRows: 16 }} />
        {activePartError && <div className='mt-6px text-12px text-[rgb(var(--danger-6))]'>{activePartError}</div>}
        {(activePartPreviewUrl || activePartIsImage) && (
          <div className='mt-12px flex items-center gap-12px'>
            {activePartPreviewUrl && <Image src={activePartPreviewUrl} width={96} height={96} />}
            <Button onClick={handleReplaceImage}>Replace image</Button>
          </div>
        )}
      </Modal>
    </>
  );
};

export default MessageList;
