import { normalizeFoodName } from "../custom-food.js";

/** A read-only model response cannot serve as a persistence receipt. */
export function claimsMutation(message: string): boolean {
  const mutation =
    "(?:ajustad[oa]s?|establecid[oa]s?|fijad[oa]s?|configurad[oa]s?|actualizad[oa]s?|corregid[oa]s?|modificad[oa]s?|cambiad[oa]s?|guardad[oa]s?|registrad[oa]s?|eliminad[oa]s?|borrad[oa]s?|anadid[oa]s?|aplicad[oa]s?)";
  return new RegExp(
    `(?<!no )\\b(?:he|hemos|acabo de|se ha|se han|ha sido|han sido|esta|estan|queda|quedan)\\s+(?:ya\\s+)?${mutation}\\b|^${mutation}\\b`,
  ).test(normalizeFoodName(message));
}
