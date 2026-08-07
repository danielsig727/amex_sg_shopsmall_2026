import {
  activeResultIndex,
  activatePlaceSearch,
  clearMerchantSelection,
  clearPlaceSearch,
  combinedSearchResults,
  distanceMeters,
  filterDirectoryMerchants,
  formatDistance,
  googleMapsSearchUrl,
  merchantPlaceFor,
  merchantPlaceGroups,
  merchantPopupHtml,
  orderMerchants,
  placeSearchResults,
  requestMerchantSelection,
  revealClusteredMarker,
} from './merchant-utils.mjs?v=7';

const DEFAULT_VIEW = [1.3521, 103.8198];
const DEFAULT_ZOOM = 11;
const map = L.map('map', { zoomControl: false }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const elements = {
  count: document.querySelector('#merchant-count'),
  status: document.querySelector('#status'),
  directoryPanel: document.querySelector('#directory-panel'),
  directoryScopeLabel: document.querySelector('#directory-scope-label'),
  filters: document.querySelector('#category-filters'),
  list: document.querySelector('#merchant-list'),
  template: document.querySelector('#merchant-template'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  searchResults: document.querySelector('#search-results'),
  activePlaceChip: document.querySelector('#active-place-chip'),
  activePlaceLabel: document.querySelector('#active-place-label'),
  clearPlaceButton: document.querySelector('#clear-place-button'),
  distanceOriginReticle: document.querySelector('#distance-origin-reticle'),
  sortButtons: [...document.querySelectorAll('[data-sort-mode]')],
  locateButton: document.querySelector('#locate-button'),
};
map.getPanes().mapPane.append(elements.distanceOriginReticle);

const state = {
  merchants: [],
  merchantPlaces: [],
  activePlace: null,
  activeCategory: 'All',
  directoryQuery: '',
  placeResults: [],
  placeSearchError: '',
  placeSearchPending: false,
  activeSearchResult: -1,
  searchRequestId: 0,
  searchResultsDismissed: false,
  sortMode: 'alphabetical',
  selectedMerchant: null,
  pendingRevealMerchant: null,
  markerLayer: L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42, disableClusteringAtZoom: 19 }),
  markersByMerchantId: new Map(),
};
map.addLayer(state.markerLayer);

const boundPopupPlaceButtons = new WeakSet();

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

function directoryMerchants() {
  const bounds = map.getBounds();
  const matchingMerchants = filterDirectoryMerchants(state.merchants, {
    activeCategory: state.activeCategory,
    query: state.directoryQuery,
    activeLocationCell: state.activePlace?.locationCell ?? null,
    contains: (merchant) => bounds.contains([merchant.latitude, merchant.longitude]),
  });
  return orderMerchants(matchingMerchants, {
    mode: state.sortMode,
    origin: mapCenterOrigin(),
  });
}

function renderActivePlace() {
  const active = state.activePlace;
  elements.activePlaceChip.hidden = !active;
  elements.activePlaceLabel.textContent = active?.locationName ?? '';
  elements.clearPlaceButton.setAttribute(
    'aria-label',
    active ? `Remove ${active.locationName} place filter` : 'Remove place filter',
  );
}

function mapCenterOrigin() {
  const center = map.getCenter();
  return { latitude: center.lat, longitude: center.lng };
}

function updateDistanceOriginReticle() {
  elements.distanceOriginReticle.hidden = state.sortMode !== 'distance';
  if (!elements.distanceOriginReticle.hidden) syncDistanceOriginReticle();
}

function syncDistanceOriginReticle() {
  const mapRect = map.getContainer().getBoundingClientRect();
  const mapPaneRect = map.getPanes().mapPane.getBoundingClientRect();
  elements.distanceOriginReticle.style.left = `${(mapRect.width / 2) - (mapPaneRect.left - mapRect.left)}px`;
  elements.distanceOriginReticle.style.top = `${(mapRect.height / 2) - (mapPaneRect.top - mapRect.top)}px`;
}

