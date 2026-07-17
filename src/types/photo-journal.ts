export interface PublicPhotoJournalItem {
  id: string;
  visitId: string;
  url: string;
  alt: string;
  caption: string | null;
  takenAt: string | null;
  checkedInAt: string;
  stationName: string;
  city: string;
  state: string;
  width: number;
  height: number;
  isCover: boolean;
}
