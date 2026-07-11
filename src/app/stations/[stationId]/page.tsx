import { ComingSoon } from "@/components/placeholders/ComingSoon";

interface StationPageProps {
  params: Promise<{
    stationId: string;
  }>;
}

export default async function StationPage({ params }: StationPageProps) {
  const { stationId } = await params;

  return <ComingSoon title={`Station ${stationId}`} />;
}
