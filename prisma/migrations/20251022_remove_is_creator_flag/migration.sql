-- Update users with isCreator=true to have role=CREATOR
UPDATE "User"
SET role = 'CREATOR'
WHERE "isCreator" = true AND role = 'USER';

-- Drop the isCreator column
ALTER TABLE "User" DROP COLUMN "isCreator";
