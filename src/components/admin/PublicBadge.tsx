export function PublicBadge({ isPublic }: { isPublic: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isPublic ? "bg-[#dff4eb] text-[#245e52]" : "bg-[#eee9f3] text-[#5e4f70]"
      }`}
    >
      {isPublic ? "Public" : "Private"}
    </span>
  );
}
