import Link from 'next/link';

const styles = {
  root: { maxWidth: 980, margin: '40px auto', padding: 16 },
  button: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    display: 'inline-block',
    textDecoration: 'none',
    color: '#0f172a',
  },
};

export default function RankHubGuestNotice() {
  return (
    <div style={styles.root}>
      <h2>랭킹 허브</h2>
      <p>랭킹 기능을 사용하려면 로그인하세요.</p>
      <Link href="/" style={styles.button}>
        홈으로
      </Link>
    </div>
  );
}
