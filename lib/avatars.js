export const AVATAR_TYPES = ["color", "flag", "image"];

export const AVATAR_COLORS = ["emerald", "sky", "amber", "violet", "rose", "teal", "orange", "cyan"];

const AVATAR_COLOR_SET = new Set(AVATAR_COLORS);

const IMAGE_DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_BYTES = 512 * 1024;

export function hashAvatarColor(key = "") {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarFromUser(user) {
  if (!user) return null;
  return {
    type: user.avatarType ?? user.avatar_type ?? "color",
    color: user.avatarColor ?? user.avatar_color ?? null,
    flag: user.avatarFlag ?? user.avatar_flag ?? null,
    image: user.avatarImage ?? user.avatar_image ?? null,
  };
}

export function resolveAvatar(avatar, { username, name } = {}) {
  const fallbackKey = username || name || "";
  const type = avatar?.type ?? "color";

  if (type === "image" && avatar?.image) {
    return { type: "image", color: null, flag: null, image: avatar.image };
  }

  if (type === "flag" && avatar?.flag) {
    return { type: "flag", color: null, flag: avatar.flag.toUpperCase(), image: null };
  }

  return {
    type: "color",
    color: avatar?.color && AVATAR_COLOR_SET.has(avatar.color)
      ? avatar.color
      : hashAvatarColor(fallbackKey),
    flag: null,
    image: null,
  };
}

export function validateAvatarPayload(avatar) {
  if (!avatar || typeof avatar !== "object") {
    return "Avatar settings are required.";
  }

  const type = avatar.type;
  if (!AVATAR_TYPES.includes(type)) {
    return "Invalid avatar type.";
  }

  if (type === "color") {
    if (!avatar.color || !AVATAR_COLOR_SET.has(avatar.color)) {
      return "Choose a valid avatar color.";
    }
    return null;
  }

  if (type === "flag") {
    const flag = typeof avatar.flag === "string" ? avatar.flag.trim().toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(flag)) {
      return "Choose a valid country flag.";
    }
    return null;
  }

  const image = typeof avatar.image === "string" ? avatar.image.trim() : "";
  if (!IMAGE_DATA_URL_RE.test(image)) {
    return "Upload a JPEG, PNG, or WebP image.";
  }

  const base64 = image.split(",")[1] ?? "";
  const byteLength = Math.ceil((base64.length * 3) / 4);
  if (byteLength > MAX_IMAGE_BYTES) {
    return "Image must be 512 KB or smaller.";
  }

  return null;
}

export function normalizeAvatarPayload(avatar) {
  const type = avatar.type;

  if (type === "color") {
    return {
      type: "color",
      color: avatar.color,
      flag: null,
      image: null,
    };
  }

  if (type === "flag") {
    return {
      type: "flag",
      color: null,
      flag: avatar.flag.trim().toUpperCase(),
      image: null,
    };
  }

  return {
    type: "image",
    color: null,
    flag: null,
    image: avatar.image.trim(),
  };
}

export async function resizeImageFile(file, { maxSize = 256, quality = 0.85 } = {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not process image."))),
      "image/jpeg",
      quality
    );
  });

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 512 KB or smaller.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}
