import Image from "next/image";

export function HeroVisual({ title }: { title: string }) {
  return (
    <div className="relative w-full max-w-[900px] overflow-hidden rounded-[28px] border border-white/58 bg-white/18 p-2 shadow-[0_26px_80px_rgba(23,63,60,0.22)]">
      <Image
        src="/images/hero/tesla.png"
        alt={title}
        width={1536}
        height={1024}
        priority
        className="h-auto w-full rounded-[22px] object-cover"
        sizes="(min-width: 1024px) 56vw, 100vw"
      />
    </div>
  );
}
