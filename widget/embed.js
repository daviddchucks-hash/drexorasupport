/**
 * embed.js — Drexora Support Widget Loader
 *
 * Drop this onto any website with:
 *   <script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js"
 *           data-business="YOUR_BUSINESS_ID"></script>
 *
 * This script:
 *  1. Reads the data-business attribute (Firebase Auth UID of the business)
 *  2. Creates a fixed-position <iframe> pointing to widget.html
 *  3. Passes the business ID via query param
 *  4. Listens for postMessage resize events from the iframe
 */
(function () {
  'use strict';

  // ── Read configuration ──────────────────────────────────────
  var script = document.currentScript;
  if (!script) {
    console.warn('[Drexora Support] Could not locate the embed script element.');
    return;
  }

  var businessId = script.getAttribute('data-business');
  if (!businessId) {
    console.warn('[Drexora Support] Missing data-business attribute on embed script.');
    return;
  }

  // ── Derive widget.html URL relative to embed.js ─────────────
  var scriptUrl = script.src;
  var baseUrl   = scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);
  var widgetUrl = baseUrl + 'widget.html?business=' + encodeURIComponent(businessId);

  // ── Create the iframe ────────────────────────────────────────
  var frame = document.createElement('iframe');
  frame.src   = widgetUrl;
  frame.title = 'Drexora Support Widget';
  frame.setAttribute('allow',       'clipboard-write');
  frame.setAttribute('aria-label',  'Customer support chat widget');
  frame.setAttribute('loading',     'lazy');
  frame.setAttribute('frameborder', '0');
  frame.setAttribute('scrolling',   'no');

  // Initial (collapsed) size
  frame.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:min(390px,calc(100vw - 28px))',
    'height:80px',         // collapsed — shows just the launcher button
    'border:0',
    'background:transparent',
    'z-index:2147483000',
    'overflow:hidden',
    'transition:height .3s ease',
    'color-scheme:light',
    'pointer-events:auto'
  ].join(';');

  // Append once DOM is ready
  function appendFrame() {
    if (document.body) {
      document.body.appendChild(frame);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(frame);
      });
    }
  }
  appendFrame();

  // ── Listen for resize messages from the widget ───────────────
  window.addEventListener('message', function (event) {
    // Only trust messages from our widget iframe
    if (event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'drexora-resize')  return;

    var open = event.data.open;

    // Animate size
    frame.style.height = open
      ? 'min(640px,calc(100vh - 40px))'
      : '80px';
    frame.style.width = open
      ? 'min(390px,calc(100vw - 28px))'
      : 'min(390px,calc(100vw - 28px))';
  });

}());
