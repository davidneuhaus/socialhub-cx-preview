/* SocialHub CX – minimal vanilla JS (no tracking, no cookies; sessionStorage only for the ?ref= origin of the visit). */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    nav.setAttribute("data-open", "false");
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.setAttribute("data-open", String(!open));
    });
  }
  /* Close nav dropdowns (<details>) on outside click / Escape */
  var drops = document.querySelectorAll(".site-nav details");
  document.addEventListener("click", function (e) {
    drops.forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute("open"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    drops.forEach(function (d) {
      if (d.hasAttribute("open")) { d.removeAttribute("open"); d.querySelector("summary").focus(); }
    });
  });

  /* ---------- Mobile sticky CTA: visible after the hero ---------- */
  var bar = document.querySelector(".mobile-cta");
  var hero = document.querySelector("[data-hero]");
  if (bar) {
    if (hero && "IntersectionObserver" in window) {
      bar.setAttribute("data-visible", "false");
      new IntersectionObserver(function (entries) {
        bar.setAttribute("data-visible", String(!entries[0].isIntersecting));
      }).observe(hero);
    } else {
      bar.setAttribute("data-visible", "true");
    }
  }

  /* ---------- "Copy for LLM": plain-text page summary -> clipboard ---------- */
  document.querySelectorAll("[data-llm-copy]").forEach(function (btn) {
    var box = btn.parentNode, tpl = box.querySelector(".llm-summary"), st = box.querySelector(".llm-status");
    btn.addEventListener("click", function () {
      var text = tpl ? (tpl.content ? tpl.content.textContent : tpl.textContent) : "";
      function done() { if (st) st.textContent = st.getAttribute("data-done"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
      } else { fallback(text); done(); }
    });
  });
  function fallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.className = "visually-hidden";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }
  /* Print button (Leistungsbeschreibung) */
  document.querySelectorAll("[data-print]").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });

  /* ---------- Referral (?ref=socialhub-io-<seite>): kept for this visit in sessionStorage, no cookies ---------- */
  function cleanRef(v) { return String(v || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80); }
  var REF_KEY = "shcx_ref";
  (function () {
    var r = cleanRef(new URLSearchParams(location.search).get("ref"));
    if (r) { try { sessionStorage.setItem(REF_KEY, r); } catch (e) { /* storage blocked: ignore */ } }
  })();
  function getRef() {
    var r = cleanRef(new URLSearchParams(location.search).get("ref"));
    if (r) return r;
    try { return cleanRef(sessionStorage.getItem(REF_KEY)); } catch (e) { return ""; }
  }

  /* ---------- Lead form component (data-intent="demo" | "pilot" | "angebot" | "unterlagen") ----------
     PREVIEW ONLY: submission opens the visitor's mail client via mailto:.
     TODO before launch: replace mailto with a GDPR-compliant endpoint (EU-hosted,
     AVV in place, no third-party scripts), then update Datenschutz accordingly. */
  var SEGMENTS = ["oepnv", "handel-loyalty", "banken-versicherungen", "verwaltung", "stadtwerke", "sonstiges"];
  var ALIASES = { /* EN slugs + legacy keys -> canonical segment keys */
    "public-transport": "oepnv", "retail-loyalty": "handel-loyalty", "banking-insurance": "banken-versicherungen",
    "public-sector": "verwaltung", "utilities": "stadtwerke",
    "finanzen-versicherungen": "banken-versicherungen", "kommunen": "verwaltung"
  };
  function normSegment(v) {
    if (!v) return "";
    v = String(v).toLowerCase().trim();
    if (ALIASES[v]) v = ALIASES[v];
    return SEGMENTS.indexOf(v) > -1 ? v : "";
  }
  function segmentFromReferrer() {
    try {
      if (!document.referrer) return "";
      var r = new URL(document.referrer);
      if (r.origin !== location.origin) return "";
      var m = r.pathname.match(/\/(?:branchen|industries|anwendungsfaelle|use-cases)\/([^/]+)\/?$/);
      return m ? normSegment(m[1]) : "";
    } catch (e) { return ""; }
  }
  function referrerPath() {
    try {
      if (!document.referrer) return "";
      var r = new URL(document.referrer);
      return r.origin === location.origin ? r.pathname : "";
    } catch (e) { return ""; }
  }

  document.querySelectorAll("form[data-lead-form]").forEach(function (form) {
    var intent = form.getAttribute("data-intent");
    var msg = {
      required: form.getAttribute("data-msg-required"),
      email: form.getAttribute("data-msg-email"),
      select: form.getAttribute("data-msg-select"),
      consent: form.getAttribute("data-msg-consent"),
      summary: form.getAttribute("data-msg-summary"),
      sent: form.getAttribute("data-msg-sent")
    };
    var summary = form.querySelector(".form-summary");
    var status = form.querySelector(".form-status");

    // hidden fields
    var params = new URLSearchParams(location.search);
    form.elements.intent.value = intent;
    form.elements.source_page.value = location.pathname;
    if (form.elements.ref) form.elements.ref.value = getRef();
    var started = Date.now();
    var minMs = (parseInt(form.getAttribute("data-min-seconds"), 10) || 0) * 1000;
    var endpoint = form.getAttribute("data-endpoint");

    // pre-fill Branche (demo mode): ?segment= wins, else referring segment page
    var seg = form.elements.segment;
    if (seg) {
      var q = params.get("segment");
      var v = normSegment(q) || segmentFromReferrer();
      if (v) seg.value = v;
    }

    function errorEl(field) { return document.getElementById(field.id + "-error"); }
    function validateField(field) {
      var err = "";
      if (field.type === "checkbox") {
        if (field.required && !field.checked) err = field.name === "consent" ? msg.consent : msg.required;
      } else {
        var val = field.value.trim();
        if (field.required && !val) err = field.tagName === "SELECT" ? (msg.select || msg.required) : msg.required;
        else if (field.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) err = msg.email;
      }
      var el = errorEl(field);
      if (el) el.textContent = err;
      if (err) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
      return err;
    }
    var fields = Array.prototype.filter.call(form.elements, function (f) {
      return f.id && (f.tagName === "INPUT" || f.tagName === "SELECT" || f.tagName === "TEXTAREA") && f.type !== "hidden";
    });
    fields.forEach(function (f) {
      f.addEventListener(f.type === "checkbox" || f.tagName === "SELECT" ? "change" : "blur", function () {
        if (f.hasAttribute("aria-invalid") || f.value) validateField(f);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errors = [];
      fields.forEach(function (f) {
        var err = validateField(f);
        if (err) errors.push({ id: f.id, label: (form.querySelector('label[for="' + f.id + '"]') || {}).textContent || f.name, err: err });
      });
      if (errors.length) {
        summary.hidden = false;
        var list = summary.querySelector("ul");
        list.innerHTML = "";
        errors.forEach(function (x) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = "#" + x.id;
          a.textContent = x.label.replace(/\s+/g, " ").trim().replace(/\*$/, "").trim() + ": " + x.err;
          a.addEventListener("click", function (ev) { ev.preventDefault(); document.getElementById(x.id).focus(); });
          li.appendChild(a); list.appendChild(li);
        });
        summary.focus();
        status.textContent = "";
        return;
      }
      summary.hidden = true;

      // Bot heuristics (no captcha): honeypot must be empty; minimal time-to-submit. Server must re-check + rate-limit.
      var hp = form.elements.website;
      if ((hp && hp.value) || Date.now() - started < minMs) {
        status.setAttribute("data-state", "error");
        status.textContent = form.getAttribute("data-msg-spam");
        return;
      }

      if (endpoint) {
        var data = {};
        form.querySelectorAll("input, select, textarea").forEach(function (f) {
          if (!f.name || f.name === "website") return;
          data[f.name] = f.type === "checkbox" ? f.checked : f.value.trim();
        });
        var btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        status.removeAttribute("data-state");
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "omit" })
          .then(function (r) {
            if (!r.ok) throw new Error(r.status);
            status.setAttribute("data-state", "ok");
            status.textContent = form.getAttribute("data-msg-ok");
            form.reset();
          })
          .catch(function () {
            status.setAttribute("data-state", "error");
            status.textContent = form.getAttribute("data-msg-error");
          })
          .then(function () { if (btn) btn.disabled = false; status.focus && status.setAttribute("tabindex", "-1"); status.focus(); });
        return;
      }

      // Preview fallback: build mailto body from all fields
      var lines = [];
      form.querySelectorAll("[data-mail-label]").forEach(function (f) {
        var label = f.getAttribute("data-mail-label");
        var val;
        if (f.type === "checkbox") val = f.checked ? (form.getAttribute("data-yes") || "ja") : (form.getAttribute("data-no") || "nein");
        else if (f.tagName === "SELECT") val = f.value ? f.options[f.selectedIndex].text : "";
        else val = f.value.trim();
        lines.push(label + ": " + val);
      });
      var href = "mailto:" + form.getAttribute("data-mailto") +
        "?subject=" + encodeURIComponent(form.getAttribute("data-subject")) +
        "&body=" + encodeURIComponent(lines.join("\n"));
      status.setAttribute("data-state", "ok");
      status.textContent = msg.sent;
      window.location.href = href;
    });
  });
})();
