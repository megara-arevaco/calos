import { useNutritionPhotoInput } from "./NutritionPhotoInput.hook.js";
import type { NutritionImage, PlateDraft } from "@calos/core";

export interface PhotoAttachment {
  image: NutritionImage;
  name: string;
  draft?: PlateDraft;
}

export function NutritionPhotoInput({
  photo,
  onChange,
  disabled,
}: {
  photo: PhotoAttachment | null;
  onChange: (photo: PhotoAttachment | null) => void;
  disabled: boolean;
}) {
  const { input, plateInput, error, setError, reading, attach } =
    useNutritionPhotoInput(onChange);
  return (
    <div className="nutrition-photo">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Foto de etiqueta nutricional"
        hidden
        disabled={disabled || reading}
        onChange={(event) => {
          void attach(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={plateInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Foto de plato"
        hidden
        disabled={disabled || reading}
        onChange={(event) => {
          void attach(event.target.files?.[0], "plate");
          event.target.value = "";
        }}
      />
      {photo ? (
        <div className="photo-preview">
          <img
            src={`data:${photo.image.mimeType};base64,${photo.image.base64}`}
            alt={
              photo.image.kind === "plate"
                ? "Plato adjunto"
                : "Etiqueta nutricional adjunta"
            }
          />
          <div>
            <strong>{photo.name}</strong>
            <span>
              {photo.image.kind === "plate"
                ? "Revisaremos ingredientes y cantidades juntos."
                : "La etiqueta tiene prioridad sobre USDA."}
            </span>
          </div>
          <button
            className="photo-remove"
            type="button"
            disabled={disabled || reading}
            aria-label="Quitar foto"
            onClick={() => {
              onChange(null);
              setError("");
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="photo-actions">
          <button
            className="quiet-button photo-attach"
            type="button"
            disabled={disabled || reading}
            onClick={() => plateInput.current?.click()}
          >
            {reading ? "Leyendo foto…" : "Foto de plato"}
          </button>
          <button
            className="quiet-button photo-attach"
            type="button"
            disabled={disabled || reading}
            onClick={() => input.current?.click()}
          >
            {reading ? "Leyendo foto…" : "Adjuntar etiqueta"}
          </button>
        </div>
      )}
      {photo && (
        <p className="photo-hint">
          {photo.image.kind === "plate"
            ? "La foto se enviará a OpenRouter. El asistente preguntará por lo que no esté claro."
            : "Se enviará a OpenRouter. Indica cuánto has consumido."}
        </p>
      )}
      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
