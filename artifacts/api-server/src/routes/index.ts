import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clientsRouter from "./clients";
import tasksRouter from "./tasks";
import timeRouter from "./time";
import leadsRouter from "./leads";
import invoicesRouter from "./invoices";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clientsRouter);
router.use(tasksRouter);
router.use(timeRouter);
router.use(leadsRouter);
router.use(invoicesRouter);
router.use(usersRouter);

export default router;
