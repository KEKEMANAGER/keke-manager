/**
 * Everything the phone may run without a screen, defined before the app.
 *
 * Android can start the app's JavaScript with no screen at all — the trip's GPS
 * after the app was killed, the server's silent "gps_wake" push — and then only
 * the entry file (index.js) is run, not the screens. Tasks defined further in
 * were simply missing at that moment.
 */
import './backgroundLocation';
import './gpsWake';
