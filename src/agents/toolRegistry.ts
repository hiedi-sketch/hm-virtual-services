export type JSONSchemaProperty =
  | { type: 'string'; description?: string; default?: string }
  | { type: 'number'; description?: string; default?: number }
  | { type: 'boolean'; description?: string; default?: boolean };

export type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
};

export const TOOL_REGISTRY: Tool[] = [
  {
    name: 'send_email',
    description: 'Sends an email on behalf of a client via the Gmail API.',
    input_schema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address.',
        },
        subject: {
          type: 'string',
          description: 'Subject line of the email.',
        },
        body: {
          type: 'string',
          description: 'Plain-text or HTML body of the email.',
        },
        client_id: {
          type: 'string',
          description: 'ID of the client whose Gmail credentials to use.',
        },
      },
      required: ['to', 'subject', 'body', 'client_id'],
    },
  },
  {
    name: 'fetch_qbo_bills',
    description: 'Fetches bills from QuickBooks Online for a given client.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'ID of the client whose QBO account to query.',
        },
        status: {
          type: 'string',
          description: 'Bill status filter. Defaults to "unpaid".',
          default: 'unpaid',
        },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'create_asana_task',
    description: 'Creates a new task in Asana within a specified section.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Name of the task.',
        },
        notes: {
          type: 'string',
          description: 'Optional description or notes for the task.',
        },
        section_id: {
          type: 'string',
          description: 'GID of the Asana section to create the task in.',
        },
        assignee: {
          type: 'string',
          description: 'Optional Asana user GID or email to assign the task to.',
        },
      },
      required: ['title', 'section_id'],
    },
  },
  {
    name: 'read_gmail',
    description: "Reads recent emails from a client's linked Gmail inbox.",
    input_schema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'ID of the client whose Gmail inbox to read.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of emails to return. Defaults to 10.',
          default: 10,
        },
        label: {
          type: 'string',
          description: 'Optional Gmail label to filter by (e.g. "INBOX", "UNREAD").',
        },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'update_ap_status',
    description: "Updates a bill's status in the accounts-payable workflow table.",
    input_schema: {
      type: 'object',
      properties: {
        bill_id: {
          type: 'string',
          description: 'ID of the bill to update.',
        },
        status: {
          type: 'string',
          description: 'New status value (e.g. "approved", "rejected", "pending_review").',
        },
        notes: {
          type: 'string',
          description: 'Optional notes to attach to the status change.',
        },
      },
      required: ['bill_id', 'status'],
    },
  },
  {
    name: 'draft_reply',
    description: 'Creates a Gmail draft reply to an existing email thread.',
    input_schema: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'Gmail thread ID to reply to.',
        },
        client_id: {
          type: 'string',
          description: 'ID of the client whose Gmail credentials to use.',
        },
        body: {
          type: 'string',
          description: 'Body text of the draft reply.',
        },
      },
      required: ['thread_id', 'client_id', 'body'],
    },
  },
];

export function getToolByName(name: string): Tool | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}
