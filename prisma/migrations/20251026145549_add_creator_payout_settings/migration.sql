-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bankAccountHolderName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankIfscCode" TEXT,
ADD COLUMN     "creatorTermsAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creatorTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "payoutMinThreshold" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "razorpayFundAccountId" TEXT,
ADD COLUMN     "upiId" TEXT;
