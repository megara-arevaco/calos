import type { CalosApi } from "@calos/core";
declare global {
  interface Window {
    calos: CalosApi;
  }
}
export {};
