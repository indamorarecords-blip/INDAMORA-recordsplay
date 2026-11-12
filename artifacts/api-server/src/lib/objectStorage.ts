import { randomUUID } from "node:crypto";
--- a/artifacts/api-server/src/lib/objectStorage.ts
+++ b/artifacts/api-server/src/lib/objectStorage.ts
@@ -286,6 +286,25 @@
     return normalized;
   }
 
+  async searchPublicObject(path: string): Promise<SupabaseFile | null> {
+    try {
+      const normalized = path.replace(/^\\/+/, "");
+      const file = await this.getObjectEntityFile(`/objects/${normalized}`);
+      const policy = await getObjectAclPolicy(file);
+
+      if (policy?.visibility !== "public") {
+        return null;
+      }
+
+      return file;
+    } catch (error) {
+      if (error instanceof ObjectNotFoundError) {
+        return null;
+      }
+      throw error;
+    }
+  }
+
   async canAccessObjectEntity(args: {
     userId?: string;
     objectFile: SupabaseFile;
