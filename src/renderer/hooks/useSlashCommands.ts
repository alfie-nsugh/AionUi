/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hook for slash command autocomplete
 *
 * Provides command suggestions when user types '/' in the input.
 * Supports both static commands (on main page) and dynamic backend completions (in conversation).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AcpBackend } from '@/types/acpTypes';

export interface SlashCommandInfo {
  /** Display name in the dropdown */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category: built-in, save, user, or extension name */
  category: string;
  /** Full text to insert when selected (for argument completions) */
  text?: string;
  /** Whether this is an argument completion */
  isArgument?: boolean;
}

interface UseSlashCommandsResult {
  /** Available commands matching current input */
  suggestions: SlashCommandInfo[];
  /** Whether autocomplete should be shown */
  showAutocomplete: boolean;
  /** Update input and filter suggestions */
  handleInputChange: (input: string) => void;
  /** Select a command from suggestions */
  selectCommand: (command: SlashCommandInfo) => string;
  /** Close autocomplete */
  closeAutocomplete: () => void;
  /** Highlighted suggestion index */
  highlightIndex: number;
  /** Move highlight up */
  highlightUp: () => void;
  /** Move highlight down */
  highlightDown: () => void;
  /** Get highlighted command */
  getHighlightedCommand: () => SlashCommandInfo | null;
}

/**
 * Static commands for when no backend connection is available
 * These cover the core functionality available in Flux
 */
const STATIC_COMMANDS: SlashCommandInfo[] = [
  { name: '/help', description: 'Show available commands', category: 'built-in' },
  { name: '/copy', description: 'Copy last response to clipboard', category: 'built-in' },
  { name: '/chat save', description: 'Save the current conversation', category: 'built-in' },
  { name: '/chat resume', description: 'Resume a saved conversation', category: 'built-in' },
  { name: '/chat list', description: 'List saved checkpoints', category: 'built-in' },
  { name: '/chat delete', description: 'Delete a saved checkpoint', category: 'built-in' },
  // Conductor extension commands (commonly used)
  { name: '/conductor:status', description: 'Displays the current progress of the project', category: 'conductor' },
  { name: '/conductor:setup', description: 'Scaffolds the project and sets up the Conductor environment', category: 'conductor' },
  { name: '/conductor:newTrack', description: 'Plans a track and generates track-specific spec documents', category: 'conductor' },
  { name: '/conductor:implement', description: 'Executes the tasks defined in the specified track plan', category: 'conductor' },
  { name: '/conductor:revert', description: 'Reverts previous work', category: 'conductor' },
];

interface UseSlashCommandsOptions {
  /** Optional function to fetch completions from backend */
  fetchCompletions?: (input: string) => Promise<SlashCommandInfo[]>;
  /** Debounce delay in ms for backend calls */
  debounceMs?: number;
}

export function useSlashCommands(backend: AcpBackend, options: UseSlashCommandsOptions = {}): UseSlashCommandsResult {
  const { fetchCompletions, debounceMs = 150 } = options;

  const [suggestions, setSuggestions] = useState<SlashCommandInfo[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInputRef = useRef<string>('');

  // Only active for Flux backend
  const isFlux = backend === 'flux';

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Filter static commands by input
  const filterStaticCommands = useCallback((input: string): SlashCommandInfo[] => {
    const lowerInput = input.toLowerCase();
    return STATIC_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(lowerInput));
  }, []);

  // Handle input change - first show static results, then fetch from backend
  const handleInputChange = useCallback(
    (input: string) => {
      lastInputRef.current = input;

      if (!isFlux) {
        setShowAutocomplete(false);
        return;
      }

      // Must start with / and be reasonably short
      if (!input.startsWith('/') || input.length > 50) {
        setShowAutocomplete(false);
        return;
      }

      // Immediately show static command suggestions
      const staticResults = filterStaticCommands(input);
      setSuggestions(staticResults);
      setShowAutocomplete(staticResults.length > 0);
      setHighlightIndex(0);

      // If we have a fetchCompletions function and the input suggests argument completion
      // (e.g., /chat resume ), fetch from backend with debouncing
      if (fetchCompletions) {
        // Clear previous debounce
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        // Check if we're typing arguments (space after command)
        const needsBackendFetch =
          input.match(/^\/\w+\s+\w*\s+/i) || // Command with subcommand and arg space
          input.match(/^\/\w+:\w+\s+/i); // Extension command with arg space

        if (needsBackendFetch || staticResults.length === 0) {
          debounceRef.current = setTimeout(async () => {
            // Verify input hasn't changed during debounce
            if (lastInputRef.current !== input) return;

            try {
              const backendResults = await fetchCompletions(input);
              // Verify input still matches
              if (lastInputRef.current !== input) return;

              if (backendResults.length > 0) {
                setSuggestions(backendResults);
                setShowAutocomplete(true);
                setHighlightIndex(0);
              }
            } catch (error) {
              console.warn('[useSlashCommands] Backend fetch failed:', error);
              // Keep showing static results on error
            }
          }, debounceMs);
        }
      }
    },
    [isFlux, filterStaticCommands, fetchCompletions, debounceMs]
  );

  // Select a command
  const selectCommand = useCallback((command: SlashCommandInfo): string => {
    setShowAutocomplete(false);

    // If there's a 'text' field, use it (for argument completions)
    if (command.text) {
      return command.text;
    }

    // For commands with subcommands, add trailing space
    if (command.name.includes(' ') && !command.isArgument) {
      return command.name + ' ';
    }

    // Simple command
    return command.name;
  }, []);

  // Close autocomplete
  const closeAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Navigate suggestions
  const highlightUp = useCallback(() => {
    setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
  }, [suggestions.length]);

  const highlightDown = useCallback(() => {
    setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
  }, [suggestions.length]);

  // Get currently highlighted command
  const getHighlightedCommand = useCallback((): SlashCommandInfo | null => {
    if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
      return suggestions[highlightIndex];
    }
    return null;
  }, [highlightIndex, suggestions]);

  return {
    suggestions,
    showAutocomplete,
    handleInputChange,
    selectCommand,
    closeAutocomplete,
    highlightIndex,
    highlightUp,
    highlightDown,
    getHighlightedCommand,
  };
}
