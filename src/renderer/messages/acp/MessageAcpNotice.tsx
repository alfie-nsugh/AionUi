/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpNotice } from '@/common/chatLib';
import { Close, CheckOne, Attention } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useUpdateMessageList } from '../hooks';

const iconMap: Record<IMessageAcpNotice['content']['level'], React.ReactNode> = {
  success: <CheckOne theme='filled' size='16' fill={theme.Color.FunctionalColor.success} />,
  warning: <Attention theme='filled' size='16' fill={theme.Color.FunctionalColor.warn} />,
  error: <Attention theme='filled' size='16' fill={theme.Color.FunctionalColor.error} />,
  info: <Attention theme='filled' size='16' fill='rgb(var(--primary-6))' />,
};

const MessageAcpNotice: React.FC<{ message: IMessageAcpNotice }> = ({ message }) => {
  const update = useUpdateMessageList();
  const { message: text, level, dismissible } = message.content;

  const handleDismiss = useCallback(() => {
    update((list) => list.filter((item) => item.id !== message.id));
  }, [message.id, update]);

  const icon = useMemo(() => iconMap[level] ?? iconMap.info, [level]);

  return (
    <div className={classNames('bg-message-tips rd-8px p-x-12px p-y-10px flex items-start gap-8px w-full')}>
      <span className='m-t-2px'>{icon}</span>
      <div className='flex-1 whitespace-pre-wrap text-t-primary [word-break:break-word]'>{text}</div>
      {dismissible !== false && (
        <button type='button' className='p-4px rd-6px hover:bg-bg-3 transition-colors text-t-tertiary' aria-label='Dismiss' onClick={handleDismiss}>
          <Close size={14} />
        </button>
      )}
    </div>
  );
};

export default MessageAcpNotice;
