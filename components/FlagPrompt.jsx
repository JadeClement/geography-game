import { getFlagUrl } from "@/lib/flags";
import { cn } from "@/lib/cn";
import { flagPrompt } from "@/lib/ui";

const FLAG_WIDTHS = {
  prompt: 160,
  card: 640,
};

export default function FlagPrompt({ iso2, className = "", size = "prompt" }) {
  const src = getFlagUrl(iso2, FLAG_WIDTHS[size] ?? FLAG_WIDTHS.prompt);
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      className={cn(flagPrompt({ card: size === "card" }), className)}
      draggable={false}
    />
  );
}
