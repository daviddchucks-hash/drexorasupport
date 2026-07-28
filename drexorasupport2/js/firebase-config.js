/**
 * firebase-config.js
 * Drexora Support — Firebase initialisation
 * Loaded as a regular <script> (NOT a module) so window.firebase is available
 * before any ES-module scripts run.
 */

(function () {
  'use strict';

  var firebaseConfig = {
    apiKey:            "AIzaSyA1wX_0tastbk_hWfI0_cvuV9ZzoIKitL4",
    authDomain:        "drexorasupport.firebaseapp.com",
    projectId:         "drexorasupport",
    storageBucket:     "drexorasupport.firebasestorage.app",
    messagingSenderId: "669148105903",
    appId:             "1:669148105903:web:69641657318107bf1a185a",
    measurementId:     "G-5M2CGWLDND",
    databaseURL:       "https://drexorasupport-default-rtdb.firebaseio.com"
  };

  // Guard against double-initialisation (e.g. hot-reload)
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
}());
