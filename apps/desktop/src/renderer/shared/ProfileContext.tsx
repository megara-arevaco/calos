import { createContext, useContext } from "react";
import type { LocalProfile } from "@calos/core";
export const ProfileContext = createContext<LocalProfile | null>(null);

export function useProfile() {
  const profile = useContext(ProfileContext);

  if (!profile) {
    throw new Error("No hay un perfil seleccionado");
  }
  return profile;
}
