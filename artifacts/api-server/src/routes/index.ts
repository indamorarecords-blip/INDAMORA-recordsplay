import { Router, type IRouter } from "express";
import adminUsersRouter from "./admin-users";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import pressRouter from "./press";

const router: IRouter = Router();

router.use(adminUsersRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);
router.use(pressRouter);

export default router;
