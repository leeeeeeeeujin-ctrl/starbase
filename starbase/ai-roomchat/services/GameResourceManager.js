/**
 * 🎮 Game Resource Manager
 * 게임별 커스텀 리소스 및 데이터 통합 관리 시스템
 * - 캐릭터, 아이템, 배경, BGM, 스킬 등 모든 게임 에셋 관리
 * - AI가 쉽게 활용할 수 있는 구조화된 데이터 제공
 * - 실시간 리소스 변경 감지 및 컨텍스트 업데이트
 */

class GameResourceManager {
  constructor() {
    this.gameId = null;
    this.resources = {
      // 캐릭터 관련 리소스
      characters: new Map(),
      
      // 게임 환경 리소스
      backgrounds: new Map(),
      music: new Map(),
      sounds: new Map(),
      
      // 게임 오브젝트
      items: new Map(),
      weapons: new Map(),
      skills: new Map(),
      
      // 게임 시스템 데이터
      gameSettings: new Map(),
      levels: new Map(),
      quests: new Map(),
      
      // 커스텀 데이터 (게임별 특화)
      customData: new Map()
    };
    
    this.changeListeners = [];
    this.aiContextCache = null;
    this.lastUpdateTime = null;
    
    this.initializeDefaultResources();
  }
  
  /**
   * 기본 리소스 구조 초기화
   */
  initializeDefaultResources() {
    // 기본 캐릭터 템플릿
    this.defineResourceSchema('character', {
      id: 'string',
      name: 'string',
      description: 'string',
      image: 'string', // URL 또는 base64
      portrait: 'string', // 초상화 이미지
      
      // 기본 능력치
      stats: {
        hp: 'number',
        mp: 'number',
        attack: 'number', 
        defense: 'number',
        speed: 'number',
        intelligence: 'number'
      },
      
      // 스킬 슬롯
      skills: {
        skill1: 'object',
        skill2: 'object', 
        skill3: 'object',
        skill4: 'object',
        ultimate: 'object'
      },
      
      // 장비 슬롯
      equipment: {
        weapon: 'object',
        armor: 'object',
        accessory: 'object'
      },
      
      // 애니메이션/사운드
      animations: {
        idle: 'string',
        walk: 'string', 
        attack: 'string',
        skill: 'string',
        death: 'string'
      },
      
      voiceLines: {
        greeting: 'string',
        victory: 'string',
        defeat: 'string',
        skillCast: 'array'
      },
      
      // 게임별 커스텀 필드
      custom: 'object'
    });
    
    // 기본 스킬 템플릿  
    this.defineResourceSchema('skill', {
      id: 'string',
      name: 'string',
      description: 'string',
      icon: 'string',
      
      // 스킬 속성
      type: 'string', // 'attack', 'defense', 'support', 'ultimate'
      element: 'string', // 'fire', 'water', 'earth', 'air', 'dark', 'light'
      
      // 효과 수치
      damage: 'number',
      healAmount: 'number',
      buffDuration: 'number',
      cooldown: 'number',
      manaCost: 'number',
      
      // 시각/음향 효과
      animation: 'string',
      sound: 'string',
      particle: 'string',
      
      // AI 활용을 위한 태그
      aiTags: 'array', // ['offensive', 'aoe', 'instant', 'channeled']
      
      custom: 'object'
    });
    
    // 기본 아이템 템플릿
    this.defineResourceSchema('item', {
      id: 'string',
      name: 'string', 
      description: 'string',
      icon: 'string',
      
      type: 'string', // 'consumable', 'weapon', 'armor', 'quest', 'misc'
      rarity: 'string', // 'common', 'uncommon', 'rare', 'epic', 'legendary'
      
      // 아이템 효과
      effects: {
        statBonus: 'object',
        healing: 'number',
        buffs: 'array'  
      },
      
      // 경제 정보
      price: 'number',
      sellPrice: 'number',
      stackable: 'boolean',
      maxStack: 'number',
      
      custom: 'object'
    });
  }
  
