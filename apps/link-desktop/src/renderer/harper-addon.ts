import { linkApi, type HarperAddonSettings, type HarperFinding, type HarperPolishResult, type HarperReviewResult } from "./api.js";

export type { HarperFinding, HarperPolishResult, HarperReviewResult } from "./api.js";

export function harperNoticeUrl() {
  return new URL("oss/THIRD_PARTY_NOTICES.txt", window.location.href).toString();
}

export function harperLicenseUrl() {
  return new URL("oss/harper-apache-2.0.txt", window.location.href).toString();
}

export function harperEnabledForSurface(settings: HarperAddonSettings | null | undefined, surface: keyof HarperAddonSettings["surfaces"]) {
  return Boolean(settings?.installed && settings.enabled && settings.surfaces?.[surface]);
}

export function applyHarperFinding(text: string, finding: HarperFinding) {
  if (finding.suggestionKind === "insert_after") {
    return `${text.slice(0, finding.end)}${finding.replacementText}${text.slice(finding.end)}`;
  }
  if (finding.suggestionKind === "replace" || finding.suggestionKind === "remove") {
    return `${text.slice(0, finding.start)}${finding.replacementText}${text.slice(finding.end)}`;
  }
  return text;
}

export async function getHarperAddonStatus(input?: { forceRefresh?: boolean; allowAutoUpdate?: boolean }) {
  return linkApi.getHarperAddonStatus(input);
}

export async function installHarperAddon(input?: { version?: string; enable?: boolean }) {
  return linkApi.installHarperAddon(input);
}

export async function removeHarperAddon() {
  return linkApi.removeHarperAddon();
}

export async function reviewTextWithHarper(input: {
  text: string;
  settings?: Partial<HarperAddonSettings>;
  customVocabulary?: string[];
}): Promise<HarperReviewResult> {
  return linkApi.reviewHarperText(input);
}

export async function polishTextWithHarper(input: {
  text: string;
  settings?: Partial<HarperAddonSettings>;
  customVocabulary?: string[];
}): Promise<HarperPolishResult> {
  return linkApi.polishHarperText(input);
}
