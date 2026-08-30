'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, History, Minus, Plus, RotateCcw, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Mode = 'ron' | 'tsumo' | 'draw' | 'adjust';
type Player = { id: number; name: string; score: number; penalty: number };
type GameState = {
  players: Player[];
  roundIndex: number;
  hand: number;
  dealerIndex: number;
  honba: number;
  sticks: number;
  riichiIds: number[];
  barredIds: number[];
};
type RecordItem = {
  id: string;
  label: string;
  round: string;
  delta: number[];
  before: GameState;
};

const WINDS = ['东', '南', '西', '北'];
const RON_PRESETS = [1000, 2000, 3900, 5200, 8000, 12000];
const TSUMO_PRESETS = [[300, 500], [400, 700], [500, 1000], [700, 1300], [1000, 2000], [2000, 4000]];
const EMPTY_IDS: number[] = [];
const defaultGame: GameState = {
  players: [
    { id: 0, name: '玩家一', score: 25000, penalty: 0 },
    { id: 1, name: '玩家二', score: 25000, penalty: 0 },
    { id: 2, name: '玩家三', score: 25000, penalty: 0 },
    { id: 3, name: '玩家四', score: 25000, penalty: 0 },
  ],
  roundIndex: 0,
  hand: 1,
  dealerIndex: 0,
  honba: 0,
  sticks: 0,
  riichiIds: [],
  barredIds: [],
};

function cloneGame(game: GameState): GameState {
  return {
    ...game,
    players: game.players.map((player) => ({ ...player, penalty: player.penalty ?? 0 })),
    riichiIds: [...game.riichiIds],
    barredIds: [...(game.barredIds ?? [])],
  };
}

function roundLabel(game: GameState) {
  return `${WINDS[game.roundIndex % 4]}${game.hand}局`;
}

function nextHand(game: GameState) {
  const next = cloneGame(game);
  next.dealerIndex = (next.dealerIndex + 1) % 4;
  if (next.hand === 4) {
    next.hand = 1;
    next.roundIndex = (next.roundIndex + 1) % 4;
  } else {
    next.hand += 1;
  }
  return next;
}

