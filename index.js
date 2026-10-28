// Background tasks first: Android can start the app without a screen (a trip's
// GPS after the app was killed, the server's silent "gps_wake" push), and then
// only this file runs — see lib/backgroundTasks.native.ts.
import './lib/backgroundTasks';
import 'expo-router/entry';
