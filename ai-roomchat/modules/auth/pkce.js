import { supabase } from '../../lib/supabase';

function sanitiseUrl(url) {
  if (typeof window === 'undefined') return;
  try {
    window.history.replaceState({}, document.title, url);
  } catch (error) {
    console.error('Failed to clean auth callback url', error);
  }
}

export async function exchangeAuthCodeFromUrl(urlString) {
  if (typeof window === 'undefined') return;

  let url;
  try {
    url = new URL(urlString || window.location.href);
  } catch (error) {
    console.error('Invalid URL while exchanging auth code', error);
    return;
  }

  const cleanUrl = `${url.origin}${url.pathname}${url.hash || ''}`;

  if (url.searchParams.has('error_description')) {
    const message = decodeURIComponent(url.searchParams.get('error_description'));
    sanitiseUrl(cleanUrl);
    throw new Error(message || '로그인 중 문제가 발생했습니다. 다시 시도해 주세요.');
  }

  if (!url.searchParams.has('code')) {
    return;
  }

  const authCode = url.searchParams.get('code');
  const verifier = url.searchParams.get('code_verifier') || undefined;

  const { error } = await supabase.auth.exchangeCodeForSession({ authCode, verifier });
  sanitiseUrl(cleanUrl);

  if (error) {
    throw error;
  }
}