function formatScore(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function Selector({ title, game, value, onChange, exclude, disabledIds = [] }: {
  title: string;
  game: GameState;
  value: number;
  onChange: (value: number) => void;
  exclude?: number;
  disabledIds?: number[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="grid grid-cols-4 gap-2">
        {game.players.map((player, index) => (
          <Button
            key={player.id}
            type="button"
            variant={value === index ? 'default' : 'outline'}
            className={cn('h-11 min-w-0 rounded-xl px-1 text-sm', value === index && 'shadow-sm')}
            disabled={index === exclude || disabledIds.includes(index)}
            onClick={() => onChange(index)}
            aria-pressed={value === index}
          >
            <span className="truncate">{player.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(defaultGame);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>('ron');
  const [winner, setWinner] = useState(0);
  const [loser, setLoser] = useState(1);
  const [ronPoints, setRonPoints] = useState(8000);
  const [tsumoIndex, setTsumoIndex] = useState(4);
  const [tenpai, setTenpai] = useState<number[]>([]);
  const [adjustPlayer, setAdjustPlayer] = useState(0);
  const [adjustPoints, setAdjustPoints] = useState('1000');
  const [repeatDealer, setRepeatDealer] = useState(true);
  const barredIds = game.barredIds ?? EMPTY_IDS;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('riichi-scoreboard');
      if (saved) {
        const parsed = JSON.parse(saved) as { game?: GameState; records?: RecordItem[] };
        if (parsed.game?.players?.length === 4) setGame(cloneGame(parsed.game));
        if (Array.isArray(parsed.records)) setRecords(parsed.records.slice(0, 20));
      }
    } catch {
      // A damaged local save should never block a new game.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem('riichi-scoreboard', JSON.stringify({ game, records }));
  }, [game, records, hydrated]);

  useEffect(() => {
    if (winner === loser) setLoser((winner + 1) % 4);
    if (barredIds.includes(winner)) {
      const available = game.players.findIndex((_, index) => !barredIds.includes(index));
      if (available >= 0) setWinner(available);
    }
    setRepeatDealer(winner === game.dealerIndex);
  }, [winner, game.dealerIndex, barredIds, game.players, loser]);

  const totalScore = useMemo(() => game.players.reduce((sum, player) => sum + player.score, 0), [game.players]);
  const standings = useMemo(() => {
    const sorted = game.players.map((player, seat) => ({ ...player, seat })).sort((a, b) => b.score - a.score || a.seat - b.seat);
    const uma = [30, 10, -10, -30];
    return sorted.map((player, order, all) => {
      const tied = all.filter((item) => item.score === player.score);
      const groupStart = all.findIndex((item) => item.score === player.score);
      const rankPoints = uma.slice(groupStart, groupStart + tied.length).reduce((sum, value) => sum + value, 0) / tied.length;
      const basePoints = (player.score - 25000) / 1000;
      return { ...player, order: order + 1, place: groupStart + 1, tied: tied.length > 1, basePoints, rankPoints, totalPoints: basePoints + rankPoints + player.penalty };
    });
  }, [game.players]);
  const seatWind = (index: number) => WINDS[(index - game.dealerIndex + 4) % 4];

  const commit = (next: GameState, label: string, before = game) => {
    const delta = next.players.map((player, index) => player.score - before.players[index].score);
    setRecords((current) => [{
      id: `${Date.now()}-${Math.random()}`,
      label,
      round: `${roundLabel(before)} · ${before.honba}本场`,
      delta,
      before: cloneGame(before),
    }, ...current].slice(0, 20));
    setGame(next);
  };

  const declareRiichi = (index: number) => {
    if (game.riichiIds.includes(index) || barredIds.includes(index) || game.players[index].score < 1000) return;
    const next = cloneGame(game);
    next.players[index].score -= 1000;
    next.sticks += 1;
    next.riichiIds.push(index);
    commit(next, `${next.players[index].name} 立直`);
  };

  const finishHand = (next: GameState, repeat: boolean, isDraw = false) => {
    next.riichiIds = [];
    next.barredIds = [];
    if (repeat) {
      next.honba += 1;
      return next;
    }
    const advanced = nextHand(next);
    advanced.honba = isDraw ? next.honba + 1 : 0;
    return advanced;
  };

  const settleRon = () => {
    if (winner === loser) return;
    const next = cloneGame(game);
    const payment = ronPoints + game.honba * 300;
    next.players[winner].score += payment + game.sticks * 1000;
    next.players[loser].score -= payment;
    next.sticks = 0;
    commit(finishHand(next, repeatDealer), `${game.players[winner].name} 荣和 ${formatScore(ronPoints)}`);
  };

  const settleTsumo = () => {
    const next = cloneGame(game);
    const dealerWin = winner === game.dealerIndex;
    const [childPay, dealerPay] = TSUMO_PRESETS[tsumoIndex];
    let received = game.sticks * 1000;
    next.players.forEach((player, index) => {
      if (index === winner) return;
      const base = dealerWin ? dealerPay : index === game.dealerIndex ? dealerPay : childPay;
      const payment = base + game.honba * 100;
      player.score -= payment;
      received += payment;
    });
    next.players[winner].score += received;
    next.sticks = 0;
    const pointsLabel = dealerWin ? `${formatScore(dealerPay)} 全员` : `${formatScore(childPay)} / ${formatScore(dealerPay)}`;
    commit(finishHand(next, repeatDealer), `${game.players[winner].name} 自摸 ${pointsLabel}`);
  };

  const settleDraw = () => {
    const next = cloneGame(game);
    const readyCount = tenpai.length;
    if (readyCount > 0 && readyCount < 4) {
      const receive = 3000 / readyCount;
      const pay = 3000 / (4 - readyCount);
      next.players.forEach((player, index) => { player.score += tenpai.includes(index) ? receive : -pay; });
    }
    const finished = finishHand(next, repeatDealer, true);
    commit(finished, readyCount ? `流局 · ${readyCount}家听牌` : '流局 · 全员未听');
    setTenpai([]);
  };

  const settleAdjust = () => {
    const points = Number(adjustPoints);
    if (!Number.isFinite(points) || points === 0) return;
    const next = cloneGame(game);
    next.players[adjustPlayer].score += points;
    commit(next, `${game.players[adjustPlayer].name} 修正 ${points > 0 ? '+' : ''}${formatScore(points)}`);
    setAdjustPoints('1000');
  };

  const undo = () => {
    const latest = records[0];
    if (!latest) return;
    setGame(cloneGame(latest.before));
    setRecords((current) => current.slice(1));
  };

  const resetGame = () => {
    if (!window.confirm('确定清空当前对局并重新开始吗？')) return;
    const names = game.players.map((player) => player.name);
    setGame({ ...cloneGame(defaultGame), players: defaultGame.players.map((player, index) => ({ ...player, name: names[index] })) });
    setRecords([]);
    setTenpai([]);
  };

  const applyRuling = (index: number, type: 'false-win' | 'false-call' | 'false-riichi') => {
    const next = cloneGame(game);
    next.barredIds = Array.from(new Set([...next.barredIds, index]));
    if (type !== 'false-call') next.players[index].penalty -= 20;
    if (type === 'false-riichi') {
      next.riichiIds.forEach((playerIndex) => { next.players[playerIndex].score += 1000; });
      next.sticks = 0;
      next.riichiIds = [];
    }
    const ruling = type === 'false-win' ? '诈和摊牌 · −20 pt' : type === 'false-call' ? '误喊未摊 · 本局禁和' : '诈立 · −20 pt并退回立直棒';
    commit(next, `${game.players[index].name} ${ruling}`);
  };

  const modes: { id: Mode; label: string }[] = [
    { id: 'ron', label: '荣和' }, { id: 'tsumo', label: '自摸' }, { id: 'draw', label: '流局' }, { id: 'adjust', label: '修正' },
  ];

  return (
    <main className="min-h-dvh bg-background pb-12 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[560px] items-center justify-between px-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[17px] font-semibold tracking-tight">立直计分</h1>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">半庄</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{roundLabel(game)} · {game.honba} 本场</p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-lg" aria-label="撤销上一步" disabled={!records.length} onClick={undo}><Undo2 /></Button>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="重新开始" onClick={resetGame}><RotateCcw /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] space-y-4 px-4 pt-4">
        <section aria-labelledby="score-heading">
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h2 id="score-heading" className="text-xs font-semibold tracking-wide text-muted-foreground">当前点数</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>供托 {game.sticks}</span><span className="h-3 w-px bg-border" />
              <span className={cn(totalScore !== 100000 - game.sticks * 1000 && 'font-semibold text-destructive')}>合计 {formatScore(totalScore + game.sticks * 1000)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {game.players.map((player, index) => {
              const isDealer = index === game.dealerIndex;
              const isRiichi = game.riichiIds.includes(index);
              return (
                <article key={player.id} className={cn('relative overflow-hidden rounded-2xl border bg-card p-3.5 shadow-[0_1px_0_rgb(20_42_34/3%)]', isDealer ? 'border-primary/35' : 'border-border')}>
                  {isDealer && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('grid size-6 shrink-0 place-items-center rounded-lg text-xs font-bold', isDealer ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>{seatWind(index)}</span>
                      <Input aria-label={`${seatWind(index)}家玩家名`} value={player.name} maxLength={8} onChange={(event) => {
                        const name = event.target.value;
                        setGame((current) => ({ ...current, players: current.players.map((item, playerIndex) => playerIndex === index ? { ...item, name } : item) }));
                      }} className="h-7 min-w-0 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0" />
                    </div>
                      <span className={cn('shrink-0 text-[10px] font-medium', barredIds.includes(index) ? 'text-destructive' : 'text-muted-foreground')}>{barredIds.includes(index) ? '本局禁和' : isDealer ? '亲家' : '子家'}</span>
                  </div>
                  <p className="mt-4 font-mono text-[24px] font-semibold leading-none tracking-tight tabular-nums">{formatScore(player.score)}</p>
                  <Button type="button" variant={isRiichi ? 'secondary' : 'ghost'} size="sm" className={cn('mt-3 h-8 w-full rounded-lg text-xs', !isRiichi && 'border border-dashed border-border text-muted-foreground')} disabled={isRiichi || barredIds.includes(index) || player.score < 1000} onClick={() => declareRiichi(index)}>
                    {isRiichi ? <><Check /> 已立直</> : '立直 −1,000'}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[22px] border border-border bg-card p-3.5" aria-labelledby="result-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="result-heading" className="text-sm font-semibold">赛事结算</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">原点 25,000 · 返还 25,000 · 1,000 点 = 1 pt</p>
            </div>
            <span className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">+30 / +10 / −10 / −30</span>
          </div>
          <ol className="mt-3 space-y-2">
            {standings.map((player) => (
              <li key={player.id} className="rounded-xl bg-secondary/60 p-3">
                <div className="flex items-center gap-3">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold', player.place === 1 ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
                    {player.place}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{player.name}</p>
                      {player.tied && <span className="text-[10px] text-muted-foreground">同分 · 次局顺位 {player.order}</span>}
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                      {player.basePoints >= 0 ? '+' : ''}{player.basePoints} 点差 · {player.rankPoints >= 0 ? '+' : ''}{player.rankPoints} 顺位
                      {player.penalty !== 0 && ` · ${player.penalty} 罚分`}
                    </p>
                  </div>
                  <p className={cn('font-mono text-lg font-semibold tabular-nums', player.totalPoints >= 0 ? 'text-success' : 'text-destructive')}>
                    {player.totalPoints >= 0 ? '+' : ''}{player.totalPoints}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">同分玩家平分对应顺位点；座次先后只用于确定下一局座位。</p>
        </section>

        <section className="rounded-[22px] border border-border bg-card p-3.5 shadow-[0_12px_36px_rgb(31_53_43/5%)]" aria-labelledby="entry-heading">
          <div className="flex items-center justify-between">
            <h2 id="entry-heading" className="text-sm font-semibold">记录本局</h2>
            <span className="text-xs text-muted-foreground">点数已自动保存</span>
          </div>
          <div className="mt-3 grid grid-cols-4 rounded-xl bg-secondary p-1" role="tablist" aria-label="本局结果">
            {modes.map((item) => (
              <Button key={item.id} type="button" role="tab" aria-selected={mode === item.id} variant="ghost" className={cn('h-9 rounded-lg text-xs text-muted-foreground hover:bg-transparent', mode === item.id && 'bg-card text-foreground shadow-sm hover:bg-card')} onClick={() => setMode(item.id)}>{item.label}</Button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {(mode === 'ron' || mode === 'tsumo') && <Selector title="和牌者" game={game} value={winner} onChange={setWinner} disabledIds={barredIds} />}
            {mode === 'ron' && <>
              <Selector title="放铳者" game={game} value={loser} onChange={setLoser} exclude={winner} />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">荣和点数</p>
                <div className="grid grid-cols-3 gap-2">
                  {RON_PRESETS.map((points) => <Button key={points} type="button" variant={ronPoints === points ? 'default' : 'outline'} className="h-10 rounded-xl font-mono text-sm tabular-nums" onClick={() => setRonPoints(points)} aria-pressed={ronPoints === points}>{formatScore(points)}</Button>)}
                </div>
              </div>
            </>}

            {mode === 'tsumo' && <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">每家支付 · 子 / 亲</p>
              <div className="grid grid-cols-3 gap-2">
                {TSUMO_PRESETS.map(([child, dealer], index) => <Button key={`${child}-${dealer}`} type="button" variant={tsumoIndex === index ? 'default' : 'outline'} className="h-10 rounded-xl font-mono text-xs tabular-nums" onClick={() => setTsumoIndex(index)} aria-pressed={tsumoIndex === index}>{winner === game.dealerIndex ? `${formatScore(dealer)} all` : `${formatScore(child)} / ${formatScore(dealer)}`}</Button>)}
              </div>
            </div>}

            {mode === 'draw' && <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">选择听牌者（自动结算 3,000 点）</p>
              <div className="grid grid-cols-2 gap-2">
                {game.players.map((player, index) => {
                  const active = tenpai.includes(index);
                  return <Button key={player.id} type="button" variant={active ? 'default' : 'outline'} disabled={barredIds.includes(index)} className="h-11 justify-between rounded-xl px-3" onClick={() => {
                    const next = active ? tenpai.filter((item) => item !== index) : [...tenpai, index];
                    setTenpai(next);
                    setRepeatDealer(next.includes(game.dealerIndex));
                  }} aria-pressed={active}><span className="truncate">{player.name}</span>{active && <Check />}</Button>;
                })}
              </div>
            </div>}

            {mode === 'adjust' && <>
              <Selector title="调整玩家" game={game} value={adjustPlayer} onChange={setAdjustPlayer} />
              <div>
                <label htmlFor="adjust-points" className="mb-2 block text-xs font-medium text-muted-foreground">增减点数（负数为扣分）</label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="icon-lg" className="h-11 w-11 rounded-xl" aria-label="切换正负" onClick={() => setAdjustPoints((value) => String(-Number(value || 0)))}><Minus /></Button>
                  <Input id="adjust-points" type="number" inputMode="numeric" step="100" value={adjustPoints} onChange={(event) => setAdjustPoints(event.target.value)} className="h-11 rounded-xl text-center font-mono tabular-nums" />
                  <Button type="button" variant="outline" size="icon-lg" className="h-11 w-11 rounded-xl" aria-label="增加一千点" onClick={() => setAdjustPoints((value) => String(Number(value || 0) + 1000))}><Plus /></Button>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">赛事判罚</p>
                <div className="grid gap-2">
                  <Button type="button" variant="destructive" className="h-10 justify-between rounded-xl" onClick={() => applyRuling(adjustPlayer, 'false-win')}><span>诈和且已摊牌</span><span>−20 pt · 本局禁和</span></Button>
                  <Button type="button" variant="outline" className="h-10 justify-between rounded-xl" onClick={() => applyRuling(adjustPlayer, 'false-call')}><span>误喊但未摊牌</span><span className="text-muted-foreground">本局禁和</span></Button>
                  <Button type="button" variant="destructive" className="h-10 justify-between rounded-xl" onClick={() => applyRuling(adjustPlayer, 'false-riichi')}><span>诈立并摊牌</span><span>−20 pt · 退棒</span></Button>
                </div>
              </div>
            </>}

            {mode !== 'adjust' && <div className="flex items-center justify-between rounded-xl bg-secondary/70 px-3 py-2.5">
              <div><p className="text-sm font-medium">亲家连庄</p><p className="text-[11px] text-muted-foreground">开启后本场数 +1</p></div>
              <Switch checked={repeatDealer} onCheckedChange={setRepeatDealer} aria-label="亲家连庄" />
            </div>}

            <Button type="button" size="lg" className="h-12 w-full rounded-xl text-[15px] font-semibold shadow-[0_8px_22px_rgb(24_91_67/18%)]" onClick={mode === 'ron' ? settleRon : mode === 'tsumo' ? settleTsumo : mode === 'draw' ? settleDraw : settleAdjust}>
              {mode === 'ron' && `记录荣和 · ${formatScore(ronPoints)}`}
              {mode === 'tsumo' && '记录自摸'}
              {mode === 'draw' && '记录流局'}
              {mode === 'adjust' && '确认修正'}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </section>

        <section className="rounded-[22px] border border-border bg-card p-3.5" aria-labelledby="history-heading">
          <div className="flex items-center justify-between">
            <h2 id="history-heading" className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted-foreground" />对局记录</h2>
            {records.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={undo}>撤销最近</Button>}
          </div>
          {records.length === 0 ? <div className="grid min-h-24 place-items-center text-center"><div><p className="text-sm text-muted-foreground">还没有记录</p><p className="mt-1 text-xs text-muted-foreground/70">本局结算后会显示在这里</p></div></div> : (
            <ol className="mt-2 divide-y divide-border">
              {records.slice(0, 6).map((record) => <li key={record.id} className="py-3 first:pt-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{record.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{record.round}</p></div>
                  <div className="flex shrink-0 gap-1.5 font-mono text-[10px] tabular-nums">
                    {record.delta.map((delta, index) => delta !== 0 ? <span key={index} className={cn('rounded-md px-1.5 py-1', delta > 0 ? 'bg-success-soft text-success' : 'bg-destructive/8 text-destructive')}>{delta > 0 ? '+' : ''}{formatScore(delta)}</span> : null)}
                  </div>
                </div>
              </li>)}
            </ol>
          )}
        </section>
        <details className="group rounded-[22px] border border-border bg-card p-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
            赛事规则与比赛精神
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs leading-6 text-muted-foreground">
            <p><strong className="text-foreground">比赛习惯：</strong>认真对待比赛，维护绿色比赛环境。原则上禁止小手反；选手有权知晓其他玩家的手摸切情况。</p>
            <p><strong className="text-foreground">诈和：</strong>喊和并摊牌，赛事总分罚 20 pt，且本局必须拒听、拒和，但可手切防守（立直除外）；喊和但未摊牌不罚总分，本局仍须拒听、拒和。</p>
            <p><strong className="text-foreground">诈立：</strong>摊牌后不记入本场，诈立者罚 20 pt，所有玩家立直棒退回；中途摊牌诈和按诈和方式处理。</p>
            <p><strong className="text-foreground">其他禁止行为：</strong>立直后换听、炸山、提前摸牌等。发声应迅速；进入下一位玩家回合后视作放弃动作，争议由场上选手协商。</p>
            <p><strong className="text-foreground">鸣牌时机：</strong>吃牌可以长考；非上家碰牌须立即喊出，不可因自身思考制止下一位玩家摸牌。</p>
          </div>
        </details>
        <p className="pb-[max(8px,env(safe-area-inset-bottom))] text-center text-[11px] leading-5 text-muted-foreground/70">荣和、自摸与流局会自动处理本场、供托和庄家轮转</p>
      </div>
    </main>
  );
}
