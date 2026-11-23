(function () {
  'use strict';
  var section = document.getElementById('weddingReviews');
  var list = document.getElementById('weddingReviewList');
  var status = document.getElementById('weddingReviewStatus');
  var order = document.getElementById('weddingReviewOrder');
  if (!section || !list || !status || !order) return;
  var vendorId = section.getAttribute('data-vendor-id') || '';
  if (!vendorId) return;
  function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function paragraph(className, text) { var p = document.createElement('p'); p.className = className; p.textContent = text; return p; }
  function reviewCard(item) {
    var snapshot = item && item.public_snapshot && typeof item.public_snapshot === 'object' ? item.public_snapshot : {};
    var article = document.createElement('article'); article.className = 'public-review-card';
    var top = document.createElement('div'); top.className = 'public-review-card-head';
    var label = document.createElement('strong'); label.textContent = clean(snapshot.display_label) || 'OmnyID couple'; top.appendChild(label);
    if (typeof item.rating === 'number') { var rating = document.createElement('span'); rating.textContent = item.rating + ' out of 5'; top.appendChild(rating); }
    article.appendChild(top);
    article.appendChild(paragraph('public-review-meta', [clean(item.experience_kind).replace(/_/g, ' '), clean(snapshot.event_month), clean(item.verification_state).replace(/_/g, ' ')].filter(Boolean).join(' · ')));
    article.appendChild(paragraph('public-review-title', clean(snapshot.title) || 'Wedding experience'));
    article.appendChild(paragraph('public-review-body', clean(snapshot.body)));
    var question = clean(snapshot.next_couple_question); if (question) article.appendChild(paragraph('public-review-question', 'A question this couple suggests: ' + question));
    var reply = item.vendor_reply && item.vendor_reply.public_snapshot; if (reply && typeof reply === 'object') {
      var response = document.createElement('aside'); response.className = 'public-review-reply';
      response.appendChild(paragraph('public-review-reply-label', 'Reply from ' + (clean(reply.attribution) || 'the vendor')));
      response.appendChild(paragraph('public-review-body', clean(reply.body))); article.appendChild(response);
    }
    return article;
  }
  function load() {
    status.textContent = 'Loading wedding reviews…';
    fetch('/public/wedding/vendors/' + encodeURIComponent(vendorId) + '/reviews?sort=' + encodeURIComponent(order.value), { headers: { Accept: 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('Wedding reviews are unavailable right now.'); return response.json(); })
      .then(function (payload) {
        clear(list); var reviews = Array.isArray(payload.reviews) ? payload.reviews : []; var aggregate = payload.aggregate || {};
        if (!reviews.length) { status.textContent = 'No wedding reviews on OmnyID yet.'; return; }
        status.textContent = aggregate.show_compact_score && aggregate.average_display
          ? aggregate.average_display + ' out of 5 · ' + reviews.length + ' wedding review' + (reviews.length === 1 ? '' : 's')
          : reviews.length + ' wedding review' + (reviews.length === 1 ? '' : 's') + ' · an overall score appears after 3 eligible reviews.';
        reviews.forEach(function (item) { list.appendChild(reviewCard(item)); });
      })
      .catch(function (error) { clear(list); status.textContent = error.message || 'Wedding reviews are unavailable right now.'; });
  }
  order.addEventListener('change', load); load();
})();
