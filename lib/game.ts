export type GamePlayer = {
  userId: string;
  name: string;
  seat: number;
  score: number;
  penalty: number;
};

export type GameSnapshot = {
  players: GamePlayer[];
  roundIndex: number;
  hand: number;
  dealerIndex: number;
  honba: number;
  sticks: number;
  riichiIds: string[];
  barredIds: string[];
};

export type GameRecord = {
  id: string;
  label: string;
  round: string;
  delta: number[];
  before: GameSnapshot;
  actionType?: Exclude<GameAction['type'], 'undo'>;
  createdAt?: number;
  winnerId?: string;
  yakuman?: string[];
};

export type GameState = GameSnapshot & {
  records: GameRecord[];
  finishedResults?: Standing[];
};

export type Standing = GamePlayer & {
  order: number;
  place: number;
  tied: boolean;
  basePoints: number;
  rankPoints: number;
  totalPoints: number;
};

export type GameAction =
  | { type: 'riichi'; userId: string }
  | {
      type: 'ron';
      winnerId: string;
      loserId: string;
      han: number;
      fu: number;
      repeatDealer?: boolean;
      manualPoints?: number;
      yakuman?: string[];
    }
  | {
      type: 'tsumo';
      winnerId: string;
      han: number;
      fu: number;
      repeatDealer?: boolean;
      manualChildPoints?: number;
      manualDealerPoints?: number;
      yakuman?: string[];
    }
  | { type: 'draw'; tenpaiIds: string[]; repeatDealer?: boolean }
  | { type: 'adjust'; userId: string; points: number }
  | {
      type: 'ruling';
      userId: string;
      ruling: 'false-win' | 'false-call' | 'false-riichi';
    }
  | { type: 'undo' };

const WINDS = ['东', '南', '西', '北'];
const UMA = [30, 10, -10, -30];

export const YAKUMAN_NAMES = [
  '国士无双',
  '四暗刻',
  '大三元',
  '小四喜',
  '大四喜',
  '字一色',
  '绿一色',
  '清老头',
  '九莲宝灯',
  '四杠子',
  '天和',
  '地和',
  '累计役满',
] as const;

export function formatScore(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function roundLabel(game: Pick<GameState, 'roundIndex' | 'hand'>) {
  return `${WINDS[game.roundIndex % 4]}${game.hand}局`;
}

export function createGame(
  players: Array<{ userId: string; name: string; seat: number }>,
): GameState {
  return {
    players: [...players]
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({ ...player, score: 25000, penalty: 0 })),
    roundIndex: 0,
    hand: 1,
    dealerIndex: 0,
    honba: 0,
    sticks: 0,
    riichiIds: [],
    barredIds: [],
    records: [],
  };
}

function roundUp100(value: number) {
  return Math.ceil(value / 100) * 100;
}

function validateManualPayment(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0 || value % 100 !== 0)
    throw new Error('手动点数需为大于 0 的整百点');
  return Math.trunc(value);
}

export function calculateHandPoints({
  han,
  fu,
  dealer,
}: {
  han: number;
  fu: number;
  dealer: boolean;
}) {
  const safeHan = Math.max(1, Math.min(13, Math.trunc(han)));
  const safeFu = [20, 25, 30, 40, 50, 60, 70].includes(fu) ? fu : 30;
  let base = safeFu * 2 ** (safeHan + 2);
  let limit = '';

  if (safeHan >= 13) {
    base = 8000;
    limit = '役满';
  } else if (safeHan >= 11) {
    base = 6000;
    limit = '三倍满';
  } else if (safeHan >= 8) {
    base = 4000;
    limit = '倍满';
  } else if (safeHan >= 6) {
    base = 3000;
    limit = '跳满';
  } else if (safeHan >= 5 || base >= 2000) {
    base = 2000;
    limit = '满贯';
  }

  return {
    ron: roundUp100(base * (dealer ? 6 : 4)),
    tsumoChild: roundUp100(base * (dealer ? 2 : 1)),
    tsumoDealer: roundUp100(base * 2),
    limit,
    han: safeHan,
    fu: safeFu,
  };
}