function selectMerchant(id, shouldPan = false) {
  const currentMarker = state.markersByMerchantId.get(id);
  if (!requestMerchantSelection(state, id, currentMarker?.isPopupOpen() ?? false)) return;

  if (shouldPan) {
    const merchant = state.merchants.find((item) => item.id === id);
    if (merchant) map.setView([merchant.latitude, merchant.longitude], Math.max(map.getZoom(), 16));
  }
  renderDirectory();
}

function renderMarkers(merchants) {
  state.markerLayer.clearLayers();
  state.markersByMerchantId.clear();
  merchants.forEach((merchant) => {
    const place = merchantPlaceFor(state.merchantPlaces, merchant);
    const icon = L.divIcon({ className: 'location-pin', html: '<span>•</span>', iconSize: [34, 34] });
    const marker = L.marker([merchant.latitude, merchant.longitude], { icon, title: `${merchant.name} at ${merchant.locationName}` });
    marker.bindPopup(merchantPopupHtml(merchant, place));
    marker.on('click', () => selectMerchant(merchant.id));
    marker.on('popupopen', ({ popup }) => {
      const button = popup.getElement()?.querySelector('.merchant-popup-place');
      if (!button || !place || boundPopupPlaceButtons.has(button)) return;

      boundPopupPlaceButtons.add(button);
      button.addEventListener('click', () => activateMerchantPlace(place));
    });
    marker.on('popupclose', () => {
      if (clearMerchantSelection(state, merchant.id)) renderDirectory();
    });
    state.markersByMerchantId.set(merchant.id, marker);
    state.markerLayer.addLayer(marker);
  });
  const merchantToReveal = state.pendingRevealMerchant;
  const selectedMarker = merchantToReveal === state.selectedMerchant
    ? state.markersByMerchantId.get(merchantToReveal)
    : null;
  if (selectedMarker) {
    revealClusteredMarker(state.markerLayer, selectedMarker, () => {
      if (
        state.pendingRevealMerchant === merchantToReveal
        && state.markersByMerchantId.get(merchantToReveal) === selectedMarker
      ) {
        state.pendingRevealMerchant = null;
        selectedMarker.openPopup();
        renderDirectory({ updateMarkers: false });
      }
    });
  } else if (merchantToReveal) {
    state.pendingRevealMerchant = null;
  }
}

function renderMerchantList(merchants) {
  elements.list.replaceChildren();
  if (!merchants.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    if (state.activePlace) {
      empty.textContent = `No merchants match the current search or category at ${state.activePlace.locationName}. Clear the text, category, or place filter.`;
    } else if (state.directoryQuery.trim()) {
      empty.textContent = `No merchants match “${state.directoryQuery.trim()}” in this map view. Try another search or clear it.`;
    } else {
      empty.textContent = 'No matching merchants are in this map view. Try zooming out or clearing a filter.';
    }
    elements.list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  merchants.forEach((merchant) => {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    card.querySelector('.merchant-category').textContent = merchant.category;
    card.querySelector('.merchant-name').textContent = merchant.name;
    card.querySelector('.merchant-address').textContent = merchant.address;
    const distance = card.querySelector('.merchant-distance');
    if (state.sortMode === 'distance') {
      distance.hidden = false;
      distance.textContent = formatDistance(distanceMeters(mapCenterOrigin(), merchant));
    }
    card.classList.toggle('is-selected', state.selectedMerchant === merchant.id);
    const selectButton = card.querySelector('.merchant-select');
    const selectLabel = card.querySelector('.merchant-select-label');
    const locationButton = card.querySelector('.merchant-location');
    const locationLabel = locationButton.querySelector('.merchant-location-label');
    const place = merchantPlaceFor(state.merchantPlaces, merchant);
    const gmapLink = card.querySelector('.gmap-link');
    selectLabel.textContent = `Show ${merchant.name} on the map`;
    locationButton.hidden = !place;
    if (place) {
      locationLabel.textContent = place.locationName;
      locationButton.setAttribute('aria-label', `Show all merchants at ${place.locationName}`);
      locationButton.addEventListener('click', () => activateMerchantPlace(place));
    }
    selectButton.addEventListener('click', () => selectMerchant(merchant.id, true));
    gmapLink.href = googleMapsSearchUrl(merchant);
    gmapLink.setAttribute('aria-label', `Open ${merchant.name} in Google Maps`);
    fragment.append(card);
  });
  elements.list.append(fragment);
}

function renderFilters() {
  const categories = ['All', ...new Set(state.merchants.map((merchant) => merchant.category).filter(Boolean).sort())];
  elements.filters.replaceChildren();
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.className = 'filter-chip';
    button.type = 'button';
    button.textContent = category === 'All' ? 'All categories' : category;
    button.classList.toggle('is-active', state.activeCategory === category);
    button.addEventListener('click', () => {
      state.activeCategory = category;
      state.selectedMerchant = null;
      renderDirectory();
    });
    elements.filters.append(button);
  });
}

