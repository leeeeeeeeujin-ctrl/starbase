import { middleware } from '../middleware.js';

const fakeRequest = {
  nextUrl: { pathname: '/' },
  url: 'http://localhost/'
};

(async () => {
  try {
    const res = await middleware(fakeRequest);
    console.log('middleware returned:', res && (res.status || res.status === 0 ? res.status : res));
  } catch (err) {
    console.error('middleware threw error:');
    console.error(err && err.stack ? err.stack : err);
  }
})();