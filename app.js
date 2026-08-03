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
  locateButton: document.querySelector('#locate-button'),
};

const state = { merchants: [], activeCategory: 'All', selectedLocation: null, markerLayer: L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42 }) };
map.addLayer(state.markerLayer);

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('is-error', isError);
}

function locationKey(merchant) {
  return `${merchant.latitude},${merchant.longitude}`;
}

function visibleMerchants() {
  const bounds = map.getBounds();
  return state.merchants.filter((merchant) => (
    (state.activeCategory === 'All' || merchant.category === state.activeCategory)
    && bounds.contains([merchant.latitude, merchant.longitude])
  ));
}

function groupByLocation(merchants) {
  return merchants.reduce((locations, merchant) => {
    const key = locationKey(merchant);
    (locations.get(key) ?? locations.set(key, []).get(key)).push(merchant);
    return locations;
  }, new Map());
}

function selectLocation(key, shouldPan = false) {
  state.selectedLocation = key;
  if (shouldPan) {
    const merchant = state.merchants.find((item) => locationKey(item) === key);
    if (merchant) map.setView([merchant.latitude, merchant.longitude], Math.max(map.getZoom(), 15));
  }
  renderDirectory();
}

function renderMarkers(merchants) {
  state.markerLayer.clearLayers();
  groupByLocation(merchants).forEach((atLocation) => {
    const [first] = atLocation;
    const key = locationKey(first);
    const names = atLocation.slice(0, 5).map((merchant) => `<li>${escapeHtml(merchant.name)}</li>`).join('');
    const label = atLocation.length > 1 ? `${atLocation.length}` : '1';
    const icon = L.divIcon({ className: 'location-pin', html: `<span>${label}</span>`, iconSize: [34, 34] });
    const marker = L.marker([first.latitude, first.longitude], { icon, title: `${atLocation.length} merchant${atLocation.length === 1 ? '' : 's'} at ${first.locationName}` });
    marker.bindPopup(`<div class="merchant-popup"><h2>${escapeHtml(first.locationName)}</h2><p>${atLocation.length} merchant${atLocation.length === 1 ? '' : 's'}</p><ul>${names}</ul></div>`);
    marker.on('click', () => selectLocation(key));
    state.markerLayer.addLayer(marker);
  });
}

function renderMerchantList(merchants) {
  elements.list.replaceChildren();
  if (!merchants.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No matching merchants are in this map view. Try zooming out or clearing a filter.';
    elements.list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  merchants.forEach((merchant) => {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    const key = locationKey(merchant);
    card.querySelector('.merchant-category').textContent = merchant.category;
    card.querySelector('.merchant-name').textContent = merchant.name;
    card.querySelector('.merchant-location').textContent = merchant.locationName;
    card.querySelector('.merchant-address').textContent = merchant.address;
    card.classList.toggle('is-selected', state.selectedLocation === key);
    card.addEventListener('click', () => selectLocation(key, true));
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
      state.selectedLocation = null;
      renderDirectory();
    });
    elements.filters.append(button);
  });
}

function renderDirectory() {
  const merchants = visibleMerchants();
  elements.count.textContent = merchants.length.toLocaleString('en-SG');
  setStatus(`${state.activeCategory === 'All' ? 'All categories' : state.activeCategory} · updated for the current map view`);
  renderFilters();
  renderMarkers(merchants);
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
  if (state.merchants.length) renderDirectory();
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
