import {
  clearMerchantSelection,
  distanceMeters,
  formatDistance,
  googleMapsSearchUrl,
  merchantMatchesQuery,
  orderMerchants,
  requestMerchantSelection,
  revealClusteredMarker,
} from './merchant-utils.mjs?v=4';

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
  filters: document.querySelector('#category-filters'),
  list: document.querySelector('#merchant-list'),
  template: document.querySelector('#merchant-template'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  merchantSearchInput: document.querySelector('#merchant-search-input'),
  sortButtons: [...document.querySelectorAll('[data-sort-mode]')],
  locateButton: document.querySelector('#locate-button'),
};

const state = {
  merchants: [],
  activeCategory: 'All',
  directoryQuery: '',
  sortMode: 'alphabetical',
  selectedMerchant: null,
  pendingRevealMerchant: null,
  distanceOriginMarker: null,
  markerLayer: L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42, disableClusteringAtZoom: 19 }),
  markersByMerchantId: new Map(),
};
map.addLayer(state.markerLayer);

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

function directoryMerchants() {
  const bounds = map.getBounds();
  const matchingMerchants = state.merchants.filter((merchant) => (
    merchant.coordinateSource === 'onemap'
    && (state.activeCategory === 'All' || merchant.category === state.activeCategory)
    && bounds.contains([merchant.latitude, merchant.longitude])
    && merchantMatchesQuery(merchant, state.directoryQuery)
  ));
  return orderMerchants(matchingMerchants, {
    mode: state.sortMode,
    origin: mapCenterOrigin(),
  });
}

function mapCenterOrigin() {
  const center = map.getCenter();
  return { latitude: center.lat, longitude: center.lng };
}

function updateDistanceOriginMarker() {
  if (state.sortMode !== 'distance') {
    if (state.distanceOriginMarker) map.removeLayer(state.distanceOriginMarker);
    state.distanceOriginMarker = null;
    return;
  }

  if (!state.distanceOriginMarker) {
    state.distanceOriginMarker = L.circleMarker(map.getCenter(), {
      radius: 6,
      className: 'distance-origin-marker',
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(map);
  } else {
    state.distanceOriginMarker.setLatLng(map.getCenter());
  }
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
    const icon = L.divIcon({ className: 'location-pin', html: '<span>•</span>', iconSize: [34, 34] });
    const marker = L.marker([merchant.latitude, merchant.longitude], { icon, title: `${merchant.name} at ${merchant.locationName}` });
    const gmapUrl = googleMapsSearchUrl(merchant);
    marker.bindPopup(`
      <div class="merchant-popup">
        <h2>${escapeHtml(merchant.name)}</h2>
        <p>${escapeHtml(merchant.locationName)}</p>
        <p>${escapeHtml(merchant.address)}</p>
        <a class="gmap-link" href="${escapeHtml(gmapUrl)}" target="_blank" rel="noopener noreferrer">gmap ↗</a>
      </div>
    `);
    marker.on('click', () => selectMerchant(merchant.id));
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
    empty.textContent = state.directoryQuery.trim()
      ? `No merchants match “${state.directoryQuery.trim()}” in this map view. Try another search or clear it.`
      : 'No matching merchants are in this map view. Try zooming out or clearing a filter.';
    elements.list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  merchants.forEach((merchant) => {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    card.querySelector('.merchant-category').textContent = merchant.category;
    card.querySelector('.merchant-name').textContent = merchant.name;
    card.querySelector('.merchant-location').textContent = merchant.locationName;
    card.querySelector('.merchant-address').textContent = merchant.address;
    const distance = card.querySelector('.merchant-distance');
    if (state.sortMode === 'distance') {
      distance.hidden = false;
      distance.textContent = formatDistance(distanceMeters(mapCenterOrigin(), merchant));
    }
    card.classList.toggle('is-selected', state.selectedMerchant === merchant.id);
    const selectButton = card.querySelector('.merchant-select');
    const gmapLink = card.querySelector('.gmap-link');
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
  updateDistanceOriginMarker();
  const merchants = directoryMerchants();
  const verifiedCount = state.merchants.filter((merchant) => merchant.coordinateSource === 'onemap').length;
  elements.count.textContent = merchants.length.toLocaleString('en-SG');
  setStatus(`${merchants.length.toLocaleString('en-SG')} shown · ${state.activeCategory === 'All' ? 'All categories' : state.activeCategory} · ${verifiedCount.toLocaleString('en-SG')} OneMap-verified total`);
  renderFilters();
  if (updateMarkers) renderMarkers(merchants);
  renderMerchantList(merchants);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function searchAddress(query) {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=sg&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Address search is currently unavailable.');
  const [result] = await response.json();
  if (!result) throw new Error('No Singapore address was found. Try a street, mall, or neighbourhood.');
  map.setView([Number(result.lat), Number(result.lon)], 15);
  setStatus(`Showing merchants near ${result.display_name.split(',').slice(0, 2).join(',')}.`);
}

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (!query) return setStatus('Enter an address, mall, or neighbourhood to search.', true);
  setStatus('Finding that address…');
  try {
    await searchAddress(query);
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.merchantSearchInput.addEventListener('input', () => {
  state.directoryQuery = elements.merchantSearchInput.value;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;
  renderDirectory();
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

async function initializeDirectory() {
  try {
    const response = await fetch('./data/merchants.json');
    if (!response.ok) throw new Error('Merchant directory data could not be loaded.');
    const dataset = await response.json();
    state.merchants = dataset.merchants;
    renderDirectory();
  } catch (error) {
    elements.count.textContent = '0';
    setStatus(error.message, true);
  }
}

initializeDirectory();
