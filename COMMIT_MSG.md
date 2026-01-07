feat(webui): add slash command autocomplete and ACP completions

- add SlashCommandAutocomplete UI + CSS and useSlashCommands hook with static/dynamic suggestions
- integrate autocomplete into the Flux home input and ACP conversation send box
- add ACP commands/complete IPC path (ipcBridge, acpConversationBridge, AcpAgentManager) and RPC passthroughs on AcpAgent/AcpConnection
- improve WebUI/CLI runtime support: choose TS workers when ts-node is active, fall back to child_process.fork, and normalize IPC message handling
- load dotenv for the standalone web server and add a resetpass script with updated guide usage
- log SendBox input changes for debugging