export function calculateStandings(players: GamePlayer[]): Standing[] {
  const sorted = players
    .map((player) => ({ ...player }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  return sorted.map((player, order, all) => {
    const tied = all.filter((item) => item.score === player.score);
    const groupStart = all.findIndex((item) => item.score === player.score);
    const rankPoints =
      UMA.slice(groupStart, groupStart + tied.length).reduce(
        (sum, value) => sum + value,
        0,
      ) / tied.length;
    const basePoints = (player.score - 25000) / 1000;
    return {
      ...player,
      order: order + 1,
      place: groupStart + 1,
      tied: tied.length > 1,
      basePoints,
      rankPoints,
      totalPoints: basePoints + rankPoints + player.penalty,
    };
  });
}

function snapshot(game: GameState): GameSnapshot {
  return {
    players: game.players.map((player) => ({ ...player })),
    roundIndex: game.roundIndex,
    hand: game.hand,
    dealerIndex: game.dealerIndex,
    honba: game.honba,
    sticks: game.sticks,
    riichiIds: [...game.riichiIds],
    barredIds: [...game.barredIds],
  };
}

function advance(game: GameState) {
  game.dealerIndex = (game.dealerIndex + 1) % 4;
  if (game.hand === 4) {
    game.hand = 1;
    game.roundIndex = (game.roundIndex + 1) % 4;
  } else game.hand += 1;
}

function finishHand(game: GameState, repeatDealer: boolean, draw = false) {
  game.riichiIds = [];
  game.barredIds = [];
  if (repeatDealer) game.honba += 1;
  else {
    advance(game);
    game.honba = draw ? game.honba + 1 : 0;
  }
}

function commit(
  game: GameState,
  before: GameSnapshot,
  label: string,
  actionType: Exclude<GameAction['type'], 'undo'>,
  metadata?: Pick<GameRecord, 'winnerId' | 'yakuman'>,
) {
  const delta = game.players.map(
    (player, index) => player.score - before.players[index].score,
  );
  game.records = [
    {
      id: crypto.randomUUID(),
      label,
      round: `${roundLabel(before)} · ${before.honba}本场`,
      delta,
      before,
      actionType,
      createdAt: Date.now(),
      ...metadata,
    },
    ...game.records,
  ];
}

function normalizeYakuman(names: string[] | undefined, han: number) {
  const selected = Array.from(
    new Set(
      (names ?? []).filter((name): name is (typeof YAKUMAN_NAMES)[number] =>
        (YAKUMAN_NAMES as readonly string[]).includes(name),
      ),
    ),
  );
  return selected.length ? selected : han >= 13 ? ['累计役满'] : [];
}

export function applyGameAction(
  source: GameState,
  action: GameAction,
): GameState {
  const game: GameState = JSON.parse(JSON.stringify(source));
  if (action.type === 'undo') {
    const latest = game.records[0];
    if (!latest) return game;
    return { ...latest.before, records: game.records.slice(1) };
  }

  const before = snapshot(game);
  const player = (userId: string) =>
    game.players.find((item) => item.userId === userId);

  if (action.type === 'riichi') {
    const target = player(action.userId);
    if (
      !target ||
      target.score < 1000 ||
      game.riichiIds.includes(target.userId) ||
      game.barredIds.includes(target.userId)
    )
      throw new Error('当前不能立直');
    target.score -= 1000;
    game.sticks += 1;
    game.riichiIds.push(target.userId);
    commit(game, before, `${target.name} 立直`, 'riichi');
    return game;
  }

  if (action.type === 'ron') {
    const winner = player(action.winnerId);
    const loser = player(action.loserId);
    if (
      !winner ||
      !loser ||
      winner.userId === loser.userId ||
      game.barredIds.includes(winner.userId)
    )
      throw new Error('和牌玩家无效');
    const dealer = winner.seat === game.dealerIndex;
    const points = calculateHandPoints({
      han: action.han,
      fu: action.fu,
      dealer,
    });
    const yakuman = normalizeYakuman(action.yakuman, action.han);
    const basePayment =
      action.manualPoints === undefined
        ? points.ron
        : validateManualPayment(action.manualPoints);
    const payment = basePayment + game.honba * 300;
    winner.score += payment + game.sticks * 1000;
    loser.score -= payment;
    game.sticks = 0;
    finishHand(game, dealer);
    commit(
      game,
      before,
      `${winner.name} 荣和 · ${yakuman.length ? yakuman.join('＋') : action.manualPoints === undefined ? points.limit || `${points.fu}符${points.han}番` : '手动输入'} · ${formatScore(basePayment)}`,
      'ron',
      { winnerId: winner.userId, yakuman },
    );
    return game;
  }

  if (action.type === 'tsumo') {
    const winner = player(action.winnerId);
    if (!winner || game.barredIds.includes(winner.userId))
      throw new Error('和牌玩家无效');
    const dealer = winner.seat === game.dealerIndex;
    const points = calculateHandPoints({
      han: action.han,
      fu: action.fu,
      dealer,
    });
    const yakuman = normalizeYakuman(action.yakuman, action.han);
    const manual = action.manualChildPoints !== undefined;
    const childBase = manual
      ? validateManualPayment(action.manualChildPoints)
      : dealer
        ? points.tsumoDealer
        : points.tsumoChild;
    const dealerBase = manual
      ? dealer
        ? childBase
        : validateManualPayment(action.manualDealerPoints)
      : points.tsumoDealer;
    let received = game.sticks * 1000;
    for (const other of game.players) {
      if (other.userId === winner.userId) continue;
      const base = dealer
        ? childBase
        : other.seat === game.dealerIndex
          ? dealerBase
          : childBase;
      const payment = base + game.honba * 100;
      other.score -= payment;
      received += payment;
    }
    winner.score += received;
    game.sticks = 0;
    finishHand(game, dealer);
    const share = dealer
      ? `${formatScore(childBase)} all`
      : `${formatScore(childBase)} / ${formatScore(dealerBase)}`;
    commit(
      game,
      before,
      `${winner.name} 自摸 · ${yakuman.length ? yakuman.join('＋') : manual ? '手动输入' : points.limit || `${points.fu}符${points.han}番`} · ${share}`,
      'tsumo',
      { winnerId: winner.userId, yakuman },
    );
    return game;
  }

  if (action.type === 'draw') {
    const ready = action.tenpaiIds.filter((id) => !game.barredIds.includes(id));
    if (ready.length > 0 && ready.length < 4) {
      const receive = 3000 / ready.length;
      const pay = 3000 / (4 - ready.length);
      for (const item of game.players)
        item.score += ready.includes(item.userId) ? receive : -pay;
    }
    const dealer = game.players.find((item) => item.seat === game.dealerIndex);
    finishHand(game, Boolean(dealer && ready.includes(dealer.userId)), true);
    commit(
      game,
      before,
      ready.length ? `流局 · ${ready.length}家听牌` : '流局 · 全员未听',
      'draw',
    );
    return game;
  }

  if (action.type === 'adjust') {
    const target = player(action.userId);
    if (!target || !Number.isFinite(action.points) || action.points === 0)
      throw new Error('修正点数无效');
    target.score += Math.trunc(action.points);
    commit(
      game,
      before,
      `${target.name} 修正 ${action.points > 0 ? '+' : ''}${formatScore(action.points)}`,
      'adjust',
    );
    return game;
  }

  const target = player(action.userId);
  if (!target) throw new Error('判罚玩家无效');
  game.barredIds = Array.from(new Set([...game.barredIds, target.userId]));
  if (action.ruling !== 'false-call') target.penalty -= 20;
  if (action.ruling === 'false-riichi') {
    for (const id of game.riichiIds) {
      const riichiPlayer = player(id);
      if (riichiPlayer) riichiPlayer.score += 1000;
    }
    game.sticks = 0;
    game.riichiIds = [];
  }
  const label =
    action.ruling === 'false-win'
      ? '诈和摊牌 · −20 pt'
      : action.ruling === 'false-call'
        ? '误喊未摊 · 本局禁和'
        : '诈立 · −20 pt并退棒';
  commit(game, before, `${target.name} ${label}`, 'ruling');
  return game;
}
