import { useNutritionPhotoInput } from "./NutritionPhotoInput.hook.js";
import type { NutritionImage, PlateDraft } from "@calos/core";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { input, plateInput, error, setError, reading, attach } =
    useNutritionPhotoInput(onChange);
  return (
    <div className="nutrition-photo">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t("photo.labelPhoto")}
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
        aria-label={t("photo.platePhoto")}
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
                ? t("photo.attachedPlate")
                : t("photo.attachedLabel")
            }
          />
          <div>
            <strong>{photo.name}</strong>
            <span>
              {photo.image.kind === "plate"
                ? t("photo.plateHelp")
                : t("photo.labelHelp")}
            </span>
          </div>
          <button
            className="photo-remove"
            type="button"
            disabled={disabled || reading}
            aria-label={t("photo.remove")}
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
            {reading ? t("photo.reading") : t("photo.platePhoto")}
          </button>
          <button
            className="quiet-button photo-attach"
            type="button"
            disabled={disabled || reading}
            onClick={() => input.current?.click()}
          >
            {reading ? t("photo.reading") : t("photo.attachLabel")}
          </button>
        </div>
      )}
      {photo && (
        <p className="photo-hint">
          {photo.image.kind === "plate"
            ? t("photo.plateNotice")
            : t("photo.labelNotice")}
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
