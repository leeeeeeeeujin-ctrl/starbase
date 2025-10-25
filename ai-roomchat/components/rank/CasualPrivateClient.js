'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import RoleOccupancySummary from './RoleOccupancySummary';
import styles from './CasualPrivateClient.module.css';

const STORAGE_PREFIX = 'casualPrivateRooms:';

function generateCode(existingCodes) {
  const codes = new Set(existingCodes);
  while (true) {
    const value = Math.floor(100000 + Math.random() * 900000).toString();
    if (!codes.has(value)) {
      return value;
    }
  }
}

function cloneRooms(list) {
  if (!Array.isArray(list)) return [];
  return list.map(room => ({
    ...room,
    slots: Array.isArray(room.slots)
      ? room.slots.map(slot => ({
          ...slot,
          occupant: slot.occupant ? { ...slot.occupant } : null,
        }))
      : [],
  }));
}

function buildSlotTemplates(roleDetails, fallbackRoles) {
  const templates = [];
  if (Array.isArray(roleDetails) && roleDetails.length) {
    roleDetails.forEach(role => {
      const name = role?.name || '슬롯';
      const count = Math.max(1, Number(role?.slot_count ?? role?.slotCount) || 1);
      for (let index = 0; index < count; index += 1) {
        templates.push({ id: `${name}-${index}`, role: name, index });
      }
    });
  } else if (Array.isArray(fallbackRoles) && fallbackRoles.length) {
    fallbackRoles.forEach(role => {
      const name =
        typeof role === 'string'
          ? role.trim()
          : typeof role?.name === 'string'
            ? role.name.trim()
            : '';
      if (!name) return;
      templates.push({ id: `${name}-0`, role: name, index: 0 });
    });
  }

  if (!templates.length) {
    templates.push({ id: '참가자-0', role: '참가자', index: 0 });
  }

  return templates;
}

function normalizeRoom(room, templates, usedCodes) {
  if (!room || typeof room !== 'object') return null;
  const slotMap = new Map();
  if (Array.isArray(room.slots)) {
    room.slots.forEach(slot => {
      if (!slot || typeof slot !== 'object') return;
      slotMap.set(slot.id, slot);
    });
  }

  const slots = templates.map(template => {
    const existing = slotMap.get(template.id);
    if (existing?.occupant && typeof existing.occupant === 'object' && existing.occupant.userId) {
      return {
        id: template.id,
        role: template.role,
        index: template.index,
        occupant: {
          userId: existing.occupant.userId,
          heroId: existing.occupant.heroId || '',
          heroName: existing.occupant.heroName || '',
          heroImage: existing.occupant.heroImage || '',
          ready: Boolean(existing.occupant.ready),
          isHost: Boolean(existing.occupant.isHost),
        },
      };
    }

    return {
      id: template.id,
      role: template.role,
      index: template.index,
      occupant: null,
    };
  });

  const occupants = slots.filter(slot => slot.occupant);
  if (!occupants.length) {
    return null;
  }

  let hostId = room.hostId;
  if (!hostId || !occupants.some(slot => slot.occupant.userId === hostId)) {
    hostId = occupants[0].occupant.userId;
  }

  const slotsWithHost = slots.map(slot => {
    if (!slot.occupant) return slot;
    return {
      ...slot,
      occupant: {
        ...slot.occupant,
        isHost: slot.occupant.userId === hostId,
      },
    };
  });

  let code = typeof room.code === 'string' ? room.code.trim() : '';
  while (!code || usedCodes.has(code)) {
    code = generateCode(usedCodes);
  }

  const name = typeof room.name === 'string' && room.name.trim().length ? room.name : '사설 방';
  const createdAt = Number.isFinite(room.createdAt) ? room.createdAt : Date.now();

  return {
    id: room.id || `room-${Math.random().toString(36).slice(2, 9)}`,
    code,
    name,
    createdAt,
    hostId,
    slots: slotsWithHost,
  };
}

