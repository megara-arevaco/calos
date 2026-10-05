import type { CalosApi } from "../preload/index.js";
declare global {
  interface Window {
    calos: CalosApi;
  }
}
export {};
