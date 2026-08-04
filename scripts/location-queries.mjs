const GENERIC_LOCATION_WORDS = new Set([
  'avenue', 'drive', 'east', 'jalan', 'lane', 'lorong', 'north', 'place', 'road',
  'singapore', 'south', 'street', 'west',
]);
const STREET_NAME = /\b(?:avenue|drive|jalan|lane|lorong|place|road|street)\b/i;
const STREET_ADDRESS = /^.+?\b(?:avenue|drive|jalan|lane|lorong|parkway|place|road|street)\b/i;
const PRECISE_VENUE_FALLBACKS = new Set(['punggol settlement']);

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function locationWords(value) {
  return (normalize(value).match(/[a-z]{3,}/g) ?? []).filter((word) => !GENERIC_LOCATION_WORDS.has(word));
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => typeof value === 'string').map((value) => value.trim()).filter((value) => {
    const key = normalize(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberedStreetQueries(address, locationName) {
  const addressNumbers = address.match(/^\s*([0-9]+[A-Z]?(?:\s*(?:\/|&|-)\s*[0-9]+[A-Z]?)+)/i)?.[1]
    ?.match(/[0-9]+[A-Z]?/gi) ?? [];
  const singleAddressNumber = address.match(/^\s*([0-9]+)(?:[A-Z])?\b/i)?.[1];
  const numbers = addressNumbers.length > 0 ? addressNumbers : singleAddressNumber ? [singleAddressNumber] : [];

  return numbers.map((number) => `${number} ${locationName}`);
}

export function validationQueries({ locationType, locationName, address, name }) {
  const withoutPostal = address.replace(/\s+SINGAPORE\s+\d{6}\s*$/i, '').trim();
  const withoutUnit = withoutPostal.replace(/\s+#.*$/i, '').trim();
  if (locationType !== 'Street') return unique([withoutUnit, locationName]);

  const streetAddress = withoutUnit.match(STREET_ADDRESS)?.[0];
  const normalizedAddress = normalize(withoutUnit);
  const missingLocation = locationWords(locationName).some((word) => !normalizedAddress.includes(word));
  const primary = missingLocation ? `${withoutUnit} ${locationName}` : withoutUnit;
  const merchantQueries = name ? [`${name} ${locationName}`, name] : [];
  const venueFallback = !STREET_NAME.test(locationName) && PRECISE_VENUE_FALLBACKS.has(normalize(locationName))
    ? [locationName]
    : [];

  return unique([
    primary,
    streetAddress,
    ...numberedStreetQueries(streetAddress ?? withoutUnit, locationName),
    ...merchantQueries,
    ...venueFallback,
  ]);
}

export function validationQuery(merchant) {
  return validationQueries(merchant)[0];
}

export function matchesLocation(match, locationName) {
  const matchedAddress = normalize((match.matchedAddress ?? '').replace(/[^a-z0-9]+/gi, ' '));
  const alternatives = locationName
    .split(/\s+-\s+/)
    .map((value) => normalize(value.replace(/[^a-z0-9]+/gi, ' ')))
    .filter(Boolean);

  return alternatives.length === 0 || alternatives.some((value) => matchedAddress.includes(value));
}
