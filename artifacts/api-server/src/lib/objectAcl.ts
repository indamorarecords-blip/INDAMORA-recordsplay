import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Configuration Supabase manquante.");
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const ACL_TABLE = "indamora_storage_acl";

export type ObjectAclPolicy = {
  owner: string;
  visibility: "public" | "private";
};

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export async function setObjectAclPolicy(
  objectPath: string,
  policy: ObjectAclPolicy
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(ACL_TABLE)
    .upsert(
      {
        object_path: objectPath,
        owner_clerk_id: policy.owner,
        visibility: policy.visibility,
      },
      { onConflict: "object_path" }
    );

  if (error) throw error;
}

export async function getObjectAclPolicy(
  objectPath: string
): Promise<ObjectAclPolicy | null> {
  const { data, error } = await supabaseAdmin
    .from(ACL_TABLE)
    .select("owner_clerk_id, visibility")
    .eq("object_path", objectPath)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    owner: data.owner_clerk_id,
    visibility: data.visibility as "public" | "private",
  };
}

export async function canAccessObject({
  userId,
  objectPath,
  requestedPermission,
}: {
  userId?: string;
  objectPath: string;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const policy = await getObjectAclPolicy(objectPath);

  if (!policy) return false;

  if (
    policy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  return Boolean(userId && policy.owner === userId);
}
