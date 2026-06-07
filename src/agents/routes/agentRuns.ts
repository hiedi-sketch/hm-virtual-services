import { Router } from 'express';
import { runAgent } from '../runEngine.js';

const router = Router();

router.post('/agents/run/:id', async (req, res) => {
  const { id } = req.params;
  const { triggerType = 'manual', input = {} } = req.body as {
    triggerType?: string;
    input?: Record<string, unknown>;
  };

  const result = await runAgent(id, triggerType, input);
  res.status(result.success ? 200 : 500).json(result);
});

export default router;
