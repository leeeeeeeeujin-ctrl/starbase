"use client";

import { useEffect, useState } from 'react';

import { getMonacoLoaderState, initMonaco } from '@/lib/monaco/loaderClient';

const monacoState = getMonacoLoaderState();

export function useMonacoLoaderStatus() {
  const [status, setStatus] = useState(monacoState.status);

  useEffect(() => {
    if (monacoState.status === 'ready') {
      setStatus('ready');
      return undefined;
    }
    let canceled = false;
    initMonaco()
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
