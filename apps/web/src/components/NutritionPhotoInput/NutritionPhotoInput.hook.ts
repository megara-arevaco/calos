import { useRef, useState } from "react";
import type { NutritionImage } from "@calos/core";
import type { PhotoAttachment } from "./NutritionPhotoInput.js";
export function useNutritionPhotoInput(
  onChange: (photo: PhotoAttachment | null) => void,
) {
  const input = useRef<HTMLInputElement>(null);
  const plateInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const attach = async (file?: File, kind: "label" | "plate" = "label") => {
    if (!file) {
      return;
    }
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 6 * 1024 * 1024
    ) {
      setError("Elige una foto JPG, PNG o WebP de hasta 6 MB.");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      onChange({
        name: file.name,
        image: {
          kind,
          mimeType: file.type as NutritionImage["mimeType"],
          base64: dataUrl.split(",")[1],
        },
      });
    } catch {
      setError("No se ha podido abrir la foto. Prueba de nuevo.");
    } finally {
      setReading(false);
    }
  };
  return { input, plateInput, error, setError, reading, attach };
}
