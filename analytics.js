/* georgekanaroglou.com: analytics and cookie controls.
   Nothing is tracked until a visitor accepts. Data goes to George's own Google Sheet. */
(function () {
  "use strict";

  var ENDPOINT = "https://script.google.com/macros/s/AKfycbz5sD8rScVK1-w9RdmOq4RDYou_SAV5GeR1eWoshG4t2qJh_NkrpBA9lp_AXw14qMOM/exec";
  var SITE = "georgekanaroglou.com";
  var CONSENT_VERSION = "2026-10-20";
  var AGREED_TO = "Analytics cookies, plus approximate location and network lookup";
  var GEO_URL = "https://ipapi.co/json/";

  var HALF_HOUR = 60 * 30;
  var SIX_MONTHS = 60 * 60 * 24 * 182;
  var YEAR = 60 * 60 * 24 * 365;

  if (ENDPOINT.indexOf("https://script.google.com/") !== 0) return;

  var q = new URLSearchParams(location.search);

  // Visit georgekanaroglou.com/?notrack=1 once on each of your devices to stop counting your own visits (?notrack=0 to undo).
  var notrack = false;
  try {
    if (q.get("notrack") === "1") localStorage.setItem("gk-notrack", "1");
    if (q.get("notrack") === "0") localStorage.removeItem("gk-notrack");
    notrack = localStorage.getItem("gk-notrack") === "1";
  } catch (e) {}
  var isBot = navigator.webdriver || /bot|crawl|spider|slurp|headless|preview|lighthouse/i.test(navigator.userAgent);

  /* ---------- Cookies ---------- */
  function getCookie(name) {
    var m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, seconds) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=" + seconds + "; SameSite=Lax; Secure";
  }
  function deleteCookie(name) {
    document.cookie = name + "=; path=/; max-age=0; SameSite=Lax; Secure";
  }
  function deleteAllCookies() {
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (name) deleteCookie(name);
    });
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function post(data) {
    data.site = SITE;
    try { fetch(ENDPOINT, { method: "POST", mode: "no-cors", keepalive: true, body: JSON.stringify(data) }); } catch (e) {}
  }

  /* ---------- Where the visit came from ---------- */
  var ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}

  function source() {
    if (q.get("utm_source")) return q.get("utm_source");
    if (!ref) return "Direct";
    if (ref === location.hostname.replace(/^www\./, "")) return "Internal";
    if (ref === "t.co" || ref === "x.com") return "X";
    var map = [["linkedin", "LinkedIn"], ["lnkd.in", "LinkedIn"], ["outlook", "Email"], ["mail.", "Email"],
               ["google", "Google"], ["bing", "Bing"], ["duckduckgo", "DuckDuckGo"], ["github", "GitHub"],
               ["twitter", "X"], ["facebook", "Facebook"], ["instagram", "Instagram"]];
    for (var i = 0; i < map.length; i++) { if (ref.indexOf(map[i][0]) > -1) return map[i][1]; }
    return ref;
  }

  var w = window.innerWidth;
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}

  var base = {
    page: location.pathname,
    source: source(),
    referrer: ref,
    utm_source: q.get("utm_source") || "",
    utm_medium: q.get("utm_medium") || "",
    utm_campaign: q.get("utm_campaign") || "",
    device: w < 768 ? "Mobile" : w < 1024 ? "Tablet" : "Desktop",
    screen: w,
    language: navigator.language || "",
    timezone: tz
  };

  /* ---------- Location and network (only after consent) ---------- */
  var geoPromise = null;
  function getGeo() {
    if (geoPromise) return geoPromise;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem("gk_geo") || "null"); } catch (e) {}
    if (cached) return (geoPromise = Promise.resolve(cached));

    geoPromise = new Promise(function (resolve) {
      var done = false;
      function finish(g) { if (!done) { done = true; resolve(g); } }
      setTimeout(function () { finish({}); }, 2500);
      fetch(GEO_URL)
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) {
          if (!j || j.error) return finish({});
          // The IP address is not kept. Only these fields are used.
          var g = { country: j.country_name || "", region: j.region || "", city: j.city || "", org: j.org || "" };
          try { sessionStorage.setItem("gk_geo", JSON.stringify(g)); } catch (e) {}
          finish(g);
        })
        .catch(function () { finish({}); });
    });
    return geoPromise;
  }

  /* ---------- Tracking ---------- */
  var visitorType = null;

  function tracking() {
    return !notrack && !isBot && getCookie("gk_consent") === "yes";
  }

  function ids() {
    var vid = getCookie("gk_vid");
    if (visitorType === null) visitorType = vid ? "returning" : "new";
    if (!vid) vid = newId();
    var sid = getCookie("gk_sid");
    var land = getCookie("gk_land");
    if (!sid) { sid = newId(); land = location.pathname; }
    if (!land) land = location.pathname;
    setCookie("gk_vid", vid, YEAR);
    setCookie("gk_sid", sid, HALF_HOUR);
    setCookie("gk_land", land, HALF_HOUR);
    return { vid: vid, sid: sid, land: land };
  }

  function send(event, extra) {
    if (!tracking()) return;
    var id = ids();
    getGeo().then(function (g) {
      if (!tracking()) return;
      post(Object.assign({}, base, g, {
        event: event, vid: id.vid, sid: id.sid, visitor: visitorType, landing: id.land
      }, extra || {}));
    });
  }

  var start = Date.now(), viewSent = false, left = false;
  function sendView() {
    if (viewSent) return;
    viewSent = true;
    start = Date.now();
    send("view");
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && viewSent && !left) {
      left = true;
      send("leave", { seconds: Math.round((Date.now() - start) / 1000) });
    }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var mail = e.target.closest('a[href^="mailto:"]');
    if (mail) send("email_click", { label: mail.getAttribute("href").replace("mailto:", "") });
    else if (e.target.closest('a[href="#contact"]')) send("cta_click", { label: "Get in touch" });
  });

  /* ---------- Consent records ---------- */
  var AGREED = {
    accepted: AGREED_TO,
    declined: "Declined. Strictly necessary cookies only",
    withdrawn: "Withdrew consent for: " + AGREED_TO,
    cleared: "Cleared all site data from this browser"
  };

  function logConsent(choice, method) {
    var cid = getCookie("gk_cid") || newId();
    if (choice !== "cleared") setCookie("gk_cid", cid, SIX_MONTHS);
    post({
      event: "consent", cid: cid, choice: choice, agreed: AGREED[choice],
      version: CONSENT_VERSION, method: method, page: location.pathname,
      vid: getCookie("gk_vid") || ""
    });
  }

  function eraseHistory() {
    var vid = getCookie("gk_vid");
    if (vid) post({ event: "erase", vid: vid });
  }

  function removeAnalyticsData() {
    ["gk_vid", "gk_sid", "gk_land"].forEach(deleteCookie);
    try { sessionStorage.removeItem("gk_geo"); } catch (e) {}
    geoPromise = null;
  }

  /* ---------- Banner and settings panel ---------- */
  var css =
    ".gk-consent{position:fixed;z-index:10;left:50%;bottom:clamp(.75rem,3vw,1.5rem);transform:translateX(-50%);" +
    "width:min(40rem,100% - 1.5rem);max-height:calc(100vh - 1.5rem);overflow:auto;display:grid;gap:1rem;" +
    "padding:1.25rem 1.25rem 1.25rem 1.5rem;background:var(--raised,#1A1A1A);color:var(--text,#F5F5F5);" +
    "border:1px solid var(--line,#2A2A2A);border-left:6px solid var(--primary,#0077BC);font-size:.95rem;line-height:1.5}" +
    ".gk-consent[hidden]{display:none}" +
    ".gk-consent h2{margin:0;font-family:var(--display,inherit);font-weight:400;font-size:1.2rem}" +
    ".gk-consent p{margin:0}" +
    ".gk-consent ul{margin:0;padding-left:1.1rem;display:grid;gap:.35rem}" +
    ".gk-consent a{color:inherit;text-underline-offset:3px}" +
    ".gk-note{color:var(--muted,#A3A3A3)}" +
    ".gk-actions{display:flex;gap:.75rem;flex-wrap:wrap}" +
    ".gk-btn{min-height:44px;min-width:7.5rem;padding:.6rem 1.4rem;cursor:pointer;font:inherit;font-weight:700;" +
    "color:var(--text,#F5F5F5);background:transparent;border:2px solid var(--text,#F5F5F5)}" +
    ".gk-btn-primary{color:#FFFFFF;background:var(--primary,#0077BC);border-color:var(--primary,#0077BC)}" +
    ".gk-btn:focus-visible{outline:3px solid var(--text,#F5F5F5);outline-offset:3px}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var panel = document.createElement("div");
  panel.className = "gk-consent";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Cookie settings");
  panel.hidden = true;
  document.body.appendChild(panel);

  var mode = "closed";
  var NOTE = '<p class="gk-note">A record of your cookie choices is kept either way, so I can show I asked for consent.</p>';

  function btn(action, label, primary) {
    return '<button type="button" class="gk-btn' + (primary ? " gk-btn-primary" : "") + '" data-action="' + action + '">' + label + "</button>";
  }

  function show(html, newMode, focus) {
    mode = newMode;
    panel.innerHTML = html;
    panel.hidden = false;
    if (focus) { var b = panel.querySelector("button"); if (b) b.focus(); }
  }

  function close() {
    mode = "closed";
    panel.hidden = true;
    panel.innerHTML = "";
  }

  function showBanner(focus) {
    show(
      "<p>I use cookies to see how people find and use this site. If you accept, I also look up your approximate location and network, " +
      "such as your city or the company you’re connected through. No ads, and no tracking on other sites. " +
      '<a href="/privacy.html">How I use them</a></p>' +
      '<div class="gk-actions">' + btn("accept", "Accept", true) + btn("decline", "Decline") + "</div>",
      "banner", focus
    );
  }

  function showSettings() {
    var choice = getCookie("gk_consent");
    if (!choice) return showBanner(true);
    if (choice === "yes") {
      show(
        "<h2>Cookie settings</h2>" +
        "<p>You’ve accepted cookies. Visits from this browser are being counted.</p>" +
        "<ul><li>Withdraw consent stops tracking, deletes the cookies and removes your visit history from my records.</li>" +
        "<li>Clear all does the same, and also removes your cookie choice and anything else this site stored in your browser.</li></ul>" +
        NOTE +
        '<div class="gk-actions">' + btn("withdraw", "Withdraw consent") + btn("clear", "Clear all") + btn("close", "Close") + "</div>",
        "settings", true
      );
    } else {
      show(
        "<h2>Cookie settings</h2>" +
        "<p>You’ve declined cookies. Nothing is being tracked.</p>" +
        "<ul><li>Clear all removes your cookie choice and anything else this site stored in your browser.</li></ul>" +
        NOTE +
        '<div class="gk-actions">' + btn("accept", "Accept", true) + btn("clear", "Clear all") + btn("close", "Close") + "</div>",
        "settings", true
      );
    }
  }

  function showDone(message, next) {
    show(
      "<p>" + message + "</p>" +
      '<div class="gk-actions">' + btn(next === "banner" ? "reopen" : "close", "Close") + "</div>",
      "done", true
    );
  }

  /* ---------- Actions ---------- */
  function accept(method) {
    setCookie("gk_consent", "yes", SIX_MONTHS);
    logConsent("accepted", method);
    close();
    sendView();
  }

  function decline(method) {
    setCookie("gk_consent", "no", SIX_MONTHS);
    logConsent("declined", method);
    removeAnalyticsData();
    close();
  }

  function withdraw() {
    eraseHistory();
    setCookie("gk_consent", "no", SIX_MONTHS);
    logConsent("withdrawn", "settings");
    removeAnalyticsData();
    showDone("Done. Your consent is withdrawn, your cookies are deleted and your visit history is being removed from my records.");
  }

  function clearAll() {
    eraseHistory();
    logConsent("cleared", "settings");
    removeAnalyticsData();
    deleteAllCookies();
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    viewSent = false;
    visitorType = null;
    showDone("Done. Everything this site stored in your browser has been removed, and your visit history is being removed from my records.", "banner");
  }

  panel.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-action]");
    if (!b) return;
    var action = b.getAttribute("data-action");
    var method = mode === "banner" ? "banner" : "settings";
    if (action === "accept") accept(method);
    else if (action === "decline") decline(method);
    else if (action === "withdraw") withdraw();
    else if (action === "clear") clearAll();
    else if (action === "reopen") showBanner(true);
    else close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && (mode === "settings" || mode === "done")) close();
  });

  var settingsButton = document.getElementById("cookie-settings");
  if (settingsButton) {
    settingsButton.hidden = false;
    settingsButton.addEventListener("click", showSettings);
  }

  /* ---------- Start ---------- */
  var choice = getCookie("gk_consent");
  if (!choice) showBanner(false);
  else if (choice === "yes") sendView();
})();
