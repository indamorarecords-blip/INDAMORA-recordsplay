import { clerkMiddleware } from '@clerk/express';

const authMiddleware = clerkMiddleware();

export default authMiddleware;
