import type { Metadata } from "next";
import { PublicApplicationFlow } from "@/components/hojadevida/public-application-flow";
import { parseReferralSource } from "@/lib/referrals";

export const metadata: Metadata = {
  title: "Hoja de vida",
  description: "Solicitud de crédito — documentos e hoja de vida",
};

export default async function HojaDeVidaPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return (
    <PublicApplicationFlow
      initialReferralSource={parseReferralSource(ref)}
    />
  );
}
