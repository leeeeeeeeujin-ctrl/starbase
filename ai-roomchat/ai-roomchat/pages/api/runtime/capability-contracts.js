export default async function handler(req, res){
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).end('Method Not Allowed'); }
  try {
    const caps = [
      { key:'rendering', summary:'Canvas2D 기본, 선택적으로 PIXI/Three', apis:['renderer2d.attach','addRect','setText','addImage','addSpriteFrame','addSpriteAnim'] },
      { key:'input', summary:'키/패드/터치 액션/축 바인딩', files:['/game/input/actions.json'], apis:['onAction','onAxis'] },
      { key:'physics', summary:'AABB 충돌, 타일 충돌, 슬라이딩', apis:['addCollider','addColliders','queryOverlap','setCollisionGrid','slideBoxOnGrid'] },
      { key:'tilemap', summary:'그리드/Tiled JSON, 충돌/객체/비용', apis:['load','getGrid','getCostGrid','extractObjectColliders'] },
      { key:'pathfinding', summary:'그리드 BFS/EasyStar', apis:['setGrid','setOptions','findPath'] },
      { key:'networking', summary:'Socket.IO 룸/브로드캐스트(재연결/버퍼)', apis:['connect','on','publish','disconnect'] },
      { key:'state', summary:'variables.json 스냅샷', apis:['updateVariables'] },
      { key:'ui', summary:'UI 스키마 vstack/hstack/text/button/image/spacer/card/number/table/canvas' },
    ];
    return res.status(200).json({ version:1, capabilities: caps });
  } catch (e) {
    try { console.warn('[caps] error', e?.message||e); } catch {}
    return res.status(500).json({ error: 'caps-failed' });
  }
}

export const config = { runtime: 'nodejs' };

