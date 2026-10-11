// Local browser development uses Express on the same origin. For a packaged Android build,
// set this to the HTTPS backend API root before building, for example:
// window.API_BASE_URL = 'https://your-server.example/api';
window.API_BASE_URL = window.API_BASE_URL || '/api';