function normalizeRooms(list, templates) {
  const usedCodes = new Set();
  if (!Array.isArray(list)) return [];
  const normalized = [];
  list.forEach(room => {
    const value = normalizeRoom(room, templates, usedCodes);
    if (value) {
      usedCodes.add(value.code);
      normalized.push(value);
    }
  });
  return normalized;
}

function loadRooms(gameId, templates) {
  if (!gameId || typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${gameId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeRooms(parsed, templates);
  } catch (error) {
    console.warn('사설 방 정보를 불러오지 못했습니다:', error);
    return [];
  }
}

function saveRooms(gameId, rooms) {
  if (!gameId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${gameId}`, JSON.stringify(rooms));
  } catch (error) {
    console.warn('사설 방 정보를 저장하지 못했습니다:', error);
  }
}

function clearRooms(gameId) {
  if (!gameId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${gameId}`);
  } catch (error) {
    console.warn('사설 방 정보를 초기화하지 못했습니다:', error);
  }
}

function makeOccupant({ user, hero, isHost = false }) {
  return {
    userId: user?.id || '',
    heroId: hero?.id || '',
    heroName: hero?.name || '미지정 영웅',
    heroImage: hero?.image_url || hero?.imageUrl || '',
    ready: false,
    isHost,
  };
}

function formatMemberLabel(occupant) {
  if (!occupant) return '비어 있음';
  if (occupant.heroName) return occupant.heroName;
  if (occupant.userId) return `사용자 ${occupant.userId.slice(0, 6)}`;
  return '미지정 플레이어';
}

function formatRoomStatus(room) {
  const filled = room.slots.filter(slot => slot.occupant).length;
  return `${filled}/${room.slots.length}명 참여 중`;
}

