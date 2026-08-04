const GENERIC_LOCATION_WORDS = new Set([
  'avenue', 'drive', 'east', 'jalan', 'lane', 'lorong', 'north', 'place', 'road',
  'singapore', 'south', 'street', 'west',
]);

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function locationWords(value) {
  return (normalize(value).match(/[a-z]{3,}/g) ?? []).filter((word) => !GENERIC_LOCATION_WORDS.has(word));
}

export function validationQuery({ locationType, locationName, address }) {
  if (locationType !== 'Street') return locationName;

  const withoutPostal = address.replace(/\s+SINGAPORE\s+\d{6}\s*$/i, '').trim();
  const withoutUnit = withoutPostal.replace(/\s+#[-A-Z0-9/]+\s*$/i, '').trim();
  const normalizedAddress = normalize(withoutUnit);
  const missingLocation = locationWords(locationName).some((word) => !normalizedAddress.includes(word));

  return missingLocation ? `${withoutUnit} ${locationName}` : withoutUnit;
}

export function matchesLocation(match, locationName) {
  const words = locationWords(locationName);
  if (words.length === 0) return true;

  const matchedText = normalize(`${match.matchedAddress ?? ''} ${match.matchedName ?? ''}`);
  return words.some((word) => matchedText.includes(word));
}