function renderDirectory({ updateMarkers = true } = {}) {
  updateDistanceOriginReticle();
  renderActivePlace();
  const merchants = directoryMerchants();
  const verifiedCount = state.merchants.filter((merchant) => merchant.coordinateSource !== 'fallback').length;
  const categoryLabel = state.activeCategory === 'All' ? 'All categories' : state.activeCategory;
  const scopeLabel = state.activePlace
    ? `${state.activePlace.locationName} · ${categoryLabel}`
    : categoryLabel;
  elements.directoryScopeLabel.textContent = state.activePlace
    ? `At ${state.activePlace.locationName}`
    : 'In this map view';
  elements.directoryPanel.setAttribute(
    'aria-label',
    state.activePlace
      ? `Merchants at ${state.activePlace.locationName}`
      : 'Merchants in current map view',
  );
  elements.count.textContent = merchants.length.toLocaleString('en-SG');
  setStatus(`${merchants.length.toLocaleString('en-SG')} shown · ${scopeLabel} · ${verifiedCount.toLocaleString('en-SG')} resolved total`);
  renderFilters();
  if (updateMarkers) renderMarkers(merchants);
  renderMerchantList(merchants);
  renderSearchResults();
}

function flatSearchResults() {
  return combinedSearchResults({
    merchantPlaces: state.merchantPlaces,
    merchants: directoryMerchants(),
    externalPlaces: state.placeResults,
    query: state.directoryQuery,
    activePlace: state.activePlace,
  });
}

function closeSearchResults() {
  state.activeSearchResult = -1;
  elements.searchResults.hidden = true;
  elements.searchInput.setAttribute('aria-expanded', 'false');
  elements.searchInput.removeAttribute('aria-activedescendant');
}

function appendSearchResultGroup(fragment, groupId, heading, results, renderOption) {
  if (!results.length) return;
  const group = document.createElement('section');
  group.className = 'search-result-group';
  const title = document.createElement('h2');
  title.id = `search-result-${groupId}-heading`;
  title.className = 'search-result-heading';
  title.textContent = heading;
  group.setAttribute('aria-labelledby', title.id);
  group.append(title);
  results.forEach((result) => group.append(renderOption(result)));
  fragment.append(group);
}