function SlotPicker({ open, title, slots, onSelect, onClose }) {
  if (!open) return null;
  return (
    <div className={styles.slotPickerBackdrop} role="dialog" aria-modal="true">
      <div className={styles.slotPicker}>
        <header className={styles.slotPickerHeader}>
          <h3 className={styles.slotPickerTitle}>{title}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className={styles.slotPickerGrid}>
          {slots.map(slot => (
            <button
              key={slot.id}
              type="button"
              className={styles.slotPickerButton}
              onClick={() => onSelect?.(slot.id)}
            >
              <span className={styles.slotPickerRole}>{slot.role}</span>
              <span className={styles.slotPickerHint}>슬롯 #{slot.index + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CasualPrivateClient({
  game,
  roleDetails,
  roles,
  roleOccupancy = [],
  myHero,
  user,
  onExit,
  onLaunch,
}) {
  const gameId = game?.id || '';
  const slotTemplates = useMemo(() => buildSlotTemplates(roleDetails, roles), [roleDetails, roles]);
  const templateKey = useMemo(() => slotTemplates.map(slot => slot.id).join('|'), [slotTemplates]);

  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [slotPicker, setSlotPicker] = useState({ open: false, kind: null, roomId: '' });

  useEffect(() => {
    if (!gameId) return;
    const initial = loadRooms(gameId, slotTemplates);
    setRooms(initial);
  }, [gameId, templateKey, slotTemplates]);

  useEffect(() => {
    if (!gameId) return () => {};
    return () => {
      clearRooms(gameId);
    };
  }, [gameId]);

  const updateRooms = useCallback(
    mutator => {
      setRooms(prev => {
        const base = cloneRooms(prev);
        const mutated = mutator(base);
        const normalized = normalizeRooms(Array.isArray(mutated) ? mutated : [], slotTemplates);
        saveRooms(gameId, normalized);
        return normalized;
      });
    },
    [gameId, slotTemplates]
  );

  const viewerRoom = useMemo(() => {
    if (!user?.id) return null;
    return rooms.find(room =>
      room.slots.some(slot => slot.occupant && slot.occupant.userId === user.id)
    );
  }, [rooms, user?.id]);

  const viewerSlot = useMemo(() => {
    if (!viewerRoom || !user?.id) return null;
    return viewerRoom.slots.find(slot => slot.occupant?.userId === user.id) || null;
  }, [viewerRoom, user?.id]);

  const allFilled = viewerRoom ? viewerRoom.slots.every(slot => slot.occupant) : false;
  const allReady = viewerRoom
    ? viewerRoom.slots.every(slot => slot.occupant && slot.occupant.ready)
    : false;
  const canStart = viewerRoom && user?.id && viewerRoom.hostId === user.id && allFilled && allReady;

  const availableRooms = useMemo(() => {
    if (!rooms.length) return [];
    return rooms
      .map(room => ({
        ...room,
        openSlots: room.slots.filter(slot => !slot.occupant),
      }))
      .filter(room => room.openSlots.length > 0);
  }, [rooms]);

  const handleRequireHero = useCallback(() => {
    if (!user?.id) {
      setError('로그인이 필요합니다.');
      return false;
    }
    if (!myHero?.id) {
      setError('먼저 사용할 캐릭터를 선택해 주세요.');
      return false;
    }
    setError('');
    return true;
  }, [myHero?.id, user?.id]);

  const handleCreateRoom = useCallback(() => {
    if (!handleRequireHero()) return;
    setSlotPicker({ open: true, kind: 'create', roomId: '' });
  }, [handleRequireHero]);

  const handleJoinRoom = useCallback(
    roomId => {
      if (!handleRequireHero()) return;
      const target = rooms.find(room => room.id === roomId);
      if (!target || target.slots.every(slot => slot.occupant)) {
        setError('참여할 수 있는 슬롯이 없습니다.');
        return;
      }
      setError('');
      setSlotPicker({ open: true, kind: 'join', roomId });
    },
    [handleRequireHero, rooms]
  );

  const handleSwitchSlot = useCallback(() => {
    if (!viewerRoom) return;
    const empties = viewerRoom.slots.filter(slot => !slot.occupant);
    if (!empties.length) {
      setError('이동할 수 있는 빈 슬롯이 없습니다.');
      return;
    }
    setError('');
    setSlotPicker({ open: true, kind: 'switch', roomId: viewerRoom.id });
  }, [viewerRoom]);

  const closeSlotPicker = useCallback(() => {
    setSlotPicker({ open: false, kind: null, roomId: '' });
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (!viewerRoom || !user?.id) return;
    updateRooms(prev =>
      prev
        .map(room => ({
          ...room,
          slots: room.slots.map(slot =>
            slot.occupant?.userId === user.id ? { ...slot, occupant: null } : slot
          ),
        }))
        .filter(room => room.slots.some(slot => slot.occupant))
    );
  }, [updateRooms, user?.id, viewerRoom]);

  const handleToggleReady = useCallback(() => {
    if (!viewerRoom || !user?.id) return;
    updateRooms(prev =>
      prev.map(room => {
        if (room.id !== viewerRoom.id) return room;
        return {
          ...room,
          slots: room.slots.map(slot => {
            if (!slot.occupant || slot.occupant.userId !== user.id) return slot;
            return {
              ...slot,
              occupant: { ...slot.occupant, ready: !slot.occupant.ready },
            };
          }),
        };
      })
    );
  }, [updateRooms, user?.id, viewerRoom]);

  const handleKick = useCallback(
    targetId => {
      if (!viewerRoom || viewerRoom.hostId !== user?.id) return;
      updateRooms(prev =>
        prev
          .map(room => {
            if (room.id !== viewerRoom.id) return room;
            return {
              ...room,
              slots: room.slots.map(slot =>
                slot.occupant?.userId === targetId ? { ...slot, occupant: null } : slot
              ),
            };
          })
          .filter(room => room.slots.some(slot => slot.occupant))
      );
    },
    [updateRooms, user?.id, viewerRoom]
  );

  const handleStart = useCallback(() => {
    if (!viewerRoom || !canStart) return;
    onLaunch?.({ room: viewerRoom });
    updateRooms(prev => prev.filter(room => room.id !== viewerRoom.id));
    clearRooms(gameId);
  }, [canStart, gameId, onLaunch, updateRooms, viewerRoom]);

  const handleExitClick = useCallback(() => {
    clearRooms(gameId);
    onExit?.();
  }, [gameId, onExit]);

  const handleSelectSlot = useCallback(
    slotId => {
      closeSlotPicker();
      if (!user?.id || !myHero?.id) return;
      if (slotPicker.kind === 'create') {
        updateRooms(prev => {
          const base = cloneRooms(prev).map(room => ({
            ...room,
            slots: room.slots.map(slot =>
              slot.occupant?.userId === user.id ? { ...slot, occupant: null } : slot
            ),
          }));
          const codes = base.map(room => room.code);
          const roomId = `casual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const newRoom = {
            id: roomId,
            code: generateCode(codes),
            name: `${game?.name || '사설 방'} 팀`,
            createdAt: Date.now(),
            hostId: user.id,
            slots: slotTemplates.map(template => {
              if (template.id === slotId) {
                return {
                  ...template,
                  occupant: makeOccupant({ user, hero: myHero, isHost: true }),
                };
              }
              return { ...template, occupant: null };
            }),
          };
          return [...base, newRoom];
        });
        return;
      }

      if (slotPicker.kind === 'join') {
        updateRooms(prev => {
          const base = cloneRooms(prev).map(room => ({
            ...room,
            slots: room.slots.map(slot =>
              slot.occupant?.userId === user.id ? { ...slot, occupant: null } : slot
            ),
          }));
          return base.map(room => {
            if (room.id !== slotPicker.roomId) return room;
            return {
              ...room,
              slots: room.slots.map(slot => {
                if (slot.id !== slotId || slot.occupant) return slot;
                return {
                  ...slot,
                  occupant: makeOccupant({ user, hero: myHero, isHost: false }),
                };
              }),
            };
          });
        });
        return;
      }

      if (slotPicker.kind === 'switch') {
        if (!viewerRoom) return;
        updateRooms(prev =>
          prev.map(room => {
            if (room.id !== viewerRoom.id) return room;
            const currentSlot = room.slots.find(slot => slot.occupant?.userId === user.id);
            if (!currentSlot) return room;
            return {
              ...room,
              slots: room.slots.map(slot => {
                if (slot.id === currentSlot.id) {
                  return { ...slot, occupant: null };
                }
                if (slot.id === slotId && !slot.occupant) {
                  return {
                    ...slot,
                    occupant: { ...currentSlot.occupant, ready: false },
                  };
                }
                return slot;
              }),
            };
          })
        );
      }
    },
    [
      closeSlotPicker,
      game?.name,
      myHero,
      slotPicker.kind,
      slotPicker.roomId,
      slotTemplates,
      updateRooms,
      user,
      viewerRoom,
    ]
  );

  const slotPickerSlots = useMemo(() => {
    if (!slotPicker.open) return [];
    if (slotPicker.kind === 'create') {
      return slotTemplates;
    }
    if (slotPicker.kind === 'join') {
      const room = rooms.find(value => value.id === slotPicker.roomId);
      if (!room) return [];
      return room.slots.filter(slot => !slot.occupant);
    }
    if (slotPicker.kind === 'switch' && viewerRoom) {
      return viewerRoom.slots.filter(slot => !slot.occupant);
    }
    return [];
  }, [rooms, slotPicker.kind, slotPicker.open, slotPicker.roomId, slotTemplates, viewerRoom]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={handleExitClick}>
          ← 메인 룸으로 돌아가기
        </button>
        <div>
          <h1 className={styles.title}>캐주얼 사설 방</h1>
          <p className={styles.subtitle}>
            점수 제한 없이 활성화된 슬롯을 모두 채워야 시작할 수 있는 모드입니다.
          </p>
        </div>
      </header>

      {Array.isArray(roleOccupancy) && roleOccupancy.length ? (
        <section className={styles.card}>
          <RoleOccupancySummary occupancy={roleOccupancy} />
        </section>
      ) : null}

      {error ? <p className={styles.errorText}>{error}</p> : null}

      {!viewerRoom ? (
        <>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>새 방 만들기</h2>
            <p className={styles.sectionHint}>
              현재 선택된 캐릭터로 새로운 사설 방을 열고 원하는 슬롯에 배치하세요.
            </p>
            <button type="button" className={styles.primaryButton} onClick={handleCreateRoom}>
              방 만들기
            </button>
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>열린 방 목록</h2>
            {availableRooms.length === 0 ? (
              <p className={styles.emptyText}>
                참여 가능한 사설 방이 없습니다. 새로 만들어 보세요.
              </p>
            ) : (
              <ul className={styles.roomList}>
                {availableRooms.map(room => (
                  <li key={room.id} className={styles.roomItem}>
                    <div>
                      <p className={styles.roomName}>{room.name}</p>
                      <p className={styles.roomStatus}>{formatRoomStatus(room)}</p>
                      <p className={styles.roomMeta}>코드 {room.code}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleJoinRoom(room.id)}
                    >
                      방 참여
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section className={styles.card}>
          <header className={styles.roomHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{viewerRoom.name}</h2>
              <p className={styles.roomStatus}>{formatRoomStatus(viewerRoom)}</p>
              <p className={styles.roomMeta}>코드 {viewerRoom.code}</p>
            </div>
            <div className={styles.roomControls}>
              <button type="button" className={styles.secondaryButton} onClick={handleSwitchSlot}>
                슬롯 변경
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleLeaveRoom}>
                방 나가기
              </button>
            </div>
          </header>

          <div className={styles.slotGrid}>
            {viewerRoom.slots.map(slot => {
              const occupant = slot.occupant;
              const isViewer = occupant?.userId === user?.id;
              return (
                <div
                  key={slot.id}
                  className={`${styles.slotCard} ${occupant ? styles.slotFilled : styles.slotEmpty}`}
                >
                  <span className={styles.slotRole}>{slot.role}</span>
                  <span className={styles.slotLabel}>{formatMemberLabel(occupant)}</span>
                  {occupant ? (
                    <>
                      <span className={styles.slotStatus}>
                        {occupant.ready ? '준비 완료' : '대기 중'}
                      </span>
                      {occupant.isHost ? <span className={styles.slotBadge}>방장</span> : null}
                      {viewerRoom.hostId === user?.id && occupant.userId !== user?.id ? (
                        <button
                          type="button"
                          className={styles.kickButton}
                          onClick={() => handleKick(occupant.userId)}
                        >
                          추방
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span className={styles.slotStatus}>비어 있음</span>
                  )}
                  {occupant && isViewer ? (
                    <button
                      type="button"
                      className={styles.readyButton}
                      onClick={handleToggleReady}
                    >
                      {occupant.ready ? '준비 취소' : '준비 완료'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <footer className={styles.footer}>
            <p className={styles.footerHint}>
              모든 슬롯이 채워지고 모두 준비 상태가 되어야 전투를 시작할 수 있습니다.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleStart}
              disabled={!canStart}
            >
              게임 시작
            </button>
          </footer>
        </section>
      )}

      <SlotPicker
        open={slotPicker.open && slotPickerSlots.length > 0}
        title="참여할 슬롯을 선택하세요"
        slots={slotPickerSlots}
        onSelect={handleSelectSlot}
        onClose={closeSlotPicker}
      />
    </div>
  );
}
