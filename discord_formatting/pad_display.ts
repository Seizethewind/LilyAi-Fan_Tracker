import { displayWidth } from "./display_width.js";

export function padRightDisplay(text: string, targetWidth: number): string {
  const diff = Math.max(0, targetWidth - displayWidth(text));
  return `${text}${" ".repeat(diff)}`;
}

export function padLeftDisplay(text: string, targetWidth: number): string {
  const diff = Math.max(0, targetWidth - displayWidth(text));
  return `${" ".repeat(diff)}${text}`;
}
