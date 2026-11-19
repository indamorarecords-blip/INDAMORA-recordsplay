import { Router, type IRouter } from "express";
import pressRouter from "./press";
const pressMount: IRouter = Router();
// Routes publiques et administrateur INDAMORA PRESSE
pressMount.use("/", pressRouter);
export default pressMount;