  /**
   * 리소스 스키마 정의 (타입 체킹용)
   */
  defineResourceSchema(resourceType, schema) {
    this.resourceSchemas = this.resourceSchemas || {};
    this.resourceSchemas[resourceType] = schema;
  }
  
  /**
   * 게임 ID 설정 및 리소스 로드
   */
  async setGameId(gameId) {
    this.gameId = gameId;
    await this.loadGameResources(gameId);
    this.updateAIContext();
  }
  
  /**
   * 캐릭터 추가/수정
   */
  setCharacter(characterId, characterData) {
    const character = {
      id: characterId,
      name: characterData.name || '새로운 캐릭터',
      description: characterData.description || '',
      image: characterData.image || '/default-character.png',
      portrait: characterData.portrait || characterData.image,
      
      // 기본 능력치 (기본값 설정)
      stats: {
        hp: 100,
        mp: 50,
        attack: 10,
        defense: 5,
        speed: 8,
        intelligence: 7,
        ...characterData.stats
      },
      
      // 스킬 슬롯
      skills: {
        skill1: null,
        skill2: null, 
        skill3: null,
        skill4: null,
        ultimate: null,
        ...characterData.skills
      },
      
      // 장비
      equipment: {
        weapon: null,
        armor: null,
        accessory: null,
        ...characterData.equipment
      },
      
      // 애니메이션
      animations: {
        idle: characterData.animations?.idle || '/animations/idle.gif',
        walk: characterData.animations?.walk || '/animations/walk.gif',
        attack: characterData.animations?.attack || '/animations/attack.gif',
        skill: characterData.animations?.skill || '/animations/skill.gif',
        death: characterData.animations?.death || '/animations/death.gif'
      },
      
      // 보이스 라인
      voiceLines: {
        greeting: characterData.voiceLines?.greeting || '',
        victory: characterData.voiceLines?.victory || '',
        defeat: characterData.voiceLines?.defeat || '',
        skillCast: characterData.voiceLines?.skillCast || []
      },
      
      // 게임별 커스텀 데이터
      custom: characterData.custom || {},
      
      // 메타데이터
      createdAt: characterData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.resources.characters.set(characterId, character);
    this.notifyChange('character', characterId, character);
    this.updateAIContext();
    
    return character;
  }
  
  /**
   * 스킬 추가/수정
   */
  setSkill(skillId, skillData) {
    const skill = {
      id: skillId,
      name: skillData.name || '새로운 스킬',
      description: skillData.description || '',
      icon: skillData.icon || '/default-skill-icon.png',
      
      type: skillData.type || 'attack',
      element: skillData.element || 'neutral',
      
      damage: skillData.damage || 0,
      healAmount: skillData.healAmount || 0, 
      buffDuration: skillData.buffDuration || 0,
      cooldown: skillData.cooldown || 1,
      manaCost: skillData.manaCost || 10,
      
      animation: skillData.animation || '/effects/default-skill.gif',
      sound: skillData.sound || '/sounds/skill-cast.mp3',
      particle: skillData.particle || 'sparkle',
      
      aiTags: skillData.aiTags || ['basic'],
      
      custom: skillData.custom || {},
      createdAt: skillData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.resources.skills.set(skillId, skill);
    this.notifyChange('skill', skillId, skill);
    this.updateAIContext();
    
    return skill;
  }
  
  /**
   * 아이템 추가/수정  
   */
  setItem(itemId, itemData) {
    const item = {
      id: itemId,
      name: itemData.name || '새로운 아이템',
      description: itemData.description || '',
      icon: itemData.icon || '/default-item-icon.png',
      
      type: itemData.type || 'misc',
      rarity: itemData.rarity || 'common',
      
      effects: {
        statBonus: itemData.effects?.statBonus || {},
        healing: itemData.effects?.healing || 0,
        buffs: itemData.effects?.buffs || []
      },
      
      price: itemData.price || 10,
      sellPrice: itemData.sellPrice || Math.floor((itemData.price || 10) * 0.7),
      stackable: itemData.stackable !== false,
      maxStack: itemData.maxStack || 99,
      
      custom: itemData.custom || {},
      createdAt: itemData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.resources.items.set(itemId, item);
    this.notifyChange('item', itemId, item);
    this.updateAIContext();
    
    return item;
  }
  
  /**
   * 배경음악 추가
   */
  setMusic(musicId, musicData) {
    const music = {
      id: musicId,
      name: musicData.name || '새로운 BGM',
      file: musicData.file || '',
      loop: musicData.loop !== false,
      volume: musicData.volume || 0.5,
      fadeIn: musicData.fadeIn || 1000,
      fadeOut: musicData.fadeOut || 1000,
      tags: musicData.tags || [], // ['battle', 'peaceful', 'boss', 'victory']
      custom: musicData.custom || {}
    };
    
    this.resources.music.set(musicId, music);
    this.notifyChange('music', musicId, music);
    
    return music;
  }
  
  /**
   * 배경 이미지 추가
   */
  setBackground(backgroundId, backgroundData) {
    const background = {
      id: backgroundId,
      name: backgroundData.name || '새로운 배경',
      image: backgroundData.image || '',
      parallaxLayers: backgroundData.parallaxLayers || [],
      animations: backgroundData.animations || {},
      ambientSound: backgroundData.ambientSound || null,
      custom: backgroundData.custom || {}
    };
    
    this.resources.backgrounds.set(backgroundId, background);
    this.notifyChange('background', backgroundId, background);
    
    return background;
  }
  
  /**
   * 커스텀 데이터 설정 (게임별 특화 데이터)
   */
  setCustomData(key, value) {
    this.resources.customData.set(key, {
      value,
      timestamp: new Date().toISOString(),
      gameId: this.gameId
    });
    
    this.notifyChange('customData', key, value);
    this.updateAIContext();
  }
  
  /**
   * 리소스 조회 메서드들
   */
  getCharacter(characterId) {
    return this.resources.characters.get(characterId);
  }
  
  getAllCharacters() {
    return Array.from(this.resources.characters.values());
  }
  
  getSkill(skillId) {
    return this.resources.skills.get(skillId);
  }
  
  getAllSkills() {
    return Array.from(this.resources.skills.values());
  }
  
  getItem(itemId) {
    return this.resources.items.get(itemId);
  }
  
  getAllItems() {
    return Array.from(this.resources.items.values());
  }
  
  getMusic(musicId) {
    return this.resources.music.get(musicId);
  }
  
  getBackground(backgroundId) {
    return this.resources.backgrounds.get(backgroundId);
  }
  
  getCustomData(key) {
    return this.resources.customData.get(key)?.value;
  }
  
  /**
   * AI를 위한 통합 컨텍스트 생성
   */
  generateAIContext() {
    const context = {
      gameId: this.gameId,
      lastUpdate: new Date().toISOString(),
      
      // 리소스 요약
      summary: {
        characterCount: this.resources.characters.size,
        skillCount: this.resources.skills.size,
        itemCount: this.resources.items.size,
        musicCount: this.resources.music.size,
        backgroundCount: this.resources.backgrounds.size
      },
      
      // 전체 리소스 데이터
      characters: Object.fromEntries(this.resources.characters),
      skills: Object.fromEntries(this.resources.skills),
      items: Object.fromEntries(this.resources.items),
      music: Object.fromEntries(this.resources.music),
      backgrounds: Object.fromEntries(this.resources.backgrounds),
      customData: Object.fromEntries(this.resources.customData),
      
      // AI 활용을 위한 인덱스
      charactersByClass: this.indexCharactersByClass(),
      skillsByType: this.indexSkillsByType(),
      itemsByRarity: this.indexItemsByRarity(),
      
      // 추천 조합 (AI가 참고할 수 있는 패턴)
      recommendedCombos: this.generateRecommendedCombos()
    };
    
    this.aiContextCache = context;
    return context;
  }
  
  /**
   * 캐릭터를 클래스별로 분류
   */
  indexCharactersByClass() {
    const byClass = {};
    
    this.resources.characters.forEach(character => {
      const characterClass = character.custom?.class || 'warrior';
      if (!byClass[characterClass]) byClass[characterClass] = [];
      byClass[characterClass].push(character.id);
    });
    
    return byClass;
  }
  
  /**
   * 스킬을 타입별로 분류
   */
  indexSkillsByType() {
    const byType = {};
    
    this.resources.skills.forEach(skill => {
      if (!byType[skill.type]) byType[skill.type] = [];
      byType[skill.type].push(skill.id);
    });
    
    return byType;
  }
  
  /**
   * 아이템을 등급별로 분류
   */
  indexItemsByRarity() {
    const byRarity = {};
    
    this.resources.items.forEach(item => {
      if (!byRarity[item.rarity]) byRarity[item.rarity] = [];
      byRarity[item.rarity].push(item.id);
    });
    
    return byRarity;
  }
  
  /**
   * AI를 위한 추천 조합 생성
   */
  generateRecommendedCombos() {
    const combos = [];
    
    // 캐릭터-스킬 조합 분석
    this.resources.characters.forEach(character => {
      const characterSkills = Object.values(character.skills).filter(Boolean);
      if (characterSkills.length > 0) {
        combos.push({
          type: 'character-skills',
          character: character.id,
          skills: characterSkills.map(skill => skill.id || skill),
          synergy: this.calculateSkillSynergy(characterSkills)
        });
      }
    });
    
    return combos;
  }
  
  /**
   * 스킬 시너지 계산 (AI 추천용)
   */
  calculateSkillSynergy(skills) {
    // 간단한 시너지 계산 로직
    let synergy = 0;
    const elements = skills.map(skill => 
      typeof skill === 'object' ? skill.element : 
      this.resources.skills.get(skill)?.element
    ).filter(Boolean);
    
    // 같은 원소 보너스
    const elementCounts = {};
    elements.forEach(element => {
      elementCounts[element] = (elementCounts[element] || 0) + 1;
    });
    
    Object.values(elementCounts).forEach(count => {
      if (count >= 2) synergy += count * 10;
    });
    
    return synergy;
  }
  
  /**
   * 변경사항 알림
   */
  notifyChange(resourceType, resourceId, data) {
    this.lastUpdateTime = new Date().toISOString();
    
    const changeEvent = {
      type: 'resource-change',
      resourceType,
      resourceId,
      data,
      timestamp: this.lastUpdateTime,
      gameId: this.gameId
    };
    
    this.changeListeners.forEach(listener => {
      try {
        listener(changeEvent);
      } catch (error) {
        console.error('Resource change listener error:', error);
      }
    });
    
    // 자동 저장
    this.saveGameResources();
  }
  
  /**
   * AI 컨텍스트 업데이트
   */
  updateAIContext() {
    // 디바운스된 컨텍스트 업데이트
    clearTimeout(this.contextUpdateTimeout);
    this.contextUpdateTimeout = setTimeout(() => {
      this.generateAIContext();
      
      // GameContextManager에 알림
      if (window.gameContextManager) {
        window.gameContextManager.updateResourceContext(this.aiContextCache);
      }
    }, 100);
  }
  
  /**
   * 변경사항 리스너 등록
   */
  addChangeListener(listener) {
    this.changeListeners.push(listener);
    
    return () => {
      const index = this.changeListeners.indexOf(listener);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * 게임 리소스 저장
   */
  async saveGameResources() {
    if (!this.gameId) return;
    
    const resourceData = {
      gameId: this.gameId,
      resources: {
        characters: Object.fromEntries(this.resources.characters),
        skills: Object.fromEntries(this.resources.skills),
        items: Object.fromEntries(this.resources.items),
        music: Object.fromEntries(this.resources.music),
        backgrounds: Object.fromEntries(this.resources.backgrounds),
        customData: Object.fromEntries(this.resources.customData)
      },
      lastSaved: new Date().toISOString()
    };
    
    // localStorage에 저장
    const storageKey = `game-resources-${this.gameId}`;
    localStorage.setItem(storageKey, JSON.stringify(resourceData));
    
    // 서버에도 저장 (실제 환경에서)
    // await this.saveToServer(resourceData);
  }
  
  /**
   * 게임 리소스 로드
   */
  async loadGameResources(gameId) {
    const storageKey = `game-resources-${gameId}`;
    const savedData = localStorage.getItem(storageKey);
    
    if (savedData) {
      try {
        const resourceData = JSON.parse(savedData);
        
        // 리소스 복원
        if (resourceData.resources) {
          this.resources.characters = new Map(Object.entries(resourceData.resources.characters || {}));
          this.resources.skills = new Map(Object.entries(resourceData.resources.skills || {}));
          this.resources.items = new Map(Object.entries(resourceData.resources.items || {}));
          this.resources.music = new Map(Object.entries(resourceData.resources.music || {}));
          this.resources.backgrounds = new Map(Object.entries(resourceData.resources.backgrounds || {}));
          this.resources.customData = new Map(Object.entries(resourceData.resources.customData || {}));
        }
        
        console.log(`🎮 Loaded resources for game ${gameId}:`, this.getResourceSummary());
      } catch (error) {
        console.error('Failed to load game resources:', error);
      }
    }
  }
  
  /**
   * 리소스 요약 정보
   */
  getResourceSummary() {
    return {
      characters: this.resources.characters.size,
      skills: this.resources.skills.size,
      items: this.resources.items.size,
      music: this.resources.music.size,
      backgrounds: this.resources.backgrounds.size,
      customData: this.resources.customData.size
    };
  }
  
  /**
   * 리소스 검색
   */
  searchResources(query, resourceType = null) {
    const results = [];
    const searchLower = query.toLowerCase();
    
    const searchInResource = (resource, type) => {
      if (resourceType && type !== resourceType) return;
      
      const name = resource.name?.toLowerCase() || '';
      const description = resource.description?.toLowerCase() || '';
      
      if (name.includes(searchLower) || description.includes(searchLower)) {
        results.push({
          ...resource,
          resourceType: type,
          relevance: name.includes(searchLower) ? 100 : 50
        });
      }
    };
    
    this.resources.characters.forEach(char => searchInResource(char, 'character'));
    this.resources.skills.forEach(skill => searchInResource(skill, 'skill'));
    this.resources.items.forEach(item => searchInResource(item, 'item'));
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
  
  /**
   * 리소스 내보내기
   */
  exportResources() {
    return {
      gameId: this.gameId,
      exportDate: new Date().toISOString(),
      resources: {
        characters: Object.fromEntries(this.resources.characters),
        skills: Object.fromEntries(this.resources.skills),
        items: Object.fromEntries(this.resources.items),
        music: Object.fromEntries(this.resources.music),
        backgrounds: Object.fromEntries(this.resources.backgrounds),
        customData: Object.fromEntries(this.resources.customData)
      }
    };
  }
  
  /**
   * 리소스 가져오기
   */
  importResources(resourceData) {
    if (resourceData.resources) {
      Object.entries(resourceData.resources.characters || {}).forEach(([id, data]) => {
        this.setCharacter(id, data);
      });
      
      Object.entries(resourceData.resources.skills || {}).forEach(([id, data]) => {
        this.setSkill(id, data);
      });
      
      Object.entries(resourceData.resources.items || {}).forEach(([id, data]) => {
        this.setItem(id, data);
      });
      
      Object.entries(resourceData.resources.music || {}).forEach(([id, data]) => {
        this.setMusic(id, data);
      });
      
      Object.entries(resourceData.resources.backgrounds || {}).forEach(([id, data]) => {
        this.setBackground(id, data);
      });
      
      Object.entries(resourceData.resources.customData || {}).forEach(([key, data]) => {
        this.setCustomData(key, data.value);
      });
    }
    
    this.updateAIContext();
  }
}

// 전역 인스턴스 생성
if (typeof window !== 'undefined') {
  window.gameResourceManager = new GameResourceManager();
}

export default GameResourceManager;