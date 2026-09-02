import { type Route } from '@vaadin/router';
import './qr-generator/qr-generator.js';
import './not-found/not-found.js';

export const routes: Route[] = [
  { path: '/', component: 'app-qr-generator', name: 'QR Code Studio' },
  // The fallback route should always be after other alternatives.
  { path: '(.*)', component: 'app-not-found' },
];
