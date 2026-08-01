import VerifyEmailPage from "@/components/VerifyEmailPage";
import { verifyEmailWithToken } from "@/lib/verification";

export default async function VerifyEmail({ searchParams }) {
  const params = await searchParams;
  const result = await verifyEmailWithToken(params?.token);

  return <VerifyEmailPage result={result} />;
}