function renderSearchResults() {
  const query = elements.searchInput.value.trim();
  const results = flatSearchResults();
  if (state.activeSearchResult >= results.length) state.activeSearchResult = -1;
  elements.searchResults.replaceChildren();
  if (!query || state.searchResultsDismissed) return closeSearchResults();

  const fragment = document.createDocumentFragment();
  const merchantPlaceResults = results.filter(({ type }) => type === 'merchant-place');
  const merchantResults = results.filter(({ type }) => type === 'merchant');
  const placeResults = results.filter(({ type }) => type === 'place');
  const makeOption = (result) => {
    const index = results.indexOf(result);
    const option = document.createElement('button');
    option.id = `search-result-${index}`;
    option.className = 'search-result-option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === state.activeSearchResult));
    const primary = document.createElement('span');
    primary.className = 'search-result-primary';
    const secondary = document.createElement('span');
    secondary.className = 'search-result-secondary';
    if (result.type === 'merchant-place') {
      primary.textContent = result.place.locationName;
      secondary.textContent = `${result.place.locationType} · ${result.place.merchantCount.toLocaleString('en-SG')} merchants`;
    } else if (result.type === 'merchant') {
      primary.textContent = result.merchant.name;
      secondary.textContent = `${result.merchant.locationName} · ${result.merchant.address}`;
    } else {
      primary.textContent = result.place.label.split(',').slice(0, 2).join(',');
      secondary.textContent = result.place.label;
    }
    option.append(primary, secondary);
    option.addEventListener('click', () => chooseSearchResult(result));
    return option;
  };

  appendSearchResultGroup(fragment, 'directory-places', 'Places in merchant directory', merchantPlaceResults, makeOption);
  appendSearchResultGroup(fragment, 'merchants', 'Merchants in this view', merchantResults, makeOption);
  appendSearchResultGroup(fragment, 'singapore-places', 'Places in Singapore', placeResults, makeOption);
  const message = state.placeSearchError
    || (state.placeSearchPending ? 'Searching Singapore places…' : (!results.length ? 'No matching merchants or places found.' : ''));
  if (message) {
    const note = document.createElement('p');
    note.className = 'search-result-message';
    note.textContent = message;
    fragment.append(note);
  }
  elements.searchResults.append(fragment);
  elements.searchResults.hidden = !elements.searchResults.childElementCount;
  elements.searchInput.setAttribute('aria-expanded', String(!elements.searchResults.hidden));
  if (state.activeSearchResult >= 0) {
    elements.searchInput.setAttribute('aria-activedescendant', `search-result-${state.activeSearchResult}`);
  } else {
    elements.searchInput.removeAttribute('aria-activedescendant');
  }
}

function chooseSearchResult(result) {
  state.searchResultsDismissed = true;
  if (result.type === 'merchant-place') {
    activateMerchantPlace(result.place);
  } else if (result.type === 'merchant') {
    selectMerchant(result.merchant.id);
  } else {
    elements.searchInput.value = '';
    state.directoryQuery = '';
    state.placeResults = [];
    map.setView([result.place.latitude, result.place.longitude], 15);
    setStatus(`Showing merchants near ${result.place.label.split(',').slice(0, 2).join(',')}.`);
    renderDirectory();
  }
  closeSearchResults();
}

let placeSearchTimer;

function activateMerchantPlace(place) {
  clearTimeout(placeSearchTimer);
  activatePlaceSearch(state, place);
  elements.searchInput.value = '';
  if (place.coordinateBounds) {
    map.fitBounds(place.coordinateBounds, { padding: [36, 36], maxZoom: 16 });
  }
  renderDirectory();
  closeSearchResults();
  elements.searchInput.focus();
}

function removeActivePlace() {
  clearPlaceSearch(state);
  elements.searchInput.value = '';
  renderDirectory();
  closeSearchResults();
  elements.searchInput.focus();
}

elements.clearPlaceButton.addEventListener('click', removeActivePlace);

function updatePlaceResults(requestId, places, error = '') {
  if (requestId !== state.searchRequestId) return;
  state.placeResults = places;
  state.placeSearchError = error;
  state.placeSearchPending = false;
  state.activeSearchResult = -1;
  renderSearchResults();
}

