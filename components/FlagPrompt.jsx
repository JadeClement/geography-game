import { getFlagUrl } from "@/lib/flags";

const FLAG_WIDTHS = {
  prompt: 160,
  card: 640,
};

export default function FlagPrompt({ iso2, className = "", size = "prompt" }) {
  const src = getFlagUrl(iso2, FLAG_WIDTHS[size] ?? FLAG_WIDTHS.prompt);
  if (!src) return null;

  const sizeClass = size === "card" ? "flag-prompt flag-prompt--card" : "flag-prompt";

  return (
    <img
      src={src}
      alt=""
      className={className ? `${sizeClass} ${className}` : sizeClass}
      draggable={false}
    />
  );
}
