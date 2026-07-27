/*
 * Drexora Support customer widget loader.
 *
 * Usage:
 * <script
 *   src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js"
 *   data-business="YOUR_BUSINESS_ID">
 * </script>
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var businessId = script.getAttribute('data-business');
  if (!businessId) {
    console.warn('[Drexora Support] Add a data-business attribute to the embed script.');
    return;
  }

  var baseUrl = new URL(script.src);
  var frame = document.createElement('iframe');
  frame.title = 'Drexora Support';
  frame.src = new URL('widget.html', baseUrl).toString() + '?business=' + encodeURIComponent(businessId);
  frame.setAttribute('allow', 'clipboard-write');
  frame.setAttribute('aria-label', 'Drexora Support customer service widget');
  frame.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'width:min(390px, calc(100vw - 24px))',
    'height:88px',
    'border:0',
    'background:transparent',
    'z-index:2147483000',
    'pointer-events:auto',
    'color-scheme:light'
  ].join(';');

  document.body.appendChild(frame);
  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'drexora-widget-resize') {
      frame.style.pointerEvents = 'auto';
      frame.style.height = event.data.open ? 'min(680px, calc(100vh - 24px))' : '88px';
    }
  });
}());