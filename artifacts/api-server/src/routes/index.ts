import { Router, type IRouter } from "express";
import healthRouter from "./health";
import indamoraRouter from "./indamora";

const router: IRouter = Router();

router.use(healthRouter);
router.use(indamoraRouter);

export default router;
