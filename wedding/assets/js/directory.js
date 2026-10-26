(function () {
  'use strict';
  var form = document.getElementById('directorySearch');
  var input = document.getElementById('vendorSearch');
  var grid = document.getElementById('vendorGrid');
  var status = document.getElementById('directoryStatus');
  var filters = document.getElementById('vendorCategoryFilters');
  if (!form || !input || !grid || !status || !filters) return;
  var selectedCategory = '';
  var categories = [];

  function safeImageUrl(raw) {
    try { var url = new URL(raw, window.location.origin); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function claimHref(slug) { return '../workspace/vendor.html?source=vendor_claim&vendor_slug=' + encodeURIComponent(slug); }
  function clearGrid() { while (grid.firstChild) grid.removeChild(grid.firstChild); }
  function card(vendor) {
    var article = document.createElement('article'); article.className = 'vendor-card';
    var photo = vendor.photos && vendor.photos[0]; var imageUrl = photo && safeImageUrl(photo.url);
    if (imageUrl) { var img = document.createElement('img'); img.className = 'vendor-card-image'; img.src = imageUrl; img.alt = (photo.alt_text || vendor.name || 'Wedding vendor').slice(0, 500); img.loading = 'lazy'; article.appendChild(img); }
    var body = document.createElement('div'); body.className = 'vendor-card-body';
    var badge = document.createElement('span'); badge.className = 'vendor-badge'; badge.textContent = vendor.claim_status === 'verified' ? 'Verified owner' : vendor.claim_status === 'claimed' ? 'Claimed by owner' : 'Unclaimed listing'; body.appendChild(badge);
    var heading = document.createElement('h3'); heading.textContent = vendor.name || 'Wedding vendor'; body.appendChild(heading);
    var meta = document.createElement('p'); meta.className = 'vendor-meta'; meta.textContent = [vendor.category, vendor.service_area].filter(Boolean).join(' · '); body.appendChild(meta);
    if (vendor.description) { var desc = document.createElement('p'); desc.className = 'vendor-meta'; desc.textContent = vendor.description.slice(0, 180); body.appendChild(desc); }
    if (vendor.claim_cta) { var claimNote = document.createElement('p'); claimNote.className = 'vendor-claim-note'; claimNote.textContent = 'Own this business? Claim this listing to update photos, pricing, and reply to enquiries.'; body.appendChild(claimNote); }
    var action = document.createElement('a'); action.className = vendor.claim_cta ? 'btn btn-outline' : 'btn btn-primary'; action.href = vendor.claim_cta ? claimHref(vendor.slug) : vendor.agent_card_url ? '../workspace/?auth=register&source=wedding_enquiry&vendor=' + encodeURIComponent(vendor.slug) : (vendor.website_url || '#'); action.textContent = vendor.claim_cta ? 'Claim this listing' : vendor.agent_card_url ? 'Enquire securely' : 'View vendor'; body.appendChild(action);
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
    var url = '/api/public/wedding/vendors?limit=200'; if (query) url += '&q=' + encodeURIComponent(query); if (selectedCategory) url += '&category=' + encodeURIComponent(selectedCategory);
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load the vendor directory right now.'); return response.json();
    }).then(function (payload) {
      var items = Array.isArray(payload.items) ? payload.items : [];
      if (!selectedCategory && !query) { categories = Array.from(new Set(items.map(function (vendor) { return vendor.category; }).filter(Boolean))).sort(); renderFilters(); }
      render(items); status.textContent = items.length ? items.length + ' vendor' + (items.length === 1 ? '' : 's') + ' found.' : 'No vendors found.';
    }).catch(function (error) { clearGrid(); status.textContent = error.message || 'Unable to load the vendor directory.'; });
  }
  form.addEventListener('submit', function (event) { event.preventDefault(); load((input.value || '').trim()); });
  renderFilters();
  load('');
})();
