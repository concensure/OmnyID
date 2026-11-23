(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var source = params.get("source") === "wedding" ? "wedding" : "generic";
  var token = params.get("token") || "";
  var API_BASE = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? "http://127.0.0.1:8080"
    : "https://api.omnyid.com";
  var redirectTimer = null;
  var countdownTimer = null;
  var content = source === "wedding" ? {
    eyebrow: "Welcome to OmnyID Weddings",
    title: "Less worry. More of the fun.",
    promise: "Your email is confirmed, and you are now part of the OmnyID community.",
    message: "Your private wedding workspace is ready to keep plans, people, quotes and decisions connected.",
    wish: "Wishing you an enjoyable planning journey.",
    destination: "/workspace/?auth=signin&source=wedding&verified=1",
    action: "Continue to Wedding Home", opening: "Wedding Home",
    image: "assets/images/wedding-community-confirmation.webp", width: "960", height: "640",
    alt: "A newly married couple holding hands outdoors",
    credit: "Photo by Jeremy Wong Weddings on Unsplash",
    creditUrl: "https://unsplash.com/photos/man-and-woman-holding-hands-focus-photo-464ps_nOflw"
  } : {
    eyebrow: "Welcome to OmnyID", title: "A clearer place for what matters.",
    promise: "Your email is confirmed. Thank you for choosing to join the OmnyID community.",
    message: "Your workspace is ready to help you keep information connected and move from ideas to considered action.",
    wish: "We are glad you are here.", destination: "/workspace/?auth=signin&verified=1",
    action: "Continue to my workspace", opening: "your workspace",
    image: "assets/images/omnyid-community-confirmation.webp", width: "960", height: "644",
    alt: "Two orange handprints framing a painted red heart", credit: "Photo by Rod Long on Unsplash",
    creditUrl: "https://unsplash.com/photos/orange-handprints-with-red-heart-89bQBucvJdw"
  };

  function byId(id) { return document.getElementById(id); }
  var mark = byId("confirmation-mark");
  var eyebrow = byId("confirmation-eyebrow");
  var title = byId("confirmation-title");
  var promise = byId("confirmation-promise");
  var message = byId("confirmation-message");
  var wish = byId("confirmation-wish");
  var actions = byId("confirmation-actions");
  var destination = byId("confirmation-destination");
  var pause = byId("pause-redirect");
  var note = byId("redirect-note");
  var photo = byId("confirmation-photo");
  var image = byId("confirmation-image");
  var credit = byId("confirmation-credit");

  document.body.dataset.experience = source;
  mark.classList.add("is-working");

  function icon(path) {
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="' + path + '"/></svg>';
  }

  function stopRedirect() {
    if (redirectTimer) window.clearTimeout(redirectTimer);
    if (countdownTimer) window.clearInterval(countdownTimer);
    redirectTimer = null;
    countdownTimer = null;
    note.textContent = "Automatic opening paused. Continue whenever you are ready.";
    pause.hidden = true;
  }

  function startRedirect() {
    var seconds = 8;
    note.hidden = false;
    note.textContent = "Opening " + content.opening + " in " + seconds + " seconds…";
    countdownTimer = window.setInterval(function () {
      seconds -= 1;
      note.textContent = "Opening " + content.opening + " in " + seconds + " second" + (seconds === 1 ? "…" : "s…");
    }, 1000);
    redirectTimer = window.setTimeout(function () { window.location.assign(content.destination); }, 8000);
  }

  function showSuccess() {
    window.history.replaceState({}, "", "/verify-email?source=" + source);
    document.title = source === "wedding" ? "Welcome to OmnyID Weddings" : "Welcome to OmnyID";
    mark.className = "status-mark is-success";
    icon("M5 13l4 4L19 7");
    eyebrow.textContent = content.eyebrow;
    title.textContent = content.title;
    promise.textContent = content.promise;
    message.textContent = content.message;
    wish.textContent = content.wish;
    wish.hidden = false;
    destination.href = content.destination;
    destination.textContent = content.action;
    actions.hidden = false;
    image.src = content.image;
    image.width = content.width;
    image.height = content.height;
    image.alt = content.alt;
    var link = document.createElement("a");
    link.href = content.creditUrl;
    link.rel = "noopener noreferrer";
    link.textContent = content.credit;
    credit.replaceChildren(link);
    photo.hidden = false;
    startRedirect();
  }

  function showFailure(detail) {
    mark.className = "status-mark is-error";
    icon("M6 18L18 6M6 6l12 12");
    eyebrow.textContent = "This link needs attention";
    title.textContent = "We could not confirm that email.";
    promise.textContent = detail || "The link may be incomplete or expired.";
    message.textContent = "Return to sign in and request a fresh confirmation email. Your account details are still safe.";
    destination.href = "/workspace/?auth=signin" + (source === "wedding" ? "&source=wedding" : "");
    destination.textContent = "Return to sign in";
    actions.hidden = false;
    pause.hidden = true;
  }

  pause.addEventListener("click", stopRedirect);
  destination.addEventListener("click", stopRedirect);
  if (!token) {
    showFailure("This page needs the complete confirmation link from your email.");
    return;
  }
  fetch(API_BASE + "/auth/verify-email", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token })
  }).then(function (response) {
    if (!response.ok) throw new Error("This confirmation link is invalid or has expired.");
    return response.json();
  }).then(showSuccess).catch(function (error) { showFailure(error && error.message); });
}());
