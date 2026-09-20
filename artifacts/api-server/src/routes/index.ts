import { Router, type IRouter } from "express";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import billingRouter from "./billing";
import analyticsRouter from "./analytics";
import adminRouter from "./admin";

const router: IRouter = Router();

router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);
router.use(billingRouter);
router.use(analyticsRouter);
router.use(adminRouter);

export default router;
