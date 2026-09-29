import { clerkClient } from "@clerk/express";
import { Router, type IRouter } from "express";
import { GetAdminUsersQueryParams, GetAdminUsersResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();
const pageSize = 50;

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");

  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Pagination invalide." });
    return;
  }

  const offset = query.data.offset ?? 0;
  const page = await clerkClient.users.getUserList({ limit: pageSize, offset });
  const users = page.data.map((user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
    createdAt: new Date(user.createdAt).toISOString(),
  }));

  res.json(GetAdminUsersResponse.parse({
    users,
    totalCount: page.totalCount,
    offset,
    limit: pageSize,
  }));
});

export default router;