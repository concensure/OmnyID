(function () {
  'use strict';
  var form = document.getElementById('directorySearch');
  var input = document.getElementById('vendorSearch');
  var grid = document.getElementById('vendorGrid');
  var status = document.getElementById('directoryStatus');
  var filters = document.getElementById('vendorCategoryFilters');
  if (!form || !input || !grid || !status || !filters) return;
  var initialCategory = new URLSearchParams(window.location.search).get('category') || '';
  var selectedCategory = initialCategory;
  var categories = [];
  var initialQuery = new URLSearchParams(window.location.search).get('q') || '';
  if (initialQuery) input.value = initialQuery;

  function safeImageUrl(raw) {
    try { var url = new URL(raw, window.location.origin); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function claimHref(slug) { return '../workspace/vendor.html?source=vendor_claim&vendor_slug=' + encodeURIComponent(slug); }
  function clearGrid() { while (grid.firstChild) grid.removeChild(grid.firstChild); }
  function initials(name) { return String(name || 'Wedding vendor').split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join(''); }
  function addChips(body, values) { if (!Array.isArray(values) || !values.length) return; var list = document.createElement('div'); list.className = 'vendor-chip-list'; values.slice(0, 4).forEach(function (value) { var chip = document.createElement('span'); chip.className = 'vendor-chip'; chip.textContent = value; list.appendChild(chip); }); body.appendChild(list); }
  function consultationLabel(consultation) {
    if (!consultation || consultation.state === 'closed') return '10-minute consultations are not open yet.';
    if (consultation.state === 'available_now') return 'Available now for a 10-minute phone consultation.';
    var days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var when = consultation.next_date || days[Number(consultation.next_weekday)] || 'a future day';
    return 'Next listed 10-minute consultation: ' + when + (consultation.next_time ? ' at ' + consultation.next_time : '') + '.';
  }
  function card(vendor) {
    var article = document.createElement('article'); article.className = 'vendor-card';
    var photo = vendor.photos && vendor.photos[0]; var imageUrl = photo && safeImageUrl(photo.url);
    if (imageUrl) { var img = document.createElement('img'); img.className = 'vendor-card-image'; img.src = imageUrl; img.alt = (photo.alt_text || vendor.name || 'Wedding vendor').slice(0, 500); img.loading = 'lazy'; article.appendChild(img); }
    else { var placeholder = document.createElement('div'); placeholder.className = 'vendor-card-placeholder'; placeholder.setAttribute('role', 'img'); placeholder.setAttribute('aria-label', (vendor.name || 'This vendor') + ' has not supplied a licensed profile photograph yet'); var letters = document.createElement('span'); letters.textContent = initials(vendor.name); var photoNote = document.createElement('small'); photoNote.textContent = 'Photo available after owner approval'; placeholder.append(letters, photoNote); article.appendChild(placeholder); }
    var body = document.createElement('div'); body.className = 'vendor-card-body';
    var badge = document.createElement('span'); badge.className = 'vendor-badge'; badge.textContent = vendor.claim_status === 'verified' ? 'Verified owner' : vendor.claim_status === 'claimed' ? 'Claimed by owner' : 'Unclaimed listing'; body.appendChild(badge);
    var heading = document.createElement('h3'); heading.textContent = vendor.name || 'Wedding vendor'; body.appendChild(heading);
    var meta = document.createElement('p'); meta.className = 'vendor-meta'; meta.textContent = [vendor.category, vendor.service_area].filter(Boolean).join(' · '); body.appendChild(meta);
    if (vendor.description) { var desc = document.createElement('p'); desc.className = 'vendor-summary'; desc.textContent = vendor.description.slice(0, 260); body.appendChild(desc); }
    addChips(body, vendor.styles);
    if (/celebrant/i.test(vendor.category || '')) { var availability = document.createElement('p'); availability.className = 'consultation-status'; availability.textContent = consultationLabel(vendor.consultation); body.appendChild(availability); }
    var pricing = document.createElement('p'); pricing.className = 'vendor-price-line'; pricing.innerHTML = '<strong>Pricing:</strong> Ask for a current, date-specific quote'; body.appendChild(pricing);
    if (vendor.claim_cta) { var claimNote = document.createElement('p'); claimNote.className = 'vendor-claim-note'; claimNote.textContent = 'Own this business? Claim this listing to update photos, pricing, and reply to enquiries.'; body.appendChild(claimNote); }
    var actions = document.createElement('div'); actions.className = 'vendor-card-actions'; var action = document.createElement('a'); action.className = 'btn btn-primary'; action.href = '/wedding/directory/' + encodeURIComponent(vendor.slug); action.textContent = 'View details'; actions.appendChild(action);
    if (/celebrant/i.test(vendor.category || '')) { var call = document.createElement('a'); call.className = 'btn btn-outline'; call.href = 'talk-to-a-celebrant.html?vendor=' + encodeURIComponent(vendor.slug); call.textContent = 'Talk for 10 minutes'; actions.appendChild(call); }
    if (vendor.claim_cta) { var claim = document.createElement('a'); claim.className = 'btn btn-outline'; claim.href = claimHref(vendor.slug); claim.textContent = 'Claim this listing'; actions.appendChild(claim); }
    body.appendChild(actions);
    article.appendChild(body); return article;
  }
  function render(items) {
    clearGrid();
    if (!items.length) { var empty = document.createElement('p'); empty.className = 'vendor-empty'; empty.textContent = 'No vendors matched that search yet. Try a suburb or category.'; grid.appendChild(empty); return; }
    items.forEach(function (vendor) { grid.appendChild(card(vendor)); });
  }
  function renderFilters() {
    while (filters.firstChild) filters.removeChild(filters.firstChild);
    [''].concat(categories).forEach(function (category) {
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'directory-filter';
      button.textContent = category || 'All vendors';
      button.setAttribute('aria-pressed', selectedCategory === category ? 'true' : 'false');
      button.addEventListener('click', function () { selectedCategory = category; renderFilters(); load((input.value || '').trim()); });
      filters.appendChild(button);
    });
  }
  function load(query) {
    status.textContent = 'Loading vendors…';
    var url = '/api/public/wedding/vendors?limit=500'; if (query) url += '&q=' + encodeURIComponent(query); if (selectedCategory) url += '&category=' + encodeURIComponent(selectedCategory);
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load the vendor directory right now.'); return response.json();
    }).then(function (payload) {
      var items = Array.isArray(payload.items) ? payload.items : [];
      if (!categories.length && !selectedCategory && !query) { categories = Array.from(new Set(items.map(function (vendor) { return vendor.category; }).filter(Boolean))).sort(); renderFilters(); }
      render(items); status.textContent = items.length ? items.length + ' vendor' + (items.length === 1 ? '' : 's') + ' found.' : 'No vendors found.';
    }).catch(function (error) { clearGrid(); status.textContent = error.message || 'Unable to load the vendor directory.'; });
  }
  form.addEventListener('submit', function (event) { event.preventDefault(); load((input.value || '').trim()); });
  fetch('/api/public/wedding/vendors?limit=500', { headers: { Accept: 'application/json' } }).then(function (response) { return response.ok ? response.json() : { items: [] }; }).then(function (payload) { categories = Array.from(new Set((Array.isArray(payload.items) ? payload.items : []).map(function (vendor) { return vendor.category; }).filter(Boolean))).sort(); if (selectedCategory && !categories.some(function (category) { return category.toLowerCase() === selectedCategory.toLowerCase(); })) selectedCategory = ''; else if (selectedCategory) selectedCategory = categories.find(function (category) { return category.toLowerCase() === selectedCategory.toLowerCase(); }) || selectedCategory; renderFilters(); load(initialQuery); }).catch(function () { categories = selectedCategory ? [selectedCategory] : []; renderFilters(); load(initialQuery); });
})();
