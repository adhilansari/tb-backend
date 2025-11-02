-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssetType" ADD VALUE 'VECTOR';
ALTER TYPE "AssetType" ADD VALUE 'ICON';
ALTER TYPE "AssetType" ADD VALUE 'THREE_D_MODEL';
ALTER TYPE "AssetType" ADD VALUE 'PRESET';
ALTER TYPE "AssetType" ADD VALUE 'TEXTURE';
ALTER TYPE "AssetType" ADD VALUE 'BRUSH';
ALTER TYPE "AssetType" ADD VALUE 'OTHER';
