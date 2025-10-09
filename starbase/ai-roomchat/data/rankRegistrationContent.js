export const registrationOverviewCopy = {
  checklist: {
    title: '등록 체크리스트',
    items: [
      { id: 'cover-prep', text: '대표 이미지와 설명을 준비했나요?' },
      { id: 'realtime-choice', text: '실시간, 혹은 싱글 플레이 여부를 생각했나요?' },
      { id: 'prompt-set', text: '프롬프트 세트를 충분히 준비했나요?' },
      { id: 'role-naming', text: '역할 이름을 헷갈리진 않았나요?' },
    ],
  },
  guide: {
    title: '등록 가이드',
    description:
      '게임 소개 자료와 룰 구성을 마쳤다면 하단 카드에서 역할·슬롯·모드를 채운 뒤 등록 버튼을 눌러 주세요. 제작 중인 세트는 Maker에서, 캐릭터 정보는 로스터에서 언제든 보완할 수 있습니다.',
  },
}

export const brawlModeCopy = {
  title: '난입 허용',
  summary:
    '해당 옵션에 체크하면 전투 중 패배한 인원을 대체해 같은 역할군의 새 인원이 난입합니다. 승리해도 게임이 끝나지 않으며, 게임이 끝나는 조건, 즉 변수를 지정해야 합니다.',
  tooltip:
    '해당 옵션에 체크하면 전투 중 패배한 인원을 대체해 같은 역할군의 새 인원이 난입합니다. 승리해도 게임이 끝나지 않으며, 게임이 끝나는 조건, 즉 변수를 지정해야 합니다.',
  endCondition: {
    label: '게임 종료 조건 변수',
    placeholder: '예: remainingTeams <= 1',
    helper:
      '등록 폼의 끝에서 두 번째 줄에 위치한 변수 칸과 연결됩니다. 조건을 만족할 때까지 게임은 종료되지 않으며, 종료 시 승리 횟수에 따라 점수가 정산됩니다.',
  },
  offHint: '난입 허용을 끄면 패배한 참가자는 해당 경기 동안 재참여할 수 없습니다.',
}

export const realtimeModeCopy = {
  label: '실시간 매칭 모드',
  options: [
    { value: 'STANDARD', label: '실시간 (표준)' },
    { value: 'PULSE', label: 'Pulse 실시간 (역할 제한)' },
  ],
  helper: 'Pulse 실시간은 방장과 같은 역할군에 동시에 참여할 수 있는 인원을 제한합니다.',
}

export const imageFieldCopy = {
  label: '표지 이미지',
  fallback: '이미지를 선택하지 않으면 기본 배경이 사용됩니다.',
  previewLabel: '미리보기',
  sizeLimitNotice: '최대 3MB 이하의 PNG/JPEG/GIF를 권장합니다.',
  typeError: '이미지 파일만 업로드할 수 있습니다.',
  sizeError: '이미지 용량이 3MB를 초과했습니다. 압축 후 다시 시도해 주세요.',
}

export const rulesChecklistCopy = {
  toggles: [
    { key: 'nerf_insight', label: '통찰 너프' },
    { key: 'ban_kindness', label: '약자 배려 금지' },
    { key: 'nerf_peace', label: '평화 너프' },
    { key: 'nerf_ultimate_injection', label: '궁극적 승리/인젝션 너프' },
    { key: 'fair_power_balance', label: '공정한 파워밸런스' },
  ],
  charLimit: {
    label: 'AI가 응답할 문장 길이(글자수 기준, 0=미지정)',
  },
}
