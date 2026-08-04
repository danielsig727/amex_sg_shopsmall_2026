export function googleMapsSearchUrl(merchant) {
  const query = `${merchant.name}, ${merchant.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function revealClusteredMarker(markerLayer, marker, onVisible = () => marker.openPopup()) {
  markerLayer.zoomToShowLayer(marker, onVisible);
}
