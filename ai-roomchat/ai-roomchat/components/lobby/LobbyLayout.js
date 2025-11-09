import React from 'react';

export default function LobbyLayout({ header, tabs, children, backgroundUrl }) {
  const pageStyle = backgroundUrl ? styles.pageWithBackground(backgroundUrl) : styles.page;

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {header}
        {tabs}
        {children}
      </div>
    </div>
  );
}

const basePage = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#0f172a',
  backgroundImage:
    'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(15,23,42,0.86) 40%, rgba(15,23,42,0.76) 100%)',
};

const styles = {
  page: basePage,
  pageWithBackground: imageUrl => ({
    ...basePage,
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.88) 45%, rgba(15,23,42,0.95) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
  container: {
    width: '100%',
    maxWidth: 560,
    margin: '0 auto',
    padding: '24px 16px 140px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
};
//
