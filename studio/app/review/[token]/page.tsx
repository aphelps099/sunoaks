import ReviewPage from "@/components/ReviewPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReviewPage token={token} />;
}
