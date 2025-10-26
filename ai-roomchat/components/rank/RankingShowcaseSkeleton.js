// components/rank/RankingShowcaseSkeleton.js

export default function RankingShowcaseSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section
        style={{
          borderRadius: 28,
          padding: 20,
          background: 'linear-gradient(135deg, rgba(15,118,110,0.35) 0%, rgba(30,64,175,0.3) 100%)',
          color: '#f8fafc',
          display: 'grid',
          gap: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 140,
              height: 18,
              borderRadius: 999,
              background: 'rgba(226, 232, 240, 0.3)',
            }}
          />
          <div
            style={{
              width: 120,
              height: 32,
              borderRadius: 999,
              background: 'rgba(226, 232, 240, 0.22)',
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 20 }}>
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 28,
              background: 'rgba(15, 23, 42, 0.45)',
              border: '2px solid rgba(244, 244, 245, 0.25)',
            }}
          />
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            }}
          >
            {[0, 1, 2].map(idx => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                style={{
                  borderRadius: 18,
                  padding: 16,
                  background: 'rgba(15, 23, 42, 0.35)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: '60%',
                    height: 16,
                    borderRadius: 999,
                    background: 'rgba(226, 232, 240, 0.28)',
                  }}
                />
                <div
                  style={{
                    width: '40%',
                    height: 12,
                    borderRadius: 999,
                    background: 'rgba(226, 232, 240, 0.2)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          borderRadius: 24,
          padding: 20,
          background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.82) 100%)',
          color: '#e2e8f0',
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 160,
            height: 18,
            borderRadius: 999,
            background: 'rgba(226, 232, 240, 0.24)',
          }}
        />
        <div style={{ display: 'grid', gap: 12 }}>
          {[0, 1, 2, 3].map(idx => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 18,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              />
              <div style={{ display: 'grid', gap: 6 }}>
                <div
                  style={{
                    width: 140,
                    height: 16,
                    borderRadius: 999,
                    background: 'rgba(226, 232, 240, 0.24)',
                  }}
                />
                <div
                  style={{
                    width: 110,
                    height: 12,
                    borderRadius: 999,
                    background: 'rgba(226, 232, 240, 0.18)',
                  }}
                />
              </div>
              <div
                style={{
                  width: 48,
                  height: 16,
                  borderRadius: 999,
                  background: 'rgba(226, 232, 240, 0.2)',
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          borderRadius: 24,
          padding: 20,
          background:
            'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.82) 100%)',
          color: '#e2e8f0',
          display: 'grid',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 120,
            height: 18,
            borderRadius: 999,
            background: 'rgba(226, 232, 240, 0.24)',
          }}
        />
        <div style={{ display: 'grid', gap: 12 }}>
          {[0, 1, 2].map(group => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={group}
              style={{
                borderRadius: 20,
                padding: 16,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    background: 'rgba(15, 23, 42, 0.45)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                  }}
                />
                <div style={{ display: 'grid', gap: 6 }}>
                  <div
                    style={{
                      width: 160,
                      height: 16,
                      borderRadius: 999,
                      background: 'rgba(226, 232, 240, 0.22)',
                    }}
                  />
                  <div
                    style={{
                      width: 120,
                      height: 12,
                      borderRadius: 999,
                      background: 'rgba(226, 232, 240, 0.16)',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[0, 1, 2].map(entry => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={entry}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 16,
                      background: 'rgba(30, 41, 59, 0.55)',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'rgba(15, 23, 42, 0.45)',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                      }}
                    />
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div
                        style={{
                          width: 120,
                          height: 14,
                          borderRadius: 999,
                          background: 'rgba(226, 232, 240, 0.2)',
                        }}
                      />
                      <div
                        style={{
                          width: 100,
                          height: 12,
                          borderRadius: 999,
                          background: 'rgba(226, 232, 240, 0.16)',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 48,
                        height: 14,
                        borderRadius: 999,
                        background: 'rgba(226, 232, 240, 0.18)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

//
