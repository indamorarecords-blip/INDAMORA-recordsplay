import { Router, type IRouter } from "express";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import billingRouter from "./billing";
import analyticsRouter from "./analytics";
import storeRouter from "./store";

const router: IRouter = Router();

router.use(adminUsersRouter);
router.use(adminContentRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);
router.use(billingRouter);
router.use(analyticsRouter);
router.use(storeRouter);

export default router;
