'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  DoorOpen,
  Gavel,
  History,
  LoaderCircle,
  LogOut,
  Play,
  Plus,
  RotateCcw,
  Spade,
  Trophy,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  calculateHandPoints,
  formatScore,
  roundLabel,
  type GameAction,
  type GameState,
} from '@/lib/game';

type User = { id: string; username: string };
type RoomMember = {
  userId: string;
  username: string;
  seat: number;
  ready: number;
};
type Room = {
  id: string;
  code: string;
  hostUserId: string;
  status: 'waiting' | 'playing' | 'finished';
  version: number;
  meId: string;
  members: RoomMember[];
  gameState: GameState | null;
};
type HistoryRow = {
  matchId: string;
  roomCode: string;
  finalScore: number;
  rank: number;
  uma: number;
  penalty: number;
  totalPt: number;
  createdAt: number;
};
type LeaderboardRow = {
  id: string;
  username: string;
  games: number;
  totalPt: number;
  avgPt: number;
  avgRank: number;
  firsts: number;
};
type Bootstrap = {
  user: User;
  activeRoom: { id: string } | null;
  history: HistoryRow[];
  leaderboard: LeaderboardRow[];
};
type ScoreMode = 'ron' | 'tsumo' | 'draw' | 'adjust';
type Tab = 'match' | 'history' | 'ranking';
type RankingMode = 'total' | 'average' | 'place';

const FU = [20, 25, 30, 40, 50, 60, 70];
const HAN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const WINDS = ['东', '南', '西', '北'];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : '网络连接失败';
    throw new Error(message);
  }
  return body as T;
}

function signed(value: number, suffix = '') {
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}${suffix}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto min-h-dvh w-full max-w-[560px] px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]">
        {children}
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(24_91_67/18%)]">
        <Spade className="size-5" />
      </span>
      <div>
        <p className="font-semibold tracking-tight">在线立直计分</p>
        <p className="text-[11px] text-muted-foreground">
          四人房间 · 只记分，不显示牌局
        </p>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ user: User }>('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      onLogin(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className="flex min-h-[calc(100dvh-52px)] flex-col">
        <Brand />
        <section className="my-auto py-12">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary">
            WELCOME
          </p>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.18] tracking-tight">
            输入名字，
            <br />
            一起开始记分。
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            无需密码。四人进入同一房间并准备后，即可共同记录荣和、自摸、流局与判罚。
          </p>
          <form className="mt-8 space-y-3" onSubmit={submit}>
            <label
              htmlFor="username"
              className="text-xs font-medium text-muted-foreground"
            >
              账户名
            </label>
            <Input
              id="username"
              autoComplete="nickname"
              maxLength={12}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="输入 1–12 个字符"
              className="h-12 rounded-2xl bg-card px-4 text-base shadow-sm"
            />
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <CircleAlert className="size-3.5" />
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              disabled={!username.trim() || busy}
            >
              {busy && <LoaderCircle className="animate-spin" />}进入计分大厅{' '}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </form>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
            账户名是公开昵称，不设密码，请勿用它保存敏感信息。
          </p>
        </section>
      </div>
    </Shell>
  );
}

function AppHeader({ user, logout }: { user: User; logout: () => void }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <Brand />
      <Button
        variant="ghost"
        className="rounded-xl px-2 text-xs text-muted-foreground"
        onClick={logout}
      >
        <UserRound />
        {user.username}
        <LogOut />
      </Button>
    </header>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </div>
  );
}

