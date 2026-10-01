import Image from "next/image";

export function AppLogo({ className = "h-14 w-14" }: { className?: string }) {
  return <Image src="/flowdeck-mark.svg" width={512} height={512} className={className} alt="FlowDeck logo" />;
}
