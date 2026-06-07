import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getClientToken(clientId: string, provider: string) {
  const result = await db.execute(
    sql`SELECT access_token, refresh_token, realm_id
        FROM client_tokens
        WHERE client_id = ${clientId} AND provider = ${provider}
        LIMIT 1`,
  );
  const rows = (result as any).rows ?? [];
  if (!rows.length) throw new Error(`No ${provider} token for client ${clientId}`);
  return rows[0] as { access_token: string; refresh_token: string; realm_id?: string };
}

function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildRfc2822(to: string, subject: string, body: string): string {
  return [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');
}

async function gmailRequest(accessToken: string, path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

export async function executeToolCall(toolName: string, toolInput: any): Promise<any> {
  switch (toolName) {
    case 'send_email': {
      try {
        const { client_id, to, subject, body } = toolInput;
        const { access_token } = await getClientToken(String(client_id), 'gmail');
        const raw = toBase64Url(buildRfc2822(to, subject, body));
        const data = await gmailRequest(access_token, '/messages/send', {
          method: 'POST',
          body: JSON.stringify({ raw }),
        });
        return { success: true, messageId: data.id };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'fetch_qbo_bills': {
      try {
        const { client_id } = toolInput;
        const { access_token, realm_id } = await getClientToken(String(client_id), 'qbo');
        if (!realm_id) throw new Error('No QBO realm_id for client ' + client_id);
        const query = encodeURIComponent('SELECT * FROM Bill WHERE Balance > 0');
        const baseUrl = process.env['QBO_ENVIRONMENT'] === 'sandbox'
          ? 'https://sandbox-quickbooks.api.intuit.com'
          : 'https://quickbooks.api.intuit.com';
        const res = await fetch(`${baseUrl}/v3/company/${realm_id}/query?query=${query}&minorversion=65`, {
          headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`QBO API ${res.status}: ${await res.text()}`);
        const data: any = await res.json();
        const bills: any[] = data?.QueryResponse?.Bill ?? [];
        return bills.map((b: any) => ({
          id: b.Id,
          vendor: b.VendorRef?.name ?? b.VendorRef?.value ?? 'Unknown',
          amount: b.TotalAmt,
          dueDate: b.DueDate,
        }));
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'create_asana_task': {
      try {
        const { title, notes, section_id, assignee } = toolInput;
        const token = process.env['ASANA_TOKEN'];
        if (!token) throw new Error('ASANA_TOKEN not set');
        const body: any = { data: { name: title, notes: notes ?? '', memberships: [{ section: section_id }] } };
        if (assignee) body.data.assignee = assignee;
        const res = await fetch('https://app.asana.com/api/1.0/tasks', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Asana API ${res.status}: ${await res.text()}`);
        const data: any = await res.json();
        return { success: true, taskId: data?.data?.gid };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'read_gmail': {
      try {
        const { client_id, max_results = 10, label } = toolInput;
        const { access_token } = await getClientToken(String(client_id), 'gmail');
        const params = new URLSearchParams({ maxResults: String(max_results) });
        if (label) params.set('q', `label:${label}`);
        const listData = await gmailRequest(access_token, `/messages?${params}`);
        const messageIds: string[] = (listData.messages ?? []).map((m: any) => m.id);
        const emails = await Promise.all(
          messageIds.map(async (id) => {
            const msg = await gmailRequest(
              access_token,
              `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            );
            const headers: any[] = msg.payload?.headers ?? [];
            const get = (name: string) => headers.find((h: any) => h.name === name)?.value ?? '';
            return { id: msg.id, from: get('From'), subject: get('Subject'), snippet: msg.snippet, date: get('Date') };
          }),
        );
        return emails;
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'update_ap_status': {
      try {
        const { bill_id, status, notes } = toolInput;
        await db.execute(
          sql`UPDATE bills SET status = ${status}, notes = ${notes ?? null} WHERE id = ${bill_id}`,
        );
        return { success: true };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    case 'draft_reply': {
      try {
        const { client_id, thread_id, body } = toolInput;
        const { access_token } = await getClientToken(String(client_id), 'gmail');
        const raw = toBase64Url(buildRfc2822('', 'Re: (draft)', body));
        const data = await gmailRequest(access_token, '/drafts', {
          method: 'POST',
          body: JSON.stringify({ message: { threadId: thread_id, raw } }),
        });
        return { success: true, draftId: data?.id };
      } catch (err: any) {
        return { error: err.message };
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
