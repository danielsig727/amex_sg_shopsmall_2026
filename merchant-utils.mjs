export function googleMapsSearchUrl(merchant) {
  const query = `${merchant.name}, ${merchant.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function revealClusteredMarker(markerLayer, marker, onVisible = () => marker.openPopup()) {
  markerLayer.zoomToShowLayer(marker, onVisible);
}

export function requestMerchantSelection(selection, merchantId, popupIsOpen) {
  if (selection.selectedMerchant === merchantId && popupIsOpen) return false;

  selection.selectedMerchant = merchantId;
  selection.pendingRevealMerchant = merchantId;
  return true;
}

export function clearMerchantSelection(selection, merchantId) {
  if (selection.selectedMerchant !== merchantId || selection.pendingRevealMerchant === merchantId) return false;

  selection.selectedMerchant = null;
  return true;
}

const merchantCollator = new Intl.Collator('en-SG', {
  sensitivity: 'base',
  numeric: true,
});
const EARTH_RADIUS_METRES = 6_371_000;

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-SG');
}

function radians(degrees) {
  return degrees * Math.PI / 180;
}

export function merchantMatchesQuery(merchant, query) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableText = normalizeSearchText([
    merchant.name,
    merchant.locationName,
    merchant.address,
  ].join(' '));
  return terms.every((term) => searchableText.includes(term));
}

export function compareMerchantsAlphabetically(left, right) {
  return merchantCollator.compare(left.name, right.name)
    || merchantCollator.compare(left.locationName, right.locationName)
    || merchantCollator.compare(left.address, right.address)
    || merchantCollator.compare(left.id, right.id);
}

export function distanceMeters(origin, destination) {
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(haversine));
}

export function formatDistance(metres) {
  if (metres < 1_000) return `${Math.round(metres)} m`;
  return `${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 1 }).format(metres / 1_000)} km`;
}

export function orderMerchants(merchants, { mode = 'alphabetical', origin } = {}) {
  if (mode === 'distance' && origin) {
    return merchants.toSorted((left, right) => (
      distanceMeters(origin, left) - distanceMeters(origin, right)
      || compareMerchantsAlphabetically(left, right)
    ));
  }
  return merchants.toSorted(compareMerchantsAlphabetically);
}
