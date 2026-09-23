/*
  Warnings:

  - You are about to drop the column `can_add` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `can_delete` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `can_edit` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `can_read` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `is_exceptional` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `is_restricted` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the `_PermissionToRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_A_fkey";

-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_B_fkey";

-- AlterTable
ALTER TABLE "permissions" DROP COLUMN "can_add",
DROP COLUMN "can_delete",
DROP COLUMN "can_edit",
DROP COLUMN "can_read",
DROP COLUMN "is_exceptional",
DROP COLUMN "is_restricted";

-- DropTable
DROP TABLE "_PermissionToRole";

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "can_read" BOOLEAN,
    "can_add" BOOLEAN,
    "can_edit" BOOLEAN,
    "can_delete" BOOLEAN,
    "is_restricted" BOOLEAN,
    "is_exceptional" BOOLEAN,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE CASCADE;
