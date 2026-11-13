import { Router, type IRouter } from "express";

import adminUsersRouter from "./admin-users";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import storageV2Router from "./storage-v2";

const router: IRouter = Router();

// Routes existantes : conservées
router.use(adminUsersRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use(storageRouter);

// Nouvelle route indépendante de téléversement
router.use("/storage", storageV2Router);

export default router;
