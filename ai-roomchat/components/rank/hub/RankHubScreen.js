import { useEffect, useMemo, useState } from 'react';
import RankHubGuestNotice from './RankHubGuestNotice';
import RankHubHeader from './RankHubHeader';
import RegisterGamePanel from './RegisterGamePanel';
import JoinGamePanel from './JoinGamePanel';
import PlayTestPanel from './PlayTestPanel';
import ParticipantLeaderboard from './ParticipantLeaderboard';
import { useRankHub } from '../../../hooks/rank/useRankHub';

const containerStyle = {
  maxWidth: 1100,
  margin: '24px auto',
  padding: 12,
  display: 'grid',
  gap: 16,
};

const loadingStyle = {
  maxWidth: 980,
  margin: '40px auto',
  padding: 16,
};

export default function RankHubScreen() {
  const hub = useRankHub();
  const [backgroundImage, setBackgroundImage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('selectedHeroBackgroundUrl') || '';
      setBackgroundImage(stored);
    } catch (error) {
      console.error('Failed to hydrate rank hub background:', error);
    }
  }, []);

  const pageStyle = useMemo(() => {
    if (backgroundImage) {
      return {
        minHeight: '100vh',
        backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.95) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      };
    }
    return {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    };
  }, [backgroundImage]);

  if (!hub.initialized) {
    return (
      <div style={loadingStyle}>
        <h2>랭킹 허브</h2>
        <p>정보를 불러오는 중입니다…</p>
      </div>
    );
  }

  if (!hub.user) {
    return <RankHubGuestNotice />;
  }

  const { createForm, joinForm, playForm } = hub.forms;
  const { onCreateGame, onJoin, onPlay } = hub.actions;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <RankHubHeader />
        <RegisterGamePanel form={createForm} onSubmit={onCreateGame} />
        <JoinGamePanel games={hub.games} form={joinForm} onSubmit={onJoin} />
        <PlayTestPanel games={hub.games} form={playForm} onSubmit={onPlay} />
        <ParticipantLeaderboard participants={hub.participants} onRefresh={hub.refreshLists} />
      </div>
    </div>
  );
}
