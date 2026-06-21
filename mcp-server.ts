#!/usr/bin/env node
/**
 * Personal Push — MCP Server
 *
 * Exposes Personal Push as MCP tools so any AI agent can send push
 * notifications and manage devices.
 *
 * Configuration (environment variables):
 *   PERSONAL_PUSH_URL      Base URL of your deployment, e.g. https://personal-push.vercel.app
 *   PERSONAL_PUSH_API_KEY  Your API_SECRET_KEY
 *
 * Usage in claude_desktop_config.json / mcp settings:
 *   {
 *     "personal-push": {
 *       "command": "npx",
 *       "args": ["tsx", "/absolute/path/to/mcp-server.ts"],
 *       "env": {
 *         "PERSONAL_PUSH_URL": "https://your-deployment.vercel.app",
 *         "PERSONAL_PUSH_API_KEY": "your-secret-key"
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = (process.env.PERSONAL_PUSH_URL ?? '').replace(/\/$/, '');
const API_KEY  = process.env.PERSONAL_PUSH_API_KEY ?? '';

if (!BASE_URL) {
  process.stderr.write('PERSONAL_PUSH_URL is required\n');
  process.exit(1);
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

const TOOLS: Tool[] = [
  {
    name: 'send_notification',
    description:
      'Send a push notification to approved iPhone devices. ' +
      'Use target="all" to broadcast or pass a device label to reach one device.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title:  { type: 'string', description: 'Notification title (required)' },
        body:   { type: 'string', description: 'Notification body text' },
        url:    { type: 'string', description: 'URL to open when the notification is tapped' },
        target: {
          type: 'string',
          default: 'all',
          description: '"all" to send to every approved device, or a device label such as "My iPhone"',
        },
      },
    },
  },
  {
    name: 'list_devices',
    description:
      'List all registered devices and their approval status (pending / approved / rejected). ' +
      'Requires PERSONAL_PUSH_API_KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected'],
          description: 'Filter by status (omit to return all)',
        },
      },
    },
  },
  {
    name: 'approve_device',
    description: 'Approve a pending device so it can receive push notifications.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Device UUID (from list_devices)' },
      },
    },
  },
  {
    name: 'reject_device',
    description: 'Reject a device. It will not receive notifications. Rejection is sticky — delete the device to allow re-registration.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Device UUID (from list_devices)' },
      },
    },
  },
  {
    name: 'delete_device',
    description:
      'Permanently delete a device record. ' +
      'Deleting a rejected device allows it to re-register as pending.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Device UUID (from list_devices)' },
      },
    },
  },
];

const server = new Server(
  { name: 'personal-push', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      case 'send_notification': {
        const { title, body, url, target = 'all' } = args as Record<string, string>;
        const result = await apiFetch('/api/notify', {
          method: 'POST',
          body: JSON.stringify({ title, body, url, target }),
        }) as { sent: number; failed: number };
        return {
          content: [{
            type: 'text',
            text: `Notification sent. Delivered to ${result.sent} device(s)${result.failed ? `, ${result.failed} failed` : ''}.`,
          }],
        };
      }

      case 'list_devices': {
        const { status } = args as { status?: string };
        const devices = await apiFetch('/api/admin/devices') as Array<{
          id: string; label: string; status: string; createdAt: string; lastSeenAt: string;
        }>;
        const filtered = status ? devices.filter(d => d.status === status) : devices;
        const summary = filtered.map(d =>
          `• ${d.label} [${d.status}] — id: ${d.id}, last seen: ${d.lastSeenAt}`,
        ).join('\n');
        return {
          content: [{
            type: 'text',
            text: filtered.length
              ? `${filtered.length} device(s):\n${summary}`
              : 'No devices found.',
          }],
        };
      }

      case 'approve_device': {
        const { id } = args as { id: string };
        await apiFetch(`/api/admin/devices/${id}/approve`, { method: 'POST' });
        return { content: [{ type: 'text', text: `Device ${id} approved.` }] };
      }

      case 'reject_device': {
        const { id } = args as { id: string };
        await apiFetch(`/api/admin/devices/${id}/reject`, { method: 'POST' });
        return { content: [{ type: 'text', text: `Device ${id} rejected.` }] };
      }

      case 'delete_device': {
        const { id } = args as { id: string };
        await apiFetch(`/api/admin/devices/${id}`, { method: 'DELETE' });
        return { content: [{ type: 'text', text: `Device ${id} deleted.` }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
