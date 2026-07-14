import { NextResponse } from "next/server";
import { getPublicVisitPhotoUrl } from "@/lib/photos/signing";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  try {
    const signedUrl = await getPublicVisitPhotoUrl(photoId);
    if (!signedUrl) return new NextResponse(null, { status: 404 });
    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
