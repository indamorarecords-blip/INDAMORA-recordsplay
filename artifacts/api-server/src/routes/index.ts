import { Router, type IRouter } from "express";
import adminUsersRouter from "./admin-users";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(adminUsersRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);
router.use(billingRouter);

export default router;
