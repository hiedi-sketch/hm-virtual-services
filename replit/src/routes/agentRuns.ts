import { Router } from 'express';
import { requireAdmin } from '../middlewares/auth';
import { runAgent } from '../agents/runEngine';

const router = Router();

// POST /api/agents/run/:id
router.post('/agents/run/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { triggerType = 'manual', input = {} } = req.body as {
    triggerType?: string;
    input?: Record<string, unknown>;
  };

  const result = await runAgent(id, triggerType, input);
  res.status(result.success ? 200 : 500).json(result);
});

export default router;
