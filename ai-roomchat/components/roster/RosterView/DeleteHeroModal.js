import styles from './styles';

export default function DeleteHeroModal({ hero, open, deleting, onCancel, onConfirm }) {
  if (!open || !hero) return null;

  return (
    <div style={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div style={styles.modalBody}>
        <div style={styles.modalIcon}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9Z" fill="currentColor" />
          </svg>
        </div>
        <div style={styles.modalTextGroup}>
          <h2 style={styles.modalTitle}>영원히 삭제할까요?</h2>
          <p style={styles.modalSubtitle}>
            삭제하면 3분간 새로 생성할 수 없습니다.
            <br />
            <strong>{hero.name}</strong> 영웅을 삭제하시겠습니까?
          </p>
        </div>
        <div style={styles.modalActions}>
          <button
            type="button"
            onClick={onCancel}
            style={styles.modalCancelButton}
            disabled={deleting}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...styles.modalDeleteButton,
              background: deleting
                ? 'rgba(248,113,113,0.5)'
                : 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
            disabled={deleting}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
