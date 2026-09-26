import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import projectsRouter from "./projects";
import threadsRouter from "./threads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(projectsRouter);
router.use(threadsRouter);

export default router;
