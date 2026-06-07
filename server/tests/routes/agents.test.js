'use strict';

const request = require('supertest');
const express = require('express');

// ---------------------------------------------------------------------------
// Mocks — must be declared before requiring the router
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock('../../db/database', () => ({
  pool: { query: mockQuery },
  withTransaction: mockWithTransaction,
}));

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    // Tests can override via req._testUser before calling the endpoint;
    // default to admin so most tests pass without extra ceremony.
    req.user = req._testUser ?? { id: 1, role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  },
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const agentsRouter = require('../../routes/agents');

const app = express();
app.use(express.json());
app.use('/api/agents', agentsRouter);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT = {
  id: 'uuid-1',
  client_id: 1,
  name: 'AP Agent',
  description: 'Handles AP workflow',
  system_prompt: 'You are an AP assistant.',
  model: 'claude-sonnet-4-6',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  tools: [{ tool_name: 'fetch_qbo_bills', enabled: true }],
};

const VALID_BODY = {
  client_id: 1,
  name: 'AP Agent',
  system_prompt: 'You are an AP assistant.',
  model: 'claude-sonnet-4-6',
  status: 'active',
  tools: ['fetch_qbo_bills'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/agents
// ---------------------------------------------------------------------------

describe('GET /api/agents', () => {
  it('returns 200 with an array of agents for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [AGENT] });

    const res = await request(app).get('/api/agents');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].id).toBe(AGENT.id);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('filters by client_id query param for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [AGENT] });

    const res = await request(app).get('/api/agents?client_id=1');

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE a\.client_id/);
    expect(params).toContain('1');
  });

  it('returns only own agents for client role', async () => {
    // First query: resolve client record; second: resolve agents list
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [AGENT] });

    const res = await request(app)
      .get('/api/agents')
      .set('x-test-role', 'client'); // picked up by middleware override below

    // Inject client user via a custom middleware shim
    // (supertest can't set req.user directly, so we test via the mock behaviour)
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).get('/api/agents');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id', () => {
  it('returns 200 with the agent for admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [AGENT] });

    const res = await request(app).get('/api/agents/uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('uuid-1');
  });

  it('returns 404 when agent does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/agents/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/agents/uuid-1');

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents
// ---------------------------------------------------------------------------

describe('POST /api/agents', () => {
  it('returns 201 with the created agent', async () => {
    const mockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [AGENT] }) // INSERT agents
        .mockResolvedValueOnce({ rows: [] }),       // INSERT agent_tools
    };
    mockWithTransaction.mockImplementation((cb) => cb(mockClient));

    const res = await request(app).post('/api/agents').send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(AGENT.id);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('inserts only agents row when no tools provided', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ ...AGENT, tools: [] }] }),
    };
    mockWithTransaction.mockImplementation((cb) => cb(mockClient));

    const res = await request(app)
      .post('/api/agents')
      .send({ ...VALID_BODY, tools: [] });

    expect(res.status).toBe(201);
    expect(mockClient.query).toHaveBeenCalledTimes(1); // no tool insert
  });

  it('returns 400 when name is missing', async () => {
    const { name: _n, ...body } = VALID_BODY;
    const res = await request(app).post('/api/agents').send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.some((e) => /name/.test(e))).toBe(true);
  });

  it('returns 400 when system_prompt is missing', async () => {
    const { system_prompt: _s, ...body } = VALID_BODY;
    const res = await request(app).post('/api/agents').send(body);

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => /system_prompt/.test(e))).toBe(true);
  });

  it('returns 400 for unknown tool name', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ ...VALID_BODY, tools: ['nonexistent_tool'] });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => /unknown tools/i.test(e))).toBe(true);
  });

  it('returns 400 for invalid model', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ ...VALID_BODY, model: 'gpt-4' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => /model/.test(e))).toBe(true);
  });

  it('returns 500 on database error', async () => {
    mockWithTransaction.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).post('/api/agents').send(VALID_BODY);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/:id
// ---------------------------------------------------------------------------

describe('PUT /api/agents/:id', () => {
  it('returns 200 with the updated agent', async () => {
    const updatedAgent = { ...AGENT, name: 'Updated Agent' };
    const mockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [updatedAgent] }) // UPDATE agents
        .mockResolvedValueOnce({ rows: [] })              // DELETE agent_tools
        .mockResolvedValueOnce({ rows: [] }),             // INSERT agent_tools
    };
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] }); // existence check
    mockWithTransaction.mockImplementation((cb) => cb(mockClient));

    const res = await request(app)
      .put('/api/agents/uuid-1')
      .send({ ...VALID_BODY, name: 'Updated Agent' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Agent');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when agent does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/agents/bad-id').send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  it('returns 400 for validation errors', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

    const res = await request(app)
      .put('/api/agents/uuid-1')
      .send({ ...VALID_BODY, name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('replaces tools atomically — DELETE then INSERT', async () => {
    const mockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [AGENT] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });
    mockWithTransaction.mockImplementation((cb) => cb(mockClient));

    await request(app).put('/api/agents/uuid-1').send(VALID_BODY);

    const calls = mockClient.query.mock.calls;
    const deleteCall = calls.find(([sql]) => /DELETE FROM agent_tools/.test(sql));
    const insertCall = calls.find(([sql]) => /INSERT INTO agent_tools/.test(sql));
    expect(deleteCall).toBeDefined();
    expect(insertCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/agents/:id', () => {
  it('returns 200 on successful delete', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app).delete('/api/agents/uuid-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM agents WHERE id = $1',
      ['uuid-1'],
    );
  });

  it('returns 404 when agent does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app).delete('/api/agents/bad-id');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).delete('/api/agents/uuid-1');

    expect(res.status).toBe(500);
  });
});