function requestPlaceSuggestions(query) {
  clearTimeout(placeSearchTimer);
  const requestId = ++state.searchRequestId;
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return updatePlaceResults(requestId, []);

  state.placeSearchPending = true;
  state.placeSearchError = '';
  renderSearchResults();
  placeSearchTimer = setTimeout(async () => {
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=sg&q=${encodeURIComponent(normalizedQuery)}`;
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Place search is unavailable.');
      updatePlaceResults(requestId, placeSearchResults(await response.json()));
    } catch (error) {
      updatePlaceResults(requestId, [], 'Place search is unavailable. Local merchant matches are still shown.');
    }
  }, 250);
}

elements.searchInput.addEventListener('input', () => {
  state.searchResultsDismissed = false;
  state.directoryQuery = elements.searchInput.value;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;

  if (state.activePlace) {
    clearTimeout(placeSearchTimer);
    state.searchRequestId += 1;
    state.placeResults = [];
    state.placeSearchError = '';
    state.placeSearchPending = false;
    renderDirectory();
  } else {
    renderDirectory();
    requestPlaceSuggestions(elements.searchInput.value);
  }
});

elements.searchInput.addEventListener('focus', () => {
  state.searchResultsDismissed = false;
  renderSearchResults();
});

elements.searchInput.addEventListener('keydown', (event) => {
  const results = flatSearchResults();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    state.activeSearchResult = activeResultIndex(
      state.activeSearchResult,
      results.length,
      event.key === 'ArrowDown' ? 1 : -1,
    );
    renderSearchResults();
  } else if (event.key === 'Escape') {
    state.searchResultsDismissed = true;
    closeSearchResults();
  } else if (event.key === 'Enter' && state.activeSearchResult >= 0) {
    event.preventDefault();
    chooseSearchResult(results[state.activeSearchResult]);
  }
});

elements.searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const results = flatSearchResults();
  if (state.activeSearchResult >= 0) return chooseSearchResult(results[state.activeSearchResult]);
  const firstLocalPlace = results.find(({ type }) => type === 'merchant-place');
  if (firstLocalPlace) return chooseSearchResult(firstLocalPlace);
  const firstMapPlace = results.find(({ type }) => type === 'place');
  if (firstMapPlace) return chooseSearchResult(firstMapPlace);
  if (!elements.searchInput.value.trim()) return setStatus('Enter a merchant, address, mall, or neighbourhood to search.', true);
  setStatus('Showing matching merchants in this map view. Choose a suggestion or refine your search.');
});

elements.sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.sortMode;
    if (state.sortMode === nextMode) return;
    state.sortMode = nextMode;
    elements.sortButtons.forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate.dataset.sortMode === state.sortMode));
    });
    renderDirectory();
  });
});

elements.locateButton.addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('This browser does not support location lookup.', true);
  setStatus('Requesting your location…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      map.setView([coords.latitude, coords.longitude], 15);
      L.circleMarker([coords.latitude, coords.longitude], { radius: 8, color: '#075a9b', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(map).bindPopup('Your approximate location').openPopup();
      setStatus('Showing merchants near your current location.');
    },
    () => setStatus('Location was unavailable. You can still search for an address above.', true),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
});

map.on('moveend', () => {
  if (!state.merchants.length || state.pendingRevealMerchant) return;

  const selectedMarker = state.markersByMerchantId.get(state.selectedMerchant);
  renderDirectory({ updateMarkers: !selectedMarker?.isPopupOpen() });
});

map.on('move zoom', syncDistanceOriginReticle);

async function initializeDirectory() {
  try {
    const response = await fetch('./data/merchants.json');
    if (!response.ok) throw new Error('Merchant directory data could not be loaded.');
    const dataset = await response.json();
    state.merchants = dataset.merchants;
    state.merchantPlaces = merchantPlaceGroups(state.merchants);
    if (
      state.activePlace
      && !state.merchantPlaces.some(({ locationCell }) => locationCell === state.activePlace.locationCell)
    ) {
      clearPlaceSearch(state);
    }
    renderDirectory();
  } catch (error) {
    elements.count.textContent = '0';
    setStatus(error.message, true);
  }
}

initializeDirectory();
