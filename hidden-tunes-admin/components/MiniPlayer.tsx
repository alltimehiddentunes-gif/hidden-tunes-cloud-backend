import { Image } from "expo-image";

const loadedImages = new Set<string>();

export async function preloadImages(
  images: Array<string |undefined | null>
) {
  try {
    const validImages = images
      .filter(Boolean)
      .map((img) => String(img))
      .filter((img) => img.startsWith("http"))
      .filter((img) => !loadedImages.has(img));

    if (!validImages.length) return;

    await Promise.all(
      validImages.map(async (img) => {
        try {
          await Image.prefetch(img);
          loadedImages.add(img);
        } catch {}
      })
    );
  } catch {}
}

export function clearImagePreloadCache() {
  loadedImages.clear();
}