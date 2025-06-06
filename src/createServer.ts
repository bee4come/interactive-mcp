import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import notifier from 'node-notifier';
import { getCmdWindowInput } from './commands/input/index.js';
import {
  startIntensiveChatSession,
  askQuestionInSession,
  stopIntensiveChatSession,
} from './commands/intensive-chat/index.js';
import { USER_INPUT_TIMEOUT_SECONDS } from './constants.js';
import { requestUserInputTool } from './tool-definitions/request-user-input.js';
import { messageCompleteNotificationTool } from './tool-definitions/message-complete-notification.js';
import { intensiveChatTools } from './tool-definitions/intensive-chat.js';
import { ToolCapabilityInfo } from './tool-definitions/types.js';

export interface ServerOptions {
  timeoutSeconds?: number;
  disabledTools?: string[];
}

export function createInteractiveServer(options: ServerOptions = {}) {
  const globalTimeoutSeconds =
    options.timeoutSeconds ?? USER_INPUT_TIMEOUT_SECONDS;
  const disabledTools = options.disabledTools ?? [];

  type ToolCapabilitiesStructure = Record<string, ToolCapabilityInfo>;
  const allToolCapabilities = {
    request_user_input: requestUserInputTool.capability,
    message_complete_notification: messageCompleteNotificationTool.capability,
    start_intensive_chat: intensiveChatTools.start.capability,
    ask_intensive_chat: intensiveChatTools.ask.capability,
    stop_intensive_chat: intensiveChatTools.stop.capability,
  } satisfies ToolCapabilitiesStructure;

  const isToolDisabled = (toolName: string): boolean => {
    if (disabledTools.includes(toolName)) {
      return true;
    }
    if (
      [
        'start_intensive_chat',
        'ask_intensive_chat',
        'stop_intensive_chat',
      ].includes(toolName) &&
      disabledTools.includes('intensive_chat')
    ) {
      return true;
    }
    return false;
  };

  const enabledToolCapabilities = Object.fromEntries(
    Object.entries(allToolCapabilities).filter(([toolName]) => {
      return !isToolDisabled(toolName);
    }),
  ) as ToolCapabilitiesStructure;

  const isToolEnabled = (toolName: string): boolean => {
    return toolName in enabledToolCapabilities;
  };

  const server = new McpServer({
    name: 'Interactive MCP',
    version: '1.0.0',
    capabilities: {
      tools: enabledToolCapabilities,
    },
  });

  const activeChatSessions = new Map<string, string>();

  if (isToolEnabled('request_user_input')) {
    server.tool(
      'request_user_input',
      typeof requestUserInputTool.description === 'function'
        ? requestUserInputTool.description(globalTimeoutSeconds)
        : requestUserInputTool.description,
      requestUserInputTool.schema,
      async (args) => {
        const { projectName, message, predefinedOptions } = args;
        const promptMessage = `${projectName}: ${message}`;
        const answer = await getCmdWindowInput(
          projectName,
          promptMessage,
          globalTimeoutSeconds,
          true,
          predefinedOptions,
        );
        if (answer === '__TIMEOUT__') {
          return {
            content: [
              { type: 'text', text: 'User did not reply: Timeout occurred.' },
            ],
          };
        } else if (answer === '') {
          return {
            content: [{ type: 'text', text: 'User replied with empty input.' }],
          };
        } else {
          const reply = `User replied: ${answer}`;
          return { content: [{ type: 'text', text: reply }] };
        }
      },
    );
  }

  if (isToolEnabled('message_complete_notification')) {
    server.tool(
      'message_complete_notification',
      typeof messageCompleteNotificationTool.description === 'function'
        ? messageCompleteNotificationTool.description(globalTimeoutSeconds)
        : messageCompleteNotificationTool.description,
      messageCompleteNotificationTool.schema,
      (args) => {
        const { projectName, message } = args;
        notifier.notify({ title: projectName, message });
        return { content: [{ type: 'text', text: 'Notification sent.' }] };
      },
    );
  }

  if (isToolEnabled('start_intensive_chat')) {
    server.tool(
      'start_intensive_chat',
      typeof intensiveChatTools.start.description === 'function'
        ? intensiveChatTools.start.description(globalTimeoutSeconds)
        : intensiveChatTools.start.description,
      intensiveChatTools.start.schema,
      async (args) => {
        const { sessionTitle } = args;
        try {
          const sessionId = await startIntensiveChatSession(
            sessionTitle,
            globalTimeoutSeconds,
          );
          activeChatSessions.set(sessionId, sessionTitle);
          return {
            content: [
              {
                type: 'text',
                text: `Intensive chat session started successfully. Session ID: ${sessionId}`,
              },
            ],
          };
        } catch (error: unknown) {
          let errorMessage = 'Failed to start intensive chat session.';
          if (error instanceof Error) {
            errorMessage = `Failed to start intensive chat session: ${error.message}`;
          } else if (typeof error === 'string') {
            errorMessage = `Failed to start intensive chat session: ${error}`;
          }
          return {
            content: [{ type: 'text', text: errorMessage }],
          };
        }
      },
    );
  }

  if (isToolEnabled('ask_intensive_chat')) {
    server.tool(
      'ask_intensive_chat',
      typeof intensiveChatTools.ask.description === 'function'
        ? intensiveChatTools.ask.description(globalTimeoutSeconds)
        : intensiveChatTools.ask.description,
      intensiveChatTools.ask.schema,
      async (args) => {
        const { sessionId, question, predefinedOptions } = args;
        if (!activeChatSessions.has(sessionId)) {
          return {
            content: [
              { type: 'text', text: 'Error: Invalid or expired session ID.' },
            ],
          };
        }
        try {
          const answer = await askQuestionInSession(
            sessionId,
            question,
            predefinedOptions,
          );
          if (answer === '__TIMEOUT__') {
            return {
              content: [
                {
                  type: 'text',
                  text: 'User did not reply to question in intensive chat: Timeout occurred.',
                },
              ],
            };
          } else if (answer === '') {
            return {
              content: [
                {
                  type: 'text',
                  text: 'User replied with empty input in intensive chat.',
                },
              ],
            };
          } else {
            return {
              content: [{ type: 'text', text: `User replied: ${answer}` }],
            };
          }
        } catch (error: unknown) {
          let errorMessage = 'Failed to ask question in session.';
          if (error instanceof Error) {
            errorMessage = `Failed to ask question in session: ${error.message}`;
          } else if (typeof error === 'string') {
            errorMessage = `Failed to ask question in session: ${error}`;
          }
          return { content: [{ type: 'text', text: errorMessage }] };
        }
      },
    );
  }

  if (isToolEnabled('stop_intensive_chat')) {
    server.tool(
      'stop_intensive_chat',
      typeof intensiveChatTools.stop.description === 'function'
        ? intensiveChatTools.stop.description(globalTimeoutSeconds)
        : intensiveChatTools.stop.description,
      intensiveChatTools.stop.schema,
      async (args) => {
        const { sessionId } = args;
        if (!activeChatSessions.has(sessionId)) {
          return {
            content: [
              { type: 'text', text: 'Error: Invalid or expired session ID.' },
            ],
          };
        }
        try {
          const success = await stopIntensiveChatSession(sessionId);
          if (success) {
            activeChatSessions.delete(sessionId);
          }
          const message = success
            ? 'Session stopped successfully.'
            : 'Session not found or already stopped.';
          return { content: [{ type: 'text', text: message }] };
        } catch (error: unknown) {
          let errorMessage = 'Failed to stop intensive chat session.';
          if (error instanceof Error) {
            errorMessage = `Failed to stop intensive chat session: ${error.message}`;
          } else if (typeof error === 'string') {
            errorMessage = `Failed to stop intensive chat session: ${error}`;
          }
          return { content: [{ type: 'text', text: errorMessage }] };
        }
      },
    );
  }

  return server;
}
