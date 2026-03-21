import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import tasksRouter from "./tasks";
import timeRouter from "./time";
import leadsRouter from "./leads";
import invoicesRouter from "./invoices";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(tasksRouter);
router.use(timeRouter);
router.use(leadsRouter);
router.use(invoicesRouter);

export default router;
