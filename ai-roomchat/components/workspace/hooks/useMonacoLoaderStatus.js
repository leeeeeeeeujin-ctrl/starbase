"use client";

import { useEffect, useState } from 'react';
import loader from '@monaco-editor/loader';

const CDN_PATH = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';

const monacoState = {
  status: 'pending', // 'pending' | 'ready' | 'error'
  error: null,
  promise: null,
};

function configureLoader() {
  if (typeof window === 'undefined' || !loader || typeof loader.config !== 'function') return;
  try {
    loader.config({ paths: { vs: CDN_PATH } });
  } catch (err) {
    // allow init() to pick up existing config if this fails
  }
}

function ensureMonacoLoaderReady() {
  if (monacoState.status === 'ready') {
    return Promise.resolve('ready');
  }
  if (monacoState.promise) {
    return monacoState.promise;
  }
  configureLoader();
  monacoState.promise = loader
    .init()
    .then((monaco) => {
      if (!monaco || !monaco.editor) {
        throw new Error('Monaco not available');
      }
      monacoState.status = 'ready';
      monacoState.error = null;
      return 'ready';
    })
    .catch((err) => {
      monacoState.status = 'error';
      monacoState.error = err;
      monacoState.promise = null;
      throw err;
    });
  return monacoState.promise;
}

export function useMonacoLoaderStatus() {
  const [status, setStatus] = useState(monacoState.status);

  useEffect(() => {
    if (monacoState.status === 'ready') {
      setStatus('ready');
      return undefined;
    }
    let canceled = false;
    ensureMonacoLoaderReady()
      .then(() => {
        if (!canceled) setStatus('ready');
      })
      .catch(() => {
        if (!canceled) setStatus('error');
      });
    return () => {
      canceled = true;
    };
  }, []);

  return status;
}

export function getMonacoLoaderError() {
  return monacoState.error;
}
