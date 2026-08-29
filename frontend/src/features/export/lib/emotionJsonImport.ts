import type { SpeakerGender, SpeakerProfileOverride } from '../../types/emotion';

const VALID_GENDERS = new Set<SpeakerGender>(['male', 'female', 'unknown']);

export function parseEmotionJsonSpeakers(raw: unknown): Record<string, SpeakerProfileOverride> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid emotion JSON: missing metadata.speakers');
  }
  const data = raw as Record<string, unknown>;
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const speakers = metadata?.speakers;
  if (!speakers || typeof speakers !== 'object') {
    throw new Error('Invalid emotion JSON: missing metadata.speakers');
  }

  const overrides: Record<string, SpeakerProfileOverride> = {};
  for (const [speakerId, profile] of Object.entries(speakers as Record<string, unknown>)) {
    if (!profile || typeof profile !== 'object') continue;
    const p = profile as Record<string, unknown>;
    const entry: SpeakerProfileOverride = {};
    const gender = String(p.gender ?? '').toLowerCase().trim();
    if (VALID_GENDERS.has(gender as SpeakerGender)) {
      entry.gender = gender as SpeakerGender;
    }
    const role = p.suggested_role;
    if (typeof role === 'string' && role.trim()) {
      entry.suggested_role = role.trim();
    }
    if (entry.gender || entry.suggested_role) {
      overrides[speakerId] = entry;
    }
  }
  return overrides;
}

export async function readEmotionJsonSpeakers(file: File): Promise<Record<string, SpeakerProfileOverride>> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file');
  }
  return parseEmotionJsonSpeakers(parsed);
}
