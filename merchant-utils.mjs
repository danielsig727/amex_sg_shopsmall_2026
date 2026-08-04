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
