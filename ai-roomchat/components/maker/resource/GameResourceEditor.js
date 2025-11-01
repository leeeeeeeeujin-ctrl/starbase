/**
 * 🎨 Game Resource Editor
 * 게임 리소스를 시각적으로 편집하고 관리하는 통합 인터페이스
 */
import React, { useState, useEffect, useRef } from 'react';

const GameResourceEditor = ({ onClose, gameData, onGameUpdate, resourceManager }) => {
  const [activeTab, setActiveTab] = useState('characters');
  const [selectedResource, setSelectedResource] = useState(null);
  const [resources, setResources] = useState({
    characters: [],
    skills: [],
    items: [],
    music: [],
    backgrounds: [],
  });
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef(null);

  // 리소스 매니저 인스턴스 확보 (prop -> state -> window 순서)
  const [mgr, setMgr] = useState(null);
  const resourceMgr = resourceManager || mgr || (typeof window !== 'undefined' ? window.gameResourceManager : null);

  // 클라이언트에서 전역 매니저 없으면 동적 생성
  useEffect(() => {
    if (resourceManager) return; // 외부 주입됨
    if (typeof window === 'undefined') return;
    if (window.gameResourceManager) { setMgr(window.gameResourceManager); return; }
    let mounted = true;
    (async () => {
      try {
        const mod = await import('../../../services/GameResourceManager');
        const GRM = mod.default || mod;
        const inst = new GRM();
        window.gameResourceManager = inst;
        if (mounted) setMgr(inst);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [resourceManager]);

  useEffect(() => {
    if (resourceMgr) {
      // 게임 ID 설정
      if (gameData?.id) {
        resourceMgr.setGameId(gameData.id);
      }

      // 리소스 로드
      loadResources();

      // 변경사항 리스너 등록
      const unsubscribe = resourceMgr.addChangeListener(() => {
        loadResources();
      });

      return unsubscribe;
    }
  }, [resourceMgr, gameData?.id]);

  const loadResources = () => {
    if (!resourceMgr) return;

    setResources({
      characters: resourceMgr.getAllCharacters(),
      skills: resourceMgr.getAllSkills(),
      items: resourceMgr.getAllItems(),
      music: Array.from(resourceMgr.resources.music.values()),
      backgrounds: Array.from(resourceMgr.resources.backgrounds.values()),
    });
  };

  const handleCreateNew = () => {
    const newId = `${activeTab}_${Date.now()}`;
    let newResource = {};

    switch (activeTab) {
      case 'characters':
        newResource = resourceMgr.setCharacter(newId, {
          name: '새로운 캐릭터',
          description: '새롭게 만들어진 캐릭터입니다.',
          stats: { hp: 100, mp: 50, attack: 15, defense: 10, speed: 12, intelligence: 8 },
        });
        break;
      case 'skills':
        newResource = resourceMgr.setSkill(newId, {
          name: '새로운 스킬',
          description: '새로운 스킬입니다.',
          damage: 20,
          cooldown: 3,
          manaCost: 15,
        });
        break;
      case 'items':
        newResource = resourceMgr.setItem(newId, {
          name: '새로운 아이템',
          description: '새로운 아이템입니다.',
          type: 'consumable',
          effects: { healing: 50 },
        });
        break;
      case 'music':
        newResource = resourceMgr.setMusic(newId, {
          name: '새로운 BGM',
          tags: ['ambient'],
        });
        break;
      case 'backgrounds':
        newResource = resourceMgr.setBackground(newId, {
          name: '새로운 배경',
        });
        break;
    }

    setSelectedResource(newResource);
    setEditMode(true);
  };

  const handleSave = resourceData => {
    if (!resourceMgr || !selectedResource) return;

    const resourceId = selectedResource.id;

    switch (activeTab) {
      case 'characters':
        resourceMgr.setCharacter(resourceId, resourceData);
        break;
      case 'skills':
        resourceMgr.setSkill(resourceId, resourceData);
        break;
      case 'items':
        resourceMgr.setItem(resourceId, resourceData);
        break;
      case 'music':
        resourceMgr.setMusic(resourceId, resourceData);
        break;
      case 'backgrounds':
        resourceMgr.setBackground(resourceId, resourceData);
        break;
    }

    setEditMode(false);
    loadResources();
  };

  const handleDelete = resourceId => {
    if (!resourceMgr) return;

    if (confirm('정말로 이 리소스를 삭제하시겠습니까?')) {
      resourceMgr.resources[activeTab].delete(resourceId);
      resourceMgr.saveGameResources();
      loadResources();

      if (selectedResource?.id === resourceId) {
        setSelectedResource(null);
        setEditMode(false);
      }
    }
  };

  const handleImageUpload = (event, field) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        if (selectedResource) {
          const updatedResource = { ...selectedResource };
          if (field.includes('.')) {
            const [parent, child] = field.split('.');
            updatedResource[parent] = updatedResource[parent] || {};
            updatedResource[parent][child] = e.target.result;
          } else {
            updatedResource[field] = e.target.result;
          }
          setSelectedResource(updatedResource);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredResources =
    resources[activeTab]?.filter(
      resource =>
        resource.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  const tabs = [
    { id: 'characters', label: '캐릭터', icon: '👤' },
    { id: 'skills', label: '스킬', icon: '⚡' },
    { id: 'items', label: '아이템', icon: '🎒' },
    { id: 'music', label: 'BGM', icon: '🎵' },
    { id: 'backgrounds', label: '배경', icon: '🖼️' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.9)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '95%',
          maxWidth: '1400px',
          height: '90%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          borderRadius: 20,
          border: '2px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '20px 30px',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#ffffff',
              fontSize: 28,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 15,
            }}
          >
            🎮 게임 리소스 편집기
          </h2>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 10,
              color: '#ffffff',
              padding: '12px 20px',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            ✕ 닫기
          </button>
        </div>

        {/* 메인 컨텐츠 */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 사이드바 - 탭과 리소스 목록 */}
          <div
            style={{
              width: '400px',
              background: 'rgba(0,0,0,0.2)',
              borderRight: '2px solid rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* 탭 메뉴 */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedResource(null);
                    setEditMode(false);
                  }}
                  style={{
                    background:
                      activeTab === tab.id
                        ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)'
                        : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 10,
                    color: '#ffffff',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                    minWidth: 'auto',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* 검색 및 새로 만들기 */}
            <div style={{ padding: '20px 20px 10px' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
                <input
                  type="text"
                  placeholder="리소스 검색..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    color: '#ffffff',
                    padding: '10px 15px',
                    fontSize: 14,
                  }}
                />
              </div>

              <button
                onClick={handleCreateNew}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  border: 'none',
                  borderRadius: 10,
                  color: '#ffffff',
                  padding: '12px 20px',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                + 새로운 {tabs.find(t => t.id === activeTab)?.label} 만들기
              </button>
            </div>

            {/* 리소스 목록 */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '0 20px 20px',
              }}
            >
              {filteredResources.map(resource => (
                <div
                  key={resource.id}
                  onClick={() => {
                    setSelectedResource(resource);
                    setEditMode(false);
                  }}
                  style={{
                    background:
                      selectedResource?.id === resource.id
                        ? 'rgba(139, 92, 246, 0.2)'
                        : 'rgba(255,255,255,0.05)',
                    border:
                      selectedResource?.id === resource.id
                        ? '2px solid #8b5cf6'
                        : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    padding: 15,
                    marginBottom: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    {resource.image && (
                      <img
                        src={resource.image}
                        alt={resource.name}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          objectFit: 'cover',
                        }}
                        onError={e => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          margin: 0,
                          color: '#ffffff',
                          fontSize: 16,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {resource.name}
                      </h4>
                      <p
                        style={{
                          margin: 0,
                          color: '#cbd5e1',
                          fontSize: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {resource.description || 'No description'}
                      </p>
                    </div>
                  </div>

                  {/* 리소스 특화 정보 */}
                  {activeTab === 'characters' && resource.stats && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                    >
                      <span>HP:{resource.stats.hp}</span>
                      <span>ATK:{resource.stats.attack}</span>
                      <span>DEF:{resource.stats.defense}</span>
                    </div>
                  )}

                  {activeTab === 'skills' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                    >
                      <span>{resource.type}</span>
                      <span>DMG:{resource.damage}</span>
                      <span>MP:{resource.manaCost}</span>
                    </div>
                  )}

                  {activeTab === 'items' && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                    >
                      <span
                        style={{
                          background:
                            resource.rarity === 'legendary'
                              ? '#fbbf24'
                              : resource.rarity === 'epic'
                                ? '#a855f7'
                                : resource.rarity === 'rare'
                                  ? '#3b82f6'
                                  : '#6b7280',
                          color: '#ffffff',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {resource.rarity}
                      </span>
                      <span>{resource.type}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 메인 편집 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {selectedResource ? (
              <>
                {/* 리소스 헤더 */}
                <div
                  style={{
                    padding: 30,
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 20,
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: '#ffffff',
                        fontSize: 24,
                        fontWeight: 700,
                      }}
                    >
                      {selectedResource.name}
                    </h3>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => setEditMode(!editMode)}
                        style={{
                          background: editMode
                            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                            : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                          border: 'none',
                          borderRadius: 10,
                          color: '#ffffff',
                          padding: '12px 20px',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {editMode ? '✕ 취소' : '✏️ 편집'}
                      </button>

                      <button
                        onClick={() => handleDelete(selectedResource.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid #ef4444',
                          borderRadius: 10,
                          color: '#ef4444',
                          padding: '12px 20px',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      color: '#cbd5e1',
                      fontSize: 16,
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedResource.description}
                  </p>
                </div>

                {/* 리소스 편집 폼 */}
                <div
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: 30,
                  }}
                >
                  <ResourceEditForm
                    resource={selectedResource}
                    resourceType={activeTab}
                    editMode={editMode}
                    onSave={handleSave}
                    onImageUpload={handleImageUpload}
                    onFieldChange={(field, value) => {
                      const updated = { ...selectedResource };
                      if (field.includes('.')) {
                        const parts = field.split('.');
                        let current = updated;
                        for (let i = 0; i < parts.length - 1; i++) {
                          if (!current[parts[i]]) current[parts[i]] = {};
                          current = current[parts[i]];
                        }
                        current[parts[parts.length - 1]] = value;
                      } else {
                        updated[field] = value;
                      }
                      setSelectedResource(updated);
                    }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  fontSize: 18,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 48, marginBottom: 20 }}>
                    {tabs.find(t => t.id === activeTab)?.icon}
                  </div>
                  <p style={{ margin: 0 }}>
                    {tabs.find(t => t.id === activeTab)?.label}를 선택하여 편집하세요
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />
    </div>
  );
};

// 리소스별 편집 폼 컴포넌트
const ResourceEditForm = ({
  resource,
  resourceType,
  editMode,
  onSave,
  onImageUpload,
  onFieldChange,
}) => {
  const handleSubmit = e => {
    e.preventDefault();
    onSave(resource);
  };

  const renderField = (label, field, type = 'text', options = {}) => {
    const value = field.includes('.')
      ? field.split('.').reduce((obj, key) => obj?.[key], resource)
      : resource[field];

    return (
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: 'block',
            color: '#e2e8f0',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {label}
        </label>

        {type === 'textarea' ? (
          <textarea
            value={value || ''}
            onChange={e => onFieldChange(field, e.target.value)}
            disabled={!editMode}
            rows={options.rows || 3}
            style={{
              width: '100%',
              background: editMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              padding: '12px 15px',
              fontSize: 14,
              resize: 'vertical',
            }}
          />
        ) : type === 'number' ? (
          <input
            type="number"
            value={value || 0}
            onChange={e => onFieldChange(field, parseFloat(e.target.value) || 0)}
            disabled={!editMode}
            min={options.min || 0}
            max={options.max}
            step={options.step || 1}
            style={{
              width: '100%',
              background: editMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              padding: '12px 15px',
              fontSize: 14,
            }}
          />
        ) : type === 'select' ? (
          <select
            value={value || ''}
            onChange={e => onFieldChange(field, e.target.value)}
            disabled={!editMode}
            style={{
              width: '100%',
              background: editMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              padding: '12px 15px',
              fontSize: 14,
            }}
          >
            {options.options?.map(option => (
              <option key={option.value} value={option.value} style={{ color: '#000000' }}>
                {option.label}
              </option>
            ))}
          </select>
        ) : type === 'image' ? (
          <div>
            {value && (
              <img
                src={value}
                alt={label}
                style={{
                  width: 100,
                  height: 100,
                  objectFit: 'cover',
                  borderRadius: 8,
                  marginBottom: 10,
                  display: 'block',
                }}
              />
            )}
            {editMode && (
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = e => onImageUpload(e, field);
                  input.click();
                }}
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid #3b82f6',
                  borderRadius: 6,
                  color: '#3b82f6',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                📷 이미지 업로드
              </button>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={e => onFieldChange(field, e.target.value)}
            disabled={!editMode}
            style={{
              width: '100%',
              background: editMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#ffffff',
              padding: '12px 15px',
              fontSize: 14,
            }}
          />
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 공통 필드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}>
        {renderField('이름', 'name')}
        {renderField('설명', 'description', 'textarea')}
      </div>

      {/* 리소스별 특화 필드 */}
      {resourceType === 'characters' && (
        <>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}
          >
            {renderField('캐릭터 이미지', 'image', 'image')}
            {renderField('초상화', 'portrait', 'image')}
          </div>

          <h4 style={{ color: '#ffffff', fontSize: 18, fontWeight: 600, marginBottom: 15 }}>
            ⚔️ 기본 능력치
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 15,
              marginBottom: 30,
            }}
          >
            {renderField('체력 (HP)', 'stats.hp', 'number', { min: 1, max: 9999 })}
            {renderField('마나 (MP)', 'stats.mp', 'number', { min: 0, max: 9999 })}
            {renderField('공격력', 'stats.attack', 'number', { min: 1, max: 999 })}
            {renderField('방어력', 'stats.defense', 'number', { min: 0, max: 999 })}
            {renderField('속도', 'stats.speed', 'number', { min: 1, max: 999 })}
            {renderField('지능', 'stats.intelligence', 'number', { min: 1, max: 999 })}
          </div>
        </>
      )}

      {resourceType === 'skills' && (
        <>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}
          >
            {renderField('스킬 아이콘', 'icon', 'image')}
            {renderField('스킬 타입', 'type', 'select', {
              options: [
                { value: 'attack', label: '공격' },
                { value: 'defense', label: '방어' },
                { value: 'support', label: '지원' },
                { value: 'ultimate', label: '궁극기' },
              ],
            })}
          </div>

          <h4 style={{ color: '#ffffff', fontSize: 18, fontWeight: 600, marginBottom: 15 }}>
            ⚡ 스킬 효과
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 15,
              marginBottom: 30,
            }}
          >
            {renderField('피해량', 'damage', 'number', { min: 0, max: 9999 })}
            {renderField('치유량', 'healAmount', 'number', { min: 0, max: 9999 })}
            {renderField('쿨다운 (초)', 'cooldown', 'number', { min: 0.1, step: 0.1 })}
            {renderField('마나 소모', 'manaCost', 'number', { min: 0, max: 999 })}
            {renderField('버프 지속시간 (초)', 'buffDuration', 'number', { min: 0, step: 0.1 })}
          </div>
        </>
      )}

      {resourceType === 'items' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 20,
              marginBottom: 30,
            }}
          >
            {renderField('아이템 아이콘', 'icon', 'image')}
            {renderField('아이템 타입', 'type', 'select', {
              options: [
                { value: 'consumable', label: '소모품' },
                { value: 'weapon', label: '무기' },
                { value: 'armor', label: '방어구' },
                { value: 'quest', label: '퀘스트' },
                { value: 'misc', label: '기타' },
              ],
            })}
            {renderField('등급', 'rarity', 'select', {
              options: [
                { value: 'common', label: '일반' },
                { value: 'uncommon', label: '고급' },
                { value: 'rare', label: '희귀' },
                { value: 'epic', label: '영웅' },
                { value: 'legendary', label: '전설' },
              ],
            })}
          </div>

          <h4 style={{ color: '#ffffff', fontSize: 18, fontWeight: 600, marginBottom: 15 }}>
            💰 아이템 정보
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 15,
              marginBottom: 30,
            }}
          >
            {renderField('구매 가격', 'price', 'number', { min: 0 })}
            {renderField('판매 가격', 'sellPrice', 'number', { min: 0 })}
            {renderField('치유량', 'effects.healing', 'number', { min: 0 })}
          </div>
        </>
      )}

      {editMode && (
        <div
          style={{
            display: 'flex',
            gap: 15,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none',
              borderRadius: 10,
              color: '#ffffff',
              padding: '15px 30px',
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            💾 저장하기
          </button>
        </div>
      )}
    </form>
  );
};

export default GameResourceEditor;
