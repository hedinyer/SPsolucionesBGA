import { VisitadorLoginForm } from "@/components/visitador/visitador-login-form";

export default async function VisitadorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  return <VisitadorLoginForm defaultUsername={u?.trim() ?? ""} />;
}
