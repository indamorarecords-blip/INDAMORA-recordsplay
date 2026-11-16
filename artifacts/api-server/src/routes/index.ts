import { Router, type IRouter } from "express";

import adminUsersRouter from "./admin-users";
import healthRouter from "./health";
import indamoraRouter from "./indamora";
import storageRouter from "./storage";
import storageV2Router from "./storage-v2";
import submissionsV2Router from "./submissions-v2";
import submissionMediaRouter from './submission-media';
import submissionUploadRouter from './submission-upload';

const router: IRouter = Router();

// Routes existantes : conservées
router.use(adminUsersRouter);
router.use(healthRouter);
router.use(indamoraRouter);
router.use('/submissions', submissionUploadRouter);
router.use('/submissions', submissionMediaRouter);

// Ancien système de stockage : conservé
router.use(storageRouter);

// Nouveau système de téléversement
router.use("/storage", storageV2Router);

// Nouveau système de téléversement sécurisé
router.use("/storage", storageRouter);

// Gestion des soumissions
router.use(submissionsV2Router);

export default router;
