/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Slash Command Autocomplete Dropdown
 *
 * Shows command suggestions when user types '/' in the input.
 */

import React from 'react';
import type { SlashCommandInfo } from '@/renderer/hooks/useSlashCommands';
import './SlashCommandAutocomplete.css';

interface SlashCommandAutocompleteProps {
  suggestions: SlashCommandInfo[];
  highlightIndex: number;
  onSelect: (command: SlashCommandInfo) => void;
  onClose: () => void;
  visible: boolean;
}

const SlashCommandAutocomplete: React.FC<SlashCommandAutocompleteProps> = ({ suggestions, highlightIndex, onSelect, visible }) => {
  if (!visible || suggestions.length === 0) {
    return null;
  }

  // Group suggestions by category
  const grouped = suggestions.reduce(
    (acc, cmd) => {
      const cat = cmd.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(cmd);
      return acc;
    },
    {} as Record<string, SlashCommandInfo[]>
  );

  // Flatten back to get index mapping
  let flatIndex = 0;

  return (
    <div className='slash-command-autocomplete'>
      {Object.entries(grouped).map(([category, commands]) => (
        <div key={category} className='slash-command-category'>
          <div className='slash-command-category-header'>{category === 'built-in' ? 'Commands' : category}</div>
          {commands.map((cmd) => {
            const currentIndex = flatIndex++;
            const isHighlighted = currentIndex === highlightIndex;
            return (
              <div
                key={cmd.name}
                className={`slash-command-item ${isHighlighted ? 'highlighted' : ''}`}
                onClick={() => onSelect(cmd)}
                onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
              >
                <span className='slash-command-name'>{cmd.name}</span>
                <span className='slash-command-desc'>{cmd.description}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default SlashCommandAutocomplete;