function Lobby({
  act,
  busy,
}: {
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [code, setCode] = useState('');
  return (
    <section>
      <div className="rounded-[28px] bg-primary p-6 text-primary-foreground shadow-[0_18px_45px_rgb(24_91_67/18%)]">
        <p className="text-xs font-medium opacity-70">新的一桌</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          四人准备，一起记分
        </h1>
        <p className="mt-2 text-sm leading-6 opacity-75">
          房间内任何玩家都能登记每局结果，所有人的分数会同步更新。
        </p>
        <Button
          className="mt-6 h-11 w-full rounded-2xl bg-white text-primary hover:bg-white/90"
          onClick={() => act({ action: 'create' })}
          disabled={busy}
        >
          <Plus />
          创建房间
        </Button>
      </div>
      <div className="mt-4 rounded-3xl border bg-card p-5">
        <p className="text-sm font-semibold">已有房间码</p>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            maxLength={6}
            onChange={(event) =>
              setCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              )
            }
            placeholder="输入 6 位房间码"
            className="h-11 rounded-xl uppercase tracking-[0.16em]"
          />
          <Button
            className="h-11 rounded-xl px-4"
            disabled={code.length !== 6 || busy}
            onClick={() => act({ action: 'join', code })}
          >
            加入
          </Button>
        </div>
      </div>
      <details className="mt-4 rounded-3xl border bg-card p-5 text-sm">
        <summary className="cursor-pointer font-semibold">
          本赛事计分规则
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          <p>
            原点／反点 25,000；每 1,000 点计 1 pt；位次分
            +30、+10、−10、−30。同分时平分位次分，座次顺序只决定下局座位。
          </p>
          <p>
            和牌点数采用标准日麻符番表：20／25／30／40／50／60／70
            符，以及满贯、跳满、倍满、三倍满、役满。
          </p>
          <p>
            诈和摊牌或诈立记 −20
            pt；误喊但未摊牌不扣总分，当局拒听拒胡。具体争议由场上选手协商。
          </p>
        </div>
      </details>
    </section>
  );
}

