import { Router, type IRouter } from "express";
import adminUsersRouter from "./admin-users";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(adminUsersRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);

export default router;
