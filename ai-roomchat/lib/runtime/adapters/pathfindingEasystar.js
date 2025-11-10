// Pathfinding (easystar.js) adapter (skeleton)

export async function createPathfinder(grid, acceptableTiles = [0]) {
  const EasyStar = await import('easystarjs').catch(() => null);
  const EasystarCtor = EasyStar && (EasyStar.js || EasyStar.default || EasyStar);
  if (!EasystarCtor) throw new Error('easystarjs not available');
  const es = new EasystarCtor();
  es.setGrid(grid);
  es.setAcceptableTiles(acceptableTiles);
  function findPath(startX, startY, endX, endY) {
    return new Promise((resolve) => {
      es.findPath(startX, startY, endX, endY, function(path){ resolve(path || []); });
      es.calculate();
    });
  }
  return { findPath };
}

