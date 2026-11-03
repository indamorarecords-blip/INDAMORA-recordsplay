const ACL_TABLE = "indamora_storage_acl";

export type ObjectAclPolicy = {
  owner: string;
  visibility: "public" | "private";
};

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Configuration Supabase manquante");
  }

  return {
    url: url.replace(/\/$/, ""),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

export async function setObjectAclPolicy(
  objectPath: string,
  policy: ObjectAclPolicy
): Promise<void> {
  const { url, headers } = config();

  const response = await fetch(
    `${url}/rest/v1/${ACL_TABLE}?on_conflict=object_path`,
    {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        object_path: objectPath,
        owner_clerk_id: policy.owner,
        visibility: policy.visibility,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ACL Supabase error: ${response.status} ${await response.text()}`);
  }
}

export async function getObjectAclPolicy(
  objectPath: string
): Promise<ObjectAclPolicy | null> {
  const { url, headers } = config();

  const response = await fetch(
    `${url}/rest/v1/${ACL_TABLE}?select=owner_clerk_id,visibility&object_path=eq.${encodeURIComponent(objectPath)}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`ACL Supabase error: ${response.status}`);
  }

  const rows = await response.json() as Array<{
    owner_clerk_id: string;
    visibility: "public" | "private";
  }>;

  if (!rows.length) return null;

  return {
    owner: rows[0].owner_clerk_id,
    visibility: rows[0].visibility,
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
