import { cn } from "@/lib/cn";

const VARIANTS = {
  error: {
    icon: "\u2715",
    color: "var(--color-error)",
    role: "alert",
  },
  success: {
    icon: "\u2713",
    color: "var(--color-success)",
    role: "status",
  },
  info: {
    icon: "\u2139",
    color: "var(--color-link)",
    role: "status",
  },
};

export default function ValidationMessage({ type = "error", message }) {
  if (!message) return null;

  const variant = VARIANTS[type] ?? VARIANTS.error;

  return (
    <p
      role={variant.role}
      className="flex items-start gap-1.5 text-sm leading-snug"
      style={{ color: variant.color }}
    >
      <span
        aria-hidden="true"
        className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold leading-none text-white"
        style={{ backgroundColor: variant.color }}
      >
        {variant.icon}
      </span>
      <span>{message}</span>
    </p>
  );
}
