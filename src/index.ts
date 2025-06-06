#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { USER_INPUT_TIMEOUT_SECONDS } from './constants.js';
import { createInteractiveServer } from './createServer.js';

const argv = yargs(hideBin(process.argv))
  .option('timeout', {
    alias: 't',
    type: 'number',
    description: 'Default timeout for user input prompts in seconds',
    default: USER_INPUT_TIMEOUT_SECONDS,
  })
  .option('disable-tools', {
    alias: 'd',
    type: 'string',
    description:
      'Comma-separated list of tool names to disable. Available options: request_user_input, message_complete_notification, intensive_chat (disables all intensive chat tools).',
    default: '',
  })
  .help()
  .alias('help', 'h')
  .parseSync();

const globalTimeoutSeconds = argv.timeout as number;
const disabledTools = (argv['disable-tools'] as string)
  .split(',')
  .map((tool) => tool.trim())
  .filter(Boolean);

const server = createInteractiveServer({
  timeoutSeconds: globalTimeoutSeconds,
  disabledTools,
});

const transport = new StdioServerTransport();
await server.connect(transport);
