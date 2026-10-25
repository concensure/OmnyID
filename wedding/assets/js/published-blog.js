// Durable operator-published article projection. The API supplies metadata
// only; DOM textContent keeps database copy out of the HTML execution path.
(function () {
  "use strict";
  var grid = document.querySelector("[data-blog-grid]");
  if (!grid) return;

  function text(parent, tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }

  function categoryLabel(value) {
    return String(value || "planning").replace(/-/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  fetch("/wedding/blog-publications", { credentials: "omit", headers: { Accept: "application/json" } })
    .then(function (response) { return response.ok ? response.json() : { publications: [] }; })
    .then(function (payload) {
      var items = Array.isArray(payload.publications) ? payload.publications : [];
      items.slice().reverse().forEach(function (item) {
        if (!item || typeof item.url !== "string" || typeof item.title !== "string") return;
        var card = document.createElement("a");
        card.className = "blog-card";
        card.href = item.url;
        card.dataset.category = typeof item.category === "string" ? item.category : "planning";
        card.dataset.keywords = [item.title, item.summary, item.category].filter(Boolean).join(" ");
        var thumb = document.createElement("div");
        thumb.className = "thumb";
        thumb.setAttribute("aria-hidden", "true");
        thumb.style.background = "linear-gradient(135deg,#fff1f2,#fef3c7)";
        text(thumb, "span", "cat", categoryLabel(item.category));
        card.appendChild(thumb);
        var content = document.createElement("div");
        content.className = "content";
        var published = item.published_at ? new Date(item.published_at) : null;
        text(content, "span", "meta", published && !Number.isNaN(published.getTime()) ? "Published " + published.toLocaleDateString() : "Wedding guide");
        text(content, "h3", "", item.title);
        text(content, "p", "", typeof item.summary === "string" ? item.summary : "Read the latest OmnyID Weddings guide.");
        text(content, "span", "read-more", "Read the guide →");
        card.appendChild(content);
        grid.insertBefore(card, grid.firstChild);
      });
      document.dispatchEvent(new CustomEvent("wedding:blog-publications-loaded"));
    })
    .catch(function () { /* Static articles remain fully usable. */ });
}());
