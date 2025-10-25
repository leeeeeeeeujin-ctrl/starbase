import { useCallback, useEffect, useState } from 'react';

export function useAnnouncements({ limit = 6 } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ missingTable: false });

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/content/announcements?limit=${encodeURIComponent(limit)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '공지 정보를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setMeta(payload.meta || { missingTable: false });
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      console.error('Failed to fetch announcements', error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  return {
    items,
    loading,
    error,
    meta,
    reload: fetchAnnouncements,
  };
}
