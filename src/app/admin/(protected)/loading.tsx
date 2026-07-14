export default function AdminLoading() {
  return (
    <div className="animate-pulse" aria-label="Loading admin page">
      <div className="h-12 w-64 rounded-2xl bg-[#dfe9e4]" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 rounded-[24px] bg-[#dfe9e4]" />
        ))}
      </div>
      <div className="mt-8 h-80 rounded-[28px] bg-[#dfe9e4]" />
    </div>
  );
}
