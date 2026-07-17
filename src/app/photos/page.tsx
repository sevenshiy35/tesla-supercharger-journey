import type { Metadata } from "next";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { GlobalNavigation } from "@/components/navigation/GlobalNavigation";
import { PhotoJournal } from "@/components/photos/PhotoJournal";
import { getPublicPhotoJournal } from "@/lib/photos/public-journal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Photo Journal · MyTesla2026Journey",
  description: "Public photographs from a 2026 journey across America's Supercharger network.",
};

export default async function PhotosPage() {
  let photos: Awaited<ReturnType<typeof getPublicPhotoJournal>> = [];
  try {
    photos = await getPublicPhotoJournal();
  } catch {
    photos = [];
  }
  const lastUpdated = photos[0]?.takenAt ?? photos[0]?.checkedInAt ?? "";

  return (
    <>
      <GlobalNavigation />
      <main className="min-h-dvh bg-canvas">
        <PhotoJournal photos={photos} />
      </main>
      <SiteFooter lastUpdated={lastUpdated} dataSource="supabase" />
    </>
  );
}