function WaitingRoom({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const me = room.members.find((member) => member.userId === room.meId);
  const allReady =
    room.members.length === 4 && room.members.every((member) => member.ready);
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <section>
      <div className="flex items-end justify-between rounded-3xl bg-primary px-5 py-4 text-primary-foreground">
        <div>
          <p className="text-[11px] opacity-70">房间码</p>
          <p className="mt-0.5 font-mono text-3xl font-semibold tracking-[0.2em]">
            {room.code}
          </p>
        </div>
        <Button
          onClick={copy}
          className="mb-1 rounded-xl bg-white/15 text-white hover:bg-white/25"
        >
          {copied ? <Check /> : <Copy />}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((seat) => {
          const member = room.members.find((item) => item.seat === seat);
          return (
            <div
              key={seat}
              className={`min-h-28 rounded-2xl border p-4 ${member?.ready ? 'border-primary/30 bg-success-soft' : 'bg-card'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {WINDS[seat]}家
                </span>
                {member?.ready && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    已准备
                  </span>
                )}
              </div>
              {member ? (
                <>
                  <p className="mt-5 truncate font-semibold">
                    {member.username}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {member.userId === room.hostUserId
                      ? '房主'
                      : member.userId === room.meId
                        ? '你'
                        : '玩家'}
                  </p>
                  {room.hostUserId === room.meId &&
                    member.userId !== room.meId && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-2"
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: 'kick',
                            roomId: room.id,
                            targetUserId: member.userId,
                          })
                        }
                      >
                        <UserMinus />
                        移出
                      </Button>
                    )}
                </>
              ) : (
                <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-4" />
                  等待加入
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-3xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">准备状态</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {room.members.length}/4 人已加入
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>{me?.ready ? '已准备' : '未准备'}</span>
            <Switch
              checked={Boolean(me?.ready)}
              onCheckedChange={(ready) =>
                act({ action: 'ready', roomId: room.id, ready })
              }
              disabled={busy}
            />
          </div>
        </div>
        {room.hostUserId === room.meId && (
          <Button
            className="mt-5 h-11 w-full rounded-2xl"
            disabled={!allReady || busy}
            onClick={() => act({ action: 'start', roomId: room.id })}
          >
            <Play />
            {allReady ? '开始记分' : '等待四家准备'}
          </Button>
        )}
        {room.hostUserId !== room.meId && (
          <p className="mt-5 rounded-xl bg-muted px-3 py-2.5 text-center text-xs text-muted-foreground">
            全员准备后，由房主开始
          </p>
        )}
        <Button
          variant="ghost"
          className="mt-2 w-full text-muted-foreground"
          disabled={busy}
          onClick={() => act({ action: 'leave', roomId: room.id })}
        >
          离开房间
        </Button>
      </div>
    </section>
  );
}

function PlayerGrid({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const game = room.gameState!;
  return (
    <div className="grid grid-cols-2 gap-2">
      {game.players.map((player) => {
        const wind = WINDS[(player.seat - game.dealerIndex + 4) % 4];
        const riichi = game.riichiIds.includes(player.userId);
        const barred = game.barredIds.includes(player.userId);
        return (
          <div
            key={player.userId}
            className={`rounded-2xl border bg-card p-3.5 ${player.seat === game.dealerIndex ? 'border-primary/50' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{player.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {wind}家{player.seat === game.dealerIndex ? ' · 庄' : ''}
                  {barred ? ' · 本局禁和' : ''}
                </p>
              </div>
              {riichi && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                  立直
                </span>
              )}
            </div>
            <p className="mt-3 font-mono text-xl font-semibold tracking-tight">
              {formatScore(player.score)}
            </p>
            <div className="mt-2 flex items-end justify-between">
              <span
                className={`text-[10px] ${player.penalty < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {player.penalty ? `${player.penalty} pt 判罚` : ' '}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={busy || riichi || barred || player.score < 1000}
                onClick={() =>
                  act({
                    action: 'score',
                    roomId: room.id,
                    version: room.version,
                    gameAction: { type: 'riichi', userId: player.userId },
                  })
                }
              >
                立直
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScorePanel({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const game = room.gameState!;
  const [mode, setMode] = useState<ScoreMode>('ron');
  const [winnerId, setWinnerId] = useState(game.players[0]?.userId || '');
  const [loserId, setLoserId] = useState(game.players[1]?.userId || '');
  const [han, setHan] = useState(3);
  const [fu, setFu] = useState(30);
  const [entryMode, setEntryMode] = useState<'calculate' | 'manual'>(
    'calculate',
  );
  const [manualRon, setManualRon] = useState('');
  const [manualChild, setManualChild] = useState('');
  const [manualDealer, setManualDealer] = useState('');
  const [tenpaiIds, setTenpaiIds] = useState<string[]>([]);
  const [adjustId, setAdjustId] = useState(game.players[0]?.userId || '');
  const [adjustPoints, setAdjustPoints] = useState('');
  const winner =
    game.players.find((player) => player.userId === winnerId) ||
    game.players[0];
  const dealer = game.players.find(
    (player) => player.seat === game.dealerIndex,
  );
  const dealerWin = winner?.seat === game.dealerIndex;
  const drawRepeats = Boolean(dealer && tenpaiIds.includes(dealer.userId));
  const effectiveFu = han >= 5 ? 30 : fu;
  const points = useMemo(
    () =>
      calculateHandPoints({
        han,
        fu: effectiveFu,
        dealer: winner?.seat === game.dealerIndex,
      }),
    [han, effectiveFu, winner?.seat, game.dealerIndex],
  );
  const invalid =
    han < 5 &&
    ((mode === 'ron' && fu === 20) || (han === 1 && (fu === 20 || fu === 25)));

  function chooseWinner(userId: string) {
    setWinnerId(userId);
    if (userId === loserId)
      setLoserId(
        game.players.find((player) => player.userId !== userId)?.userId || '',
      );
  }

  function recordHand() {
    let gameAction: GameAction;
    if (mode === 'ron')
      gameAction = {
        type: 'ron',
        winnerId,
        loserId,
        han,
        fu: effectiveFu,
        repeatDealer: dealerWin,
        ...(entryMode === 'manual' ? { manualPoints: Number(manualRon) } : {}),
      };
    else if (mode === 'tsumo')
      gameAction = {
        type: 'tsumo',
        winnerId,
        han,
        fu: effectiveFu,
        repeatDealer: dealerWin,
        ...(entryMode === 'manual'
          ? {
              manualChildPoints: Number(manualChild),
              manualDealerPoints: dealerWin
                ? Number(manualChild)
                : Number(manualDealer),
            }
          : {}),
      };
    else if (mode === 'draw')
      gameAction = {
        type: 'draw',
        tenpaiIds,
        repeatDealer: drawRepeats,
      };
    else
      gameAction = {
        type: 'adjust',
        userId: adjustId,
        points: Number(adjustPoints),
      };
    void act({
      action: 'score',
      roomId: room.id,
      version: room.version,
      gameAction,
    });
  }
  const validManualPoint = (value: string) =>
    Number(value) > 0 && Number(value) % 100 === 0;
  const manualScoreValid =
    mode === 'ron'
      ? validManualPoint(manualRon)
      : validManualPoint(manualChild) &&
        (dealerWin || validManualPoint(manualDealer));
  const canSubmit =
    mode === 'adjust'
      ? Number(adjustPoints) !== 0
      : mode === 'draw'
        ? true
        : Boolean(winnerId) &&
          (entryMode === 'manual' ? manualScoreValid : !invalid) &&
          (mode !== 'ron' || winnerId !== loserId);
  const baseRon = entryMode === 'manual' ? Number(manualRon) : points.ron;
  const baseChild =
    entryMode === 'manual'
      ? Number(manualChild)
      : dealerWin
        ? points.tsumoDealer
        : points.tsumoChild;
  const baseDealer =
    entryMode === 'manual' ? Number(manualDealer) : points.tsumoDealer;
  const preview =
    entryMode === 'manual'
      ? '手动输入'
      : points.limit || `${points.fu}符 ${points.han}番`;
  const ronPayment = baseRon + game.honba * 300;
  const childPayment = baseChild + game.honba * 100;
  const dealerPayment = baseDealer + game.honba * 100;
  const pay = dealerWin
    ? `${formatScore(childPayment)} all`
    : `${formatScore(childPayment)} / ${formatScore(dealerPayment)}`;

  return (
    <div className="mt-4 rounded-3xl border bg-card p-4">
      <div className="grid grid-cols-4 rounded-xl bg-muted p-1">
        {(
          [
            ['ron', '荣和'],
            ['tsumo', '自摸'],
            ['draw', '流局'],
            ['adjust', '修正'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`h-9 rounded-lg text-xs font-medium transition ${mode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {(mode === 'ron' || mode === 'tsumo') && (
        <div className="mt-4 space-y-4">
          <div
            className={`grid gap-2 ${mode === 'ron' ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            <label className="text-[11px] text-muted-foreground">
              和牌者
              <select
                value={winnerId}
                onChange={(event) => chooseWinner(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground"
              >
                {game.players
                  .filter((player) => !game.barredIds.includes(player.userId))
                  .map((player) => (
                    <option key={player.userId} value={player.userId}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
            {mode === 'ron' && (
              <label className="text-[11px] text-muted-foreground">
                放铳者
                <select
                  value={loserId}
                  onChange={(event) => setLoserId(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground"
                >
                  {game.players
                    .filter((player) => player.userId !== winnerId)
                    .map((player) => (
                      <option key={player.userId} value={player.userId}>
                        {player.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
            {(
              [
                ['calculate', '按符番计算'],
                ['manual', '直接输入点数'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setEntryMode(value)}
                className={`h-9 rounded-lg text-xs font-medium transition ${entryMode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {entryMode === 'calculate' ? (
            <>
              <div>
                <p className="mb-2 text-[11px] text-muted-foreground">番数</p>
                <div className="grid grid-cols-7 gap-1.5">
                  {HAN.map((value) => (
                    <button
                      key={value}
                      onClick={() => setHan(value)}
                      className={`h-9 rounded-lg border text-xs font-semibold ${han === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      {value === 13 ? '役满' : value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  符数 {han >= 5 && <span>· 满贯以上无需计符</span>}
                </p>
                <div className="grid grid-cols-7 gap-1.5">
                  {FU.map((value) => (
                    <button
                      key={value}
                      disabled={han >= 5}
                      onClick={() => setFu(value)}
                      className={`h-9 rounded-lg border text-xs font-semibold disabled:opacity-35 ${fu === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : mode === 'ron' ? (
            <label
              htmlFor="manual-ron"
              className="text-[11px] text-muted-foreground"
            >
              放铳支付点数（不含本场棒）
              <Input
                id="manual-ron"
                inputMode="numeric"
                value={manualRon}
                onChange={(event) => setManualRon(event.target.value)}
                placeholder="例如 7700"
                className="mt-1.5 h-11 rounded-xl text-base"
              />
            </label>
          ) : (
            <div className={`grid gap-2 ${dealerWin ? '' : 'grid-cols-2'}`}>
              <label
                htmlFor="manual-child"
                className="text-[11px] text-muted-foreground"
              >
                {dealerWin ? '每家支付点数' : '闲家支付点数'}（不含本场棒）
                <Input
                  id="manual-child"
                  inputMode="numeric"
                  value={manualChild}
                  onChange={(event) => setManualChild(event.target.value)}
                  placeholder={dealerWin ? '例如 2600' : '例如 1300'}
                  className="mt-1.5 h-11 rounded-xl text-base"
                />
              </label>
              {!dealerWin && (
                <label
                  htmlFor="manual-dealer"
                  className="text-[11px] text-muted-foreground"
                >
                  庄家支付点数（不含本场棒）
                  <Input
                    id="manual-dealer"
                    inputMode="numeric"
                    value={manualDealer}
                    onChange={(event) => setManualDealer(event.target.value)}
                    placeholder="例如 2600"
                    className="mt-1.5 h-11 rounded-xl text-base"
                  />
                </label>
              )}
            </div>
          )}
          {(entryMode === 'calculate' && invalid) ||
          (entryMode === 'manual' && !manualScoreValid) ? (
            <p className="text-xs text-destructive">
              {entryMode === 'manual'
                ? '请输入大于 0 的整百点。'
                : '当前符番组合不成立，请调整符数。'}
            </p>
          ) : (
            <div className="rounded-2xl bg-success-soft px-4 py-3">
              <div>
                <p className="text-[10px] text-muted-foreground">{preview}</p>
                <p className="mt-0.5 text-lg font-semibold text-primary">
                  {mode === 'ron' ? formatScore(ronPayment) : pay}
                </p>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                {game.honba} 本场已自动加算
                {game.sticks ? ` · ${game.sticks} 根立直棒归和牌者` : ''}
                {' · '}
                {dealerWin ? '庄家和牌，自动连庄' : '闲家和牌，自动轮庄'}
              </p>
            </div>
          )}
        </div>
      )}
      {mode === 'draw' && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            选择听牌玩家；0 家或 4 家时不发生点数移动。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {game.players.map((player) => {
              const checked = tenpaiIds.includes(player.userId);
              return (
                <button
                  key={player.userId}
                  onClick={() =>
                    setTenpaiIds(
                      checked
                        ? tenpaiIds.filter((id) => id !== player.userId)
                        : [...tenpaiIds, player.userId],
                    )
                  }
                  className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm ${checked ? 'border-primary bg-success-soft text-primary' : 'bg-background'}`}
                >
                  <span>{player.name}</span>
                  {checked && <Check className="size-4" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            流局后本场数自动 +1 ·{' '}
            <span className="font-medium text-foreground">
              {drawRepeats ? '庄家听牌，自动连庄' : '庄家未听，自动轮庄'}
            </span>
          </div>
        </div>
      )}
      {mode === 'adjust' && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            玩家
            <select
              value={adjustId}
              onChange={(event) => setAdjustId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm text-foreground"
            >
              {game.players.map((player) => (
                <option key={player.userId} value={player.userId}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <label
            htmlFor="adjust-points"
            className="text-[11px] text-muted-foreground"
          >
            点数（可填负数）
            <Input
              id="adjust-points"
              inputMode="numeric"
              value={adjustPoints}
              onChange={(event) => setAdjustPoints(event.target.value)}
              placeholder="如 -1000"
              className="mt-1.5 h-10 rounded-xl"
            />
          </label>
        </div>
      )}
      <Button
        onClick={recordHand}
        disabled={!canSubmit || busy}
        className="mt-4 h-11 w-full rounded-2xl"
      >
        {busy && <LoaderCircle className="animate-spin" />}
        {mode === 'adjust' ? '确认修正' : '记录本局'}
      </Button>
    </div>
  );
}

function Rulings({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const game = room.gameState!;
  const [userId, setUserId] = useState(game.players[0]?.userId || '');
  const rule = (ruling: 'false-win' | 'false-call' | 'false-riichi') =>
    act({
      action: 'score',
      roomId: room.id,
      version: room.version,
      gameAction: { type: 'ruling', userId, ruling },
    });
  return (
    <details className="mt-4 rounded-3xl border bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <Gavel className="size-4 text-primary" />
        判罚与撤销
      </summary>
      <div className="mt-4">
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
        >
          {game.players.map((player) => (
            <option key={player.userId} value={player.userId}>
              {player.name}
            </option>
          ))}
        </select>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => rule('false-win')}
          >
            诈和摊牌
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => rule('false-call')}
          >
            误喊未摊
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => rule('false-riichi')}
          >
            诈立
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full text-muted-foreground"
          disabled={busy || game.records.length === 0}
          onClick={() =>
            act({
              action: 'score',
              roomId: room.id,
              version: room.version,
              gameAction: { type: 'undo' },
            })
          }
        >
          <RotateCcw />
          撤销上一步
        </Button>
      </div>
    </details>
  );
}

function PlayingRoom({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const game = room.gameState!;
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {room.code} · {game.honba} 本场 · {game.sticks} 根立直棒
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{roundLabel(game)}</h1>
        </div>
        {room.hostUserId === room.meId && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => act({ action: 'finish', roomId: room.id })}
          >
            结束半庄
          </Button>
        )}
      </div>
      <PlayerGrid room={room} act={act} busy={busy} />
      <ScorePanel
        key={`${game.roundIndex}-${game.hand}-${game.records[0]?.id || 'start'}`}
        room={room}
        act={act}
        busy={busy}
      />
      <Rulings room={room} act={act} busy={busy} />
      {game.records.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            最近记录
          </p>
          <div className="space-y-2">
            {game.records.slice(0, 5).map((record) => (
              <div
                key={record.id}
                className="rounded-2xl border bg-card px-3 py-2.5"
              >
                <p className="text-xs font-medium">{record.label}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {record.round}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FinishedRoom({
  room,
  act,
  busy,
}: {
  room: Room;
  act: (action: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const results = room.gameState?.finishedResults || [];
  return (
    <section>
      <div className="rounded-[28px] bg-primary p-6 text-primary-foreground">
        <Trophy className="size-7" />
        <p className="mt-5 text-xs opacity-70">半庄结束</p>
        <h1 className="mt-1 text-2xl font-semibold">最终战绩</h1>
      </div>
      <div className="mt-4 space-y-2">
        {results.map((result) => (
          <div
            key={result.userId}
            className="flex items-center rounded-2xl border bg-card p-4"
          >
            <span className="w-10 text-lg font-semibold text-primary">
              {result.place}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {result.name}
                {result.tied ? ' · 同分' : ''}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatScore(result.score)} 点 · 位次分{' '}
                {signed(result.rankPoints)}
              </p>
            </div>
            <p
              className={`font-mono text-lg font-semibold ${result.totalPoints >= 0 ? 'text-primary' : 'text-destructive'}`}
            >
              {signed(result.totalPoints)}
            </p>
          </div>
        ))}
      </div>
      <Button
        className="mt-4 h-11 w-full rounded-2xl"
        disabled={busy}
        onClick={() => act({ action: 'leave', roomId: room.id })}
      >
        返回大厅
      </Button>
    </section>
  );
}

function HistoryView({ rows }: { rows: HistoryRow[] }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">历史战绩</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        最近 30 场正式结束的半庄
      </p>
      {rows.length ? (
        <div className="mt-5 space-y-2">
          {rows.map((row) => (
            <div
              key={row.matchId}
              className="flex items-center rounded-2xl border bg-card p-4"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-muted text-sm font-semibold">
                {row.rank}
              </span>
              <div className="ml-3 min-w-0 flex-1">
                <p className="text-sm font-semibold">房间 {row.roomCode}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString('zh-CN')} ·{' '}
                  {formatScore(row.finalScore)} 点
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-mono font-semibold ${row.totalPt >= 0 ? 'text-primary' : 'text-destructive'}`}
                >
                  {signed(row.totalPt)}
                </p>
                {row.penalty !== 0 && (
                  <p className="mt-1 text-[10px] text-destructive">
                    判罚 {row.penalty} pt
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={History}
          title="还没有历史战绩"
          text="完成第一场半庄后，成绩会自动保存在这里。"
        />
      )}
    </section>
  );
}

function RankingView({ rows }: { rows: LeaderboardRow[] }) {
  const [mode, setMode] = useState<RankingMode>('total');
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (mode === 'average')
          return b.avgPt - a.avgPt || b.totalPt - a.totalPt;
        if (mode === 'place')
          return (
            a.avgRank - b.avgRank || b.games - a.games || b.totalPt - a.totalPt
          );
        return b.totalPt - a.totalPt || b.avgPt - a.avgPt;
      }),
    [mode, rows],
  );
  const description =
    mode === 'total'
      ? '按累计 pt 从高到低排名'
      : mode === 'average'
        ? '按每场平均 pt 从高到低排名'
        : '按平均顺位从低到高排名';
  return (
    <section>
      <h1 className="text-2xl font-semibold">战绩排行</h1>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4 grid grid-cols-3 rounded-xl bg-muted p-1">
        {(
          [
            ['total', '累计 pt'],
            ['average', '平均 pt'],
            ['place', '平均顺位'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`h-9 rounded-lg text-xs font-medium transition ${mode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="mt-5 overflow-hidden rounded-3xl border bg-card">
          {sorted.map((row, index) => {
            const metric = mode === 'average' ? row.avgPt : row.totalPt;
            return (
              <div
                key={row.id}
                className="flex items-center border-b p-4 last:border-0"
              >
                <span
                  className={`grid size-9 place-items-center rounded-xl text-sm font-semibold ${index < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  {index + 1}
                </span>
                <div className="ml-3 min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.username}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {mode === 'total'
                      ? `${row.games} 场 · 场均 ${signed(row.avgPt)} · 平均顺位 ${row.avgRank.toFixed(2)}`
                      : mode === 'average'
                        ? `${row.games} 场 · 累计 ${signed(row.totalPt)} · 平均顺位 ${row.avgRank.toFixed(2)}`
                        : `${row.games} 场 · ${row.firsts} 次一位 · 场均 ${signed(row.avgPt)}`}
                  </p>
                </div>
                <p
                  className={`font-mono font-semibold ${mode === 'place' ? 'text-primary' : metric >= 0 ? 'text-primary' : 'text-destructive'}`}
                >
                  {mode === 'place' ? row.avgRank.toFixed(2) : signed(metric)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={BarChart3}
          title="排行榜等待开张"
          text="完成的半庄会自动计入累计排行榜。"
        />
      )}
    </section>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof History;
  title: string;
  text: string;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-dashed bg-card px-6 py-12 text-center">
      <Icon className="mx-auto size-6 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

function BottomNav({
  tab,
  setTab,
  disabled,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  disabled: boolean;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid h-16 max-w-[560px] grid-cols-3 px-4">
        {(
          [
            { value: 'match', label: '对局', icon: DoorOpen },
            { value: 'history', label: '战绩', icon: History },
            { value: 'ranking', label: '排行', icon: BarChart3 },
          ] as const
        ).map((item) => (
          <button
            key={item.value}
            disabled={disabled && item.value !== 'match'}
            onClick={() => setTab(item.value)}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] transition disabled:opacity-30 ${tab === item.value ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <item.icon className="size-5" />
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [tab, setTab] = useState<Tab>('match');
  const [error, setError] = useState('');

  const loadRoom = useCallback(async (roomId: string) => {
    const data = await api<{ room: Room }>(
      `/api/room?id=${encodeURIComponent(roomId)}`,
    );
    setRoom(data.room);
  }, []);
  const bootstrap = useCallback(async () => {
    try {
      const data = await api<Bootstrap>('/api/bootstrap');
      setUser(data.user);
      setHistory(data.history);
      setLeaderboard(data.leaderboard);
      if (data.activeRoom) await loadRoom(data.activeRoom.id);
      else setRoom(null);
    } catch {
      setUser(null);
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [loadRoom]);

  useEffect(() => {
    const timer = window.setTimeout(() => void bootstrap(), 0);
    return () => window.clearTimeout(timer);
  }, [bootstrap]);
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) return;
    const timer = window.setInterval(() => {
      loadRoom(roomId).catch((caught) => {
        if (
          caught instanceof Error &&
          caught.message.includes('房间不存在或你已离开')
        ) {
          setRoom(null);
          setError('你已被房主移出房间');
          void bootstrap();
        }
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [room?.id, loadRoom, bootstrap]);

  async function act(action: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const data = await api<{ room?: Room; ok?: boolean }>('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (data.room) setRoom(data.room);
      if (data.ok) {
        setRoom(null);
        setTab('match');
        await bootstrap();
      }
      if (action.action === 'finish') await bootstrap();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
      if (room) loadRoom(room.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/api/session', { method: 'DELETE' }).catch(() => undefined);
    setUser(null);
    setRoom(null);
    setTab('match');
  }
  if (loading)
    return (
      <Shell>
        <div className="grid min-h-[70dvh] place-items-center text-sm text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
      </Shell>
    );
  if (!user)
    return (
      <Login
        onLogin={(next) => {
          setUser(next);
          setLoading(true);
          void bootstrap();
        }}
      />
    );
  const locked = room?.status === 'playing';
  return (
    <Shell>
      <AppHeader user={user} logout={logout} />
      {error && <Notice text={error} />}
      {tab === 'match' &&
        (!room ? (
          <Lobby act={act} busy={busy} />
        ) : room.status === 'waiting' ? (
          <WaitingRoom room={room} act={act} busy={busy} />
        ) : room.status === 'playing' ? (
          <PlayingRoom room={room} act={act} busy={busy} />
        ) : (
          <FinishedRoom room={room} act={act} busy={busy} />
        ))}
      {tab === 'history' && <HistoryView rows={history} />}
      {tab === 'ranking' && <RankingView rows={leaderboard} />}
      <BottomNav tab={tab} setTab={setTab} disabled={Boolean(locked)} />
    </Shell>
  );
}
