'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  DoorOpen,
  Gavel,
  History,
  LoaderCircle,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Trophy,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  calculateHandPoints,
  calculateStandings,
  formatScore,
  roundLabel,
  YAKUMAN_NAMES,
  type GameAction,
  type GameRecord,
  type GameState,
} from '@/lib/game';
import type { SeasonInfo } from '@/lib/season';

type User = { id: string; username: string; isAdmin: boolean };
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
  dealerMode: 'system' | 'host';
  dealerUserId: string | null;
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
  seasonId: string;
  seasonLabel: string;
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
type YakumanLeaderboardRow = {
  id: string;
  username: string;
  total: number;
  latestAt: number;
  yakumans: Array<{ name: string; count: number }>;
};
type Bootstrap = {
  user: User;
  activeRoom: { id: string } | null;
  history: HistoryRow[];
  leaderboard: LeaderboardRow[];
  yakumanLeaderboard: YakumanLeaderboardRow[];
  currentSeason: SeasonInfo;
  seasons: SeasonInfo[];
};
type MatchDetail = {
  matchId: string;
  roomCode: string;
  startedAt: number;
  finishedAt: number;
  season: SeasonInfo | null;
  results: Array<{
    userId: string;
    username: string;
    finalScore: number;
    rank: number;
    uma: number;
    penalty: number;
    totalPt: number;
    seat: number | null;
  }>;
  records: GameRecord[];
  processLimited: boolean;
};
type AdminUserRow = {
  id: string;
  username: string;
  createdAt: number;
  lastSeenAt: number;
  games: number;
  inActiveRoom: boolean;
  isAdmin: boolean;
};
type AdminMatchRow = {
  matchId: string;
  roomCode: string;
  startedAt: number;
  finishedAt: number;
  playerCount: number;
  playerNames: string;
};
type AdminOverview = {
  users: AdminUserRow[];
  matches: AdminMatchRow[];
  currentSeason: SeasonInfo;
  seasons: SeasonInfo[];
  created?: boolean;
};
type DirectResultPlayer = {
  username: string;
  score: string;
  penalty: string;
};
type ScoreMode = 'ron' | 'tsumo' | 'draw' | 'adjust';
type Tab = 'match' | 'history' | 'ranking' | 'admin';
type RankingMode = 'total' | 'average' | 'place' | 'yakuman';

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

function formatSeasonRange(season: SeasonInfo) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  };
  const start = new Intl.DateTimeFormat('zh-CN', options).format(
    season.startAt,
  );
  if (season.endAt === null) return `${start}起 · 等待管理员设置结束日`;
  const end = new Intl.DateTimeFormat('zh-CN', options).format(
    season.endAt - 1,
  );
  return `${start}—${end}`;
}

function toShanghaiDateInput(timestamp: number | null) {
  if (timestamp === null) return '';
  const local = new Date(timestamp - 1 + 8 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
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
    <div className="flex items-center gap-3.5">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[20px] border border-primary/10 bg-[#eef5cc] shadow-[0_8px_24px_rgb(24_91_67/14%)]">
        <Image
          src="/ichihime.png"
          alt="雀魂角色一姬"
          width={56}
          height={56}
          priority
          className="size-full object-contain"
        />
      </span>
      <p className="text-2xl font-semibold tracking-tight">绝好调</p>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
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
        body: JSON.stringify({
          username,
          adminLogin: adminMode,
          ...(adminMode ? { adminPassword } : {}),
        }),
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
            {adminMode ? '管理者登录，' : '输入名字，'}
            <br />
            {adminMode ? '维护比赛记录。' : '一起开始记分。'}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            {adminMode
              ? '管理者可撤销错误战绩、删除账号，并查看必要的管理状态。'
              : '无需密码。四人进入同一房间并准备后，即可共同记录荣和、自摸、流局与判罚。'}
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
              placeholder={adminMode ? '输入管理员账号' : '输入 1–12 个字符'}
              className="h-12 rounded-2xl bg-card px-4 text-base shadow-sm"
            />
            {adminMode && (
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-muted-foreground"
              >
                管理密码
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="输入管理密码"
                  className="mt-2 h-12 rounded-2xl bg-card px-4 text-base shadow-sm"
                />
              </label>
            )}
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <CircleAlert className="size-3.5" />
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              disabled={
                !username.trim() || (adminMode && !adminPassword) || busy
              }
            >
              {busy && <LoaderCircle className="animate-spin" />}
              {adminMode ? '进入管理后台' : '进入计分大厅'}{' '}
              <ChevronRight data-icon="inline-end" />
            </Button>
          </form>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
            {adminMode
              ? '管理密码仅用于管理入口，请勿转发给其他玩家。'
              : '账户名是公开昵称，不设密码，请勿用它保存敏感信息。'}
          </p>
          <button
            type="button"
            className="mx-auto mt-3 block text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setAdminMode((current) => !current);
              setError('');
              setAdminPassword('');
            }}
          >
            {adminMode ? '返回普通玩家登录' : '管理者入口'}
          </button>
        </section>
      </div>
    </Shell>
  );
}

function AccountRenameDialog({
  user,
  onRenamed,
}: {
  user: User;
  onRenamed: (user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setUsername(user.username);
      setError('');
    }
  }

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ user: User }>('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      onRenamed(data.user);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '账户名修改失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="max-w-32 rounded-xl px-2 text-xs text-muted-foreground"
          />
        }
      >
        <UserRound />
        <span className="truncate">{user.username}</span>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>修改账户名</DialogTitle>
            <DialogDescription>
              历史战绩和排行榜会保留，并同步显示新名称。
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor="profile-username"
            className="mt-4 block text-xs font-medium text-muted-foreground"
          >
            新账户名
            <Input
              id="profile-username"
              autoComplete="nickname"
              maxLength={12}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 rounded-xl text-sm"
            />
          </label>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <CircleAlert className="size-3.5" />
              {error}
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            限 1–12 个中文、字母、数字、下划线或短横线。
          </p>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={busy || !username.trim() || username === user.username}
            >
              {busy && <LoaderCircle className="animate-spin" />}
              保存新名称
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AppHeader({
  user,
  logout,
  onRenamed,
}: {
  user: User;
  logout: () => void;
  onRenamed: (user: User) => void;
}) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <Brand />
      <div className="flex items-center gap-0.5">
        {user.isAdmin ? (
          <div className="flex max-w-32 items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <UserRound className="size-4 shrink-0" />
            <span className="truncate">{user.username}</span>
            <ShieldCheck className="size-4 shrink-0 text-primary" />
          </div>
        ) : (
          <AccountRenameDialog user={user} onRenamed={onRenamed} />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-xl text-muted-foreground"
          aria-label="退出登录"
          onClick={logout}
        >
          <LogOut />
        </Button>
      </div>
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
  const selectedDealer = room.members.find(
    (member) => member.userId === room.dealerUserId,
  );
  const canStart =
    allReady && (room.dealerMode === 'system' || Boolean(selectedDealer));
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
      <div className="mt-4 rounded-3xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">开局定庄与座次</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {room.dealerMode === 'system'
                ? '系统随机分配东、南、西、北；抽到东家的玩家坐庄。'
                : '房主指定东家与庄家，其余三家随机分配南、西、北。'}
            </p>
          </div>
          {room.hostUserId !== room.meId && (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              房主设置
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-xl bg-muted p-1">
          {(
            [
              ['system', '系统定庄'],
              ['host', '房主定庄'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              disabled={busy || room.hostUserId !== room.meId}
              onClick={() =>
                act({
                  action: 'dealer-mode',
                  roomId: room.id,
                  dealerMode: value,
                })
              }
              className={`h-9 rounded-lg text-xs font-medium transition disabled:cursor-default ${room.dealerMode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {room.dealerMode === 'host' && (
          <>
            <p className="mt-3 text-[11px] text-muted-foreground">
              选择本场东家／庄家
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {room.members.map((member) => {
                const selected = member.userId === room.dealerUserId;
                return (
                  <button
                    key={member.userId}
                    disabled={busy || room.hostUserId !== room.meId}
                    onClick={() =>
                      act({
                        action: 'choose-dealer',
                        roomId: room.id,
                        dealerUserId: member.userId,
                      })
                    }
                    className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                  >
                    <span className="block truncate text-xs font-semibold">
                      {member.username}
                    </span>
                    <span
                      className={`mt-1 block text-[9px] ${selected ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}
                    >
                      {selected ? '东家 · 庄家' : '待选择'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              指定或更换庄家后，全员需要重新确认准备。
            </p>
          </>
        )}
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
                  玩家 {seat + 1}
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
                    {member.userId === room.dealerUserId
                      ? '预定东家 · 庄家'
                      : member.userId === room.hostUserId
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
            disabled={!canStart || busy}
            onClick={() => act({ action: 'start', roomId: room.id })}
          >
            <Play />
            {!allReady
              ? '等待四家准备'
              : room.dealerMode === 'host' && !selectedDealer
                ? '请先指定东家'
                : '开始记分'}
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
  const [manualYakuman, setManualYakuman] = useState(false);
  const [selectedYakuman, setSelectedYakuman] = useState<string[]>([]);
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
  const yakumanEnabled =
    (entryMode === 'calculate' && han === 13) ||
    (entryMode === 'manual' && manualYakuman);
  const yakuman = yakumanEnabled ? selectedYakuman : [];

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
        yakuman,
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
        yakuman,
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
          (!yakumanEnabled || selectedYakuman.length > 0) &&
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
  const preview = yakuman.length
    ? yakuman.join('＋')
    : entryMode === 'manual'
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
          {entryMode === 'manual' && (
            <button
              type="button"
              onClick={() => setManualYakuman((value) => !value)}
              className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-xs font-medium ${manualYakuman ? 'border-primary bg-success-soft text-primary' : 'bg-background text-muted-foreground'}`}
            >
              <span>这次和牌记入役满榜</span>
              <span>{manualYakuman ? '已开启' : '未开启'}</span>
            </button>
          )}
          {yakumanEnabled && (
            <div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                选择和到的役满（可多选；多倍役满请直接输入点数）
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {YAKUMAN_NAMES.map((name) => {
                  const selected = selectedYakuman.includes(name);
                  return (
                    <button
                      type="button"
                      key={name}
                      onClick={() =>
                        setSelectedYakuman(
                          selected
                            ? selectedYakuman.filter((item) => item !== name)
                            : [...selectedYakuman, name],
                        )
                      }
                      className={`min-h-9 rounded-lg border px-1.5 py-1 text-[10px] font-medium ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {(entryMode === 'calculate' && invalid) ||
          (entryMode === 'manual' && !manualScoreValid) ? (
            <p className="text-xs text-destructive">
              {entryMode === 'manual'
                ? '请输入大于 0 的整百点。'
                : '当前符番组合不成立，请调整符数。'}
            </p>
          ) : yakumanEnabled && selectedYakuman.length === 0 ? (
            <p className="text-xs text-destructive">请至少选择一个役满名称。</p>
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

function MatchDetailSheet({ row }: { row: HistoryRow }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hands = useMemo(() => {
    const grouped: Array<{ round: string; records: GameRecord[] }> = [];
    for (const record of detail?.records ?? []) {
      const latest = grouped[grouped.length - 1];
      if (latest?.round === record.round) latest.records.push(record);
      else grouped.push({ round: record.round, records: [record] });
    }
    return grouped;
  }, [detail]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setDetail(
        await api<MatchDetail>(
          `/api/match?id=${encodeURIComponent(row.matchId)}`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '牌局详情加载失败');
    } finally {
      setLoading(false);
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next && !detail && !loading) void load();
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`查看房间 ${row.roomCode} 的牌局详情`}
            className="flex w-full items-center rounded-2xl border bg-card p-4 text-left transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-sm font-semibold">
          {row.rank}
        </span>
        <span className="ml-3 min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            房间 {row.roomCode}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {new Date(row.createdAt).toLocaleDateString('zh-CN')} ·{' '}
            {row.seasonLabel} · {formatScore(row.finalScore)} 点
          </span>
        </span>
        <span className="ml-2 text-right">
          <span
            className={`block font-mono font-semibold ${row.totalPt >= 0 ? 'text-primary' : 'text-destructive'}`}
          >
            {signed(row.totalPt)}
          </span>
          {row.penalty !== 0 && (
            <span className="mt-1 block text-xs text-destructive">
              判罚 {row.penalty} pt
            </span>
          )}
        </span>
        <ChevronRight className="ml-2 size-4 shrink-0 text-muted-foreground" />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-[560px] rounded-t-[28px]"
      >
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <SheetTitle>房间 {row.roomCode}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${new Date(detail.finishedAt).toLocaleString('zh-CN')} · ${detail.season?.label ?? '早期记录'}`
              : '正在读取牌局详情'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="grid min-h-56 place-items-center text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <CircleAlert className="mx-auto size-6 text-destructive" />
              <p className="mt-3 text-sm text-destructive">{error}</p>
              <Button className="mt-4" variant="outline" onClick={load}>
                重新加载
              </Button>
            </div>
          ) : detail ? (
            <div className="space-y-5 pt-4">
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">最终结果</h2>
                  <span className="text-xs text-muted-foreground">
                    {detail.season
                      ? formatSeasonRange(detail.season)
                      : '未归入赛季'}
                  </span>
                </div>
                <div className="mt-2 overflow-hidden rounded-2xl border bg-card">
                  {detail.results.map((result) => (
                    <div
                      key={result.userId}
                      className="flex items-center border-b px-3 py-3 last:border-0"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">
                        {result.rank}
                      </span>
                      <div className="ml-3 min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {result.seat === null ? '—' : WINDS[result.seat]} ·{' '}
                          {result.username}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatScore(result.finalScore)} 点 · 位次分{' '}
                          {signed(result.uma)}
                        </p>
                      </div>
                      <p
                        className={`font-mono text-sm font-semibold ${result.totalPt >= 0 ? 'text-primary' : 'text-destructive'}`}
                      >
                        {signed(result.totalPt)} pt
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">牌局过程</h2>
                  <span className="text-xs text-muted-foreground">
                    {hands.length} 局
                  </span>
                </div>
                {detail.records.length ? (
                  <div className="mt-2 space-y-2">
                    {detail.processLimited && (
                      <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                        这是一条旧记录，当时最多保留最近 30
                        条过程；新牌局会完整保存。
                      </p>
                    )}
                    {hands.map((hand, index) => {
                      const first = hand.records[0];
                      const changes = first.before.players
                        .map((player, playerIndex) => ({
                          player,
                          delta: hand.records.reduce(
                            (sum, record) =>
                              sum + (record.delta[playerIndex] ?? 0),
                            0,
                          ),
                        }))
                        .filter((item) => item.delta !== 0);
                      return (
                        <article
                          key={`${hand.round}-${first.id}`}
                          className="rounded-2xl border bg-card p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">
                                {hand.round}
                              </p>
                              <div className="mt-1 space-y-1">
                                {hand.records.map((record) => (
                                  <p
                                    key={record.id}
                                    className="text-sm font-semibold leading-5"
                                  >
                                    {record.label}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                          {changes.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t pt-3">
                              {changes.map(({ player, delta }) => (
                                <div
                                  key={player.userId}
                                  className="flex items-center justify-between gap-3 text-xs"
                                >
                                  <span className="min-w-0 truncate text-muted-foreground">
                                    {WINDS[player.seat]} · {player.name}
                                  </span>
                                  <span className="shrink-0 font-mono">
                                    {formatScore(player.score)} →{' '}
                                    {formatScore(player.score + delta)}{' '}
                                    <span
                                      className={
                                        delta > 0
                                          ? 'text-primary'
                                          : 'text-destructive'
                                      }
                                    >
                                      ({delta > 0 ? '+' : ''}
                                      {formatScore(delta)})
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed px-5 py-8 text-center">
                    <History className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">没有逐局过程</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      补录赛果或较早的牌局可能只保存最终结果。
                    </p>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HistoryView({ rows }: { rows: HistoryRow[] }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">历史战绩</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        点击牌局可查看和牌、流局、立直与点数变化
      </p>
      {rows.length ? (
        <div className="mt-5 space-y-2">
          {rows.map((row) => (
            <MatchDetailSheet key={row.matchId} row={row} />
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

function RankingView({
  rows,
  yakumanRows,
  seasons,
  currentSeason,
  seasonId,
  loading,
  onSeasonChange,
}: {
  rows: LeaderboardRow[];
  yakumanRows: YakumanLeaderboardRow[];
  seasons: SeasonInfo[];
  currentSeason: SeasonInfo;
  seasonId: string;
  loading: boolean;
  onSeasonChange: (seasonId: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<RankingMode>('total');
  const [rankingNow] = useState(() => Date.now());
  const selectedSeason = seasons.find((season) => season.id === seasonId);
  const daysRemaining =
    selectedSeason?.isCurrent && selectedSeason.endAt !== null
      ? Math.max(
          0,
          Math.ceil(
            (selectedSeason.endAt - rankingNow) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;
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
        : mode === 'place'
          ? '按平均顺位从低到高排名'
          : '记录每位玩家和到的役满';
  return (
    <section>
      <h1 className="text-2xl font-semibold">战绩排行</h1>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4 rounded-2xl bg-primary/10 p-4 text-primary">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {selectedSeason?.label ?? '全部赛季'}
          </p>
          {loading && <LoaderCircle className="size-4 animate-spin" />}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="text-xs leading-5 opacity-80">
            {selectedSeason
              ? formatSeasonRange(selectedSeason)
              : '全部历史牌局'}
            {daysRemaining !== null && ` · 还剩 ${daysRemaining} 天`}
          </p>
          <NativeSelect className="w-36 shrink-0" size="sm">
            <select
              aria-label="选择排行榜赛季"
              value={seasonId}
              disabled={loading}
              onChange={(event) => void onSeasonChange(event.target.value)}
            >
              <NativeSelectOption value={currentSeason.id}>
                当前赛季
              </NativeSelectOption>
              <NativeSelectOption value="all">全部赛季</NativeSelectOption>
              {seasons
                .filter((season) => season.id !== currentSeason.id)
                .map((season) => (
                  <NativeSelectOption key={season.id} value={season.id}>
                    {season.label}
                  </NativeSelectOption>
                ))}
            </select>
          </NativeSelect>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 rounded-xl bg-muted p-1">
        {(
          [
            ['total', '累计 pt'],
            ['average', '平均 pt'],
            ['place', '平均顺位'],
            ['yakuman', '役满榜'],
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
      {mode === 'yakuman' && yakumanRows.length ? (
        <div className="mt-5 overflow-hidden rounded-3xl border bg-card">
          {yakumanRows.map((row, index) => (
            <div
              key={row.id}
              className="flex items-start border-b p-4 last:border-0"
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold ${index < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                {index + 1}
              </span>
              <div className="ml-3 min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{row.username}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {row.yakumans
                    .map(
                      (yakuman) =>
                        `${yakuman.name}${yakuman.count > 1 ? ` ×${yakuman.count}` : ''}`,
                    )
                    .join(' · ')}
                </p>
              </div>
              <p className="shrink-0 font-mono font-semibold text-primary">
                {row.total} 次
              </p>
            </div>
          ))}
        </div>
      ) : mode !== 'yakuman' && rows.length ? (
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
          title={mode === 'yakuman' ? '本赛季还没有役满' : '本赛季还没有战绩'}
          text={
            mode === 'yakuman'
              ? '记录役满和牌后，会自动显示在这里。'
              : '完成的半庄会自动计入所处赛季的排行榜。'
          }
        />
      )}
    </section>
  );
}

function AdminRenameDialog({
  account,
  busy,
  error,
  onOpen,
  onRename,
}: {
  account: AdminUserRow;
  busy: boolean;
  error: string;
  onOpen: () => void;
  onRename: (username: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(account.username);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setUsername(account.username);
      onOpen();
    }
  }

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onRename(username)) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="outline" disabled={busy} />}
      >
        <Pencil />
        改名
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>修改玩家账户名</DialogTitle>
            <DialogDescription>
              正在修改“{account.username}”。该玩家原有战绩和排行数据会保留。
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor={`admin-username-${account.id}`}
            className="mt-4 block text-xs font-medium text-muted-foreground"
          >
            新账户名
            <Input
              id={`admin-username-${account.id}`}
              maxLength={12}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 rounded-xl text-sm"
            />
          </label>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <CircleAlert className="size-3.5" />
              {error}
            </p>
          )}
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            限 1–12 个中文、字母、数字、下划线或短横线，且不能与其他账号重复。
          </p>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                busy || !username.trim() || username === account.username
              }
            >
              {busy && <LoaderCircle className="animate-spin" />}
              确认修改
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminConfirm({
  trigger,
  title,
  description,
  busy,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button size="sm" variant="destructive" disabled={busy} />}
      >
        <Trash2 />
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>暂不操作</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DirectResultForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (players: DirectResultPlayer[]) => Promise<boolean>;
}) {
  const initialPlayers = (): DirectResultPlayer[] =>
    WINDS.map(() => ({ username: '', score: '25000', penalty: '0' }));
  const [players, setPlayers] = useState<DirectResultPlayer[]>(initialPlayers);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const scores = players.map((player) => Number(player.score));
  const penalties = players.map((player) => Number(player.penalty || 0));
  const total = scores.reduce((sum, score) => sum + (score || 0), 0);
  const names = players.map((player) => player.username.trim().toLowerCase());
  const valid =
    names.every(Boolean) &&
    new Set(names).size === 4 &&
    scores.every((score) => Number.isInteger(score) && score % 100 === 0) &&
    total === 100000 &&
    penalties.every(
      (penalty) =>
        Number.isFinite(penalty) &&
        penalty <= 0 &&
        Math.round(penalty * 10) === penalty * 10,
    );
  const preview = calculateStandings(
    players.map((player, seat) => ({
      userId: String(seat),
      name: player.username.trim() || `${WINDS[seat]}家`,
      seat,
      score: scores[seat] || 0,
      penalty: penalties[seat] || 0,
    })),
  );

  function updatePlayer(
    seat: number,
    field: keyof DirectResultPlayer,
    value: string,
  ) {
    setPlayers((current) =>
      current.map((player, index) =>
        index === seat ? { ...player, [field]: value } : player,
      ),
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">直接生成对战结局</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          按座次填写四个现有账号。系统会自动计算顺位、位次分和最终 pt。
        </p>
      </div>
      {players.map((player, seat) => (
        <div key={WINDS[seat]} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{WINDS[seat]}家</p>
            {seat === 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                庄家
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label
              htmlFor={`result-user-${seat}`}
              className="text-[10px] text-muted-foreground"
            >
              玩家账号
              <Input
                id={`result-user-${seat}`}
                value={player.username}
                maxLength={12}
                onChange={(event) =>
                  updatePlayer(seat, 'username', event.target.value)
                }
                placeholder="现有账号"
                className="mt-1.5 h-10 rounded-xl text-sm"
              />
            </label>
            <label
              htmlFor={`result-score-${seat}`}
              className="text-[10px] text-muted-foreground"
            >
              最终点数
              <Input
                id={`result-score-${seat}`}
                inputMode="numeric"
                value={player.score}
                onChange={(event) =>
                  updatePlayer(seat, 'score', event.target.value)
                }
                className="mt-1.5 h-10 rounded-xl font-mono text-sm"
              />
            </label>
          </div>
          <label
            htmlFor={`result-penalty-${seat}`}
            className="mt-2 block text-[10px] text-muted-foreground"
          >
            额外判罚 pt（没有则填 0，仅允许负数）
            <Input
              id={`result-penalty-${seat}`}
              inputMode="decimal"
              value={player.penalty}
              onChange={(event) =>
                updatePlayer(seat, 'penalty', event.target.value)
              }
              className="mt-1.5 h-10 rounded-xl font-mono text-sm"
            />
          </label>
        </div>
      ))}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">四家点数合计</span>
          <span
            className={`font-mono font-semibold ${total === 100000 ? 'text-primary' : 'text-destructive'}`}
          >
            {formatScore(total)} / 100,000
          </span>
        </div>
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {preview.map((standing) => (
            <div
              key={standing.userId}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {standing.place} 位 · {standing.name}
              </span>
              <span
                className={`font-mono font-semibold ${standing.totalPoints >= 0 ? 'text-primary' : 'text-destructive'}`}
              >
                {signed(standing.totalPoints)} pt
              </span>
            </div>
          ))}
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger
          render={
            <Button
              className="h-11 w-full rounded-2xl"
              disabled={busy || !valid}
            />
          }
        >
          <Plus />
          生成并计入战绩
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认生成这场对战结局？</AlertDialogTitle>
            <AlertDialogDescription>
              结果会立即写入四家历史战绩和排行榜。如有错误，可稍后在“对局记录”中撤销整场。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>返回检查</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                setConfirmOpen(false);
                void onCreate(players).then((created) => {
                  if (created) setPlayers(initialPlayers());
                });
              }}
            >
              确认生成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!valid && (
        <p className="text-center text-[10px] leading-4 text-muted-foreground">
          请填写四个不同账号，点数使用整百点且合计为 100,000。
        </p>
      )}
    </div>
  );
}

function SeasonAdmin({
  overview,
  busy,
  onSave,
}: {
  overview: AdminOverview;
  busy: boolean;
  onSave: (endDate: string) => Promise<boolean>;
}) {
  const [endDate, setEndDate] = useState(
    toShanghaiDateInput(overview.currentSeason.endAt),
  );

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {overview.currentSeason.label}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {formatSeasonRange(overview.currentSeason)}
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            当前赛季
          </span>
        </div>
        <label
          htmlFor="season-end-date"
          className="mt-4 block text-xs font-medium text-muted-foreground"
        >
          赛季结束日（北京时间）
          <Input
            id="season-end-date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-2 h-11 rounded-xl text-sm"
          />
        </label>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          结束日当天仍计入本赛季。到期后系统会开启下一赛季，再由管理员设置新的结束日。
        </p>
        <Button
          className="mt-4 h-11 w-full rounded-2xl"
          disabled={busy || !endDate}
          onClick={() => void onSave(endDate)}
        >
          {busy && <LoaderCircle className="animate-spin" />}
          保存赛季结束日
        </Button>
      </div>
      {overview.seasons.length > 1 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">历史赛季</p>
          <div className="mt-3 space-y-2">
            {overview.seasons
              .filter((season) => season.id !== overview.currentSeason.id)
              .map((season) => (
                <div
                  key={season.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="font-medium">{season.label}</span>
                  <span className="text-muted-foreground">
                    {formatSeasonRange(season)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminView() {
  const [section, setSection] = useState<
    'create' | 'matches' | 'users' | 'season'
  >('create');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      setOverview(await api<AdminOverview>('/api/admin'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '管理数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const next = await api<AdminOverview>('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setOverview(next);
      if (payload.action === 'create-result')
        setSuccess('赛果已生成，并已计入四家历史战绩和排行榜。');
      if (payload.action === 'rename-user')
        setSuccess('玩家账户名已修改，原有历史战绩和排行数据保持不变。');
      if (payload.action === 'set-season-end')
        setSuccess('当前赛季结束日已更新。');
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '管理操作失败');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">管理后台</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理战绩记录、玩家账号与赛季
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={load}>
          <RotateCcw className={loading ? 'animate-spin' : ''} />
          刷新
        </Button>
      </div>
      <div className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-xs leading-5 text-primary">
        可补录赛果、设置赛季结束日并管理账号。撤销战绩会同步影响历史、战绩排行与役满榜。
      </div>
      <div className="mt-4 grid grid-cols-4 rounded-xl bg-muted p-1">
        {(
          [
            ['create', '补录赛果'],
            ['matches', '对局记录'],
            ['users', '账号管理'],
            ['season', '赛季设置'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSection(value)}
            className={`h-9 rounded-lg text-xs font-medium transition ${section === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <Notice text={error} />}
      {success && (
        <div className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-xs leading-5 text-primary">
          {success}
        </div>
      )}
      {loading ? (
        <div className="grid min-h-48 place-items-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      ) : section === 'create' ? (
        <DirectResultForm
          busy={busy}
          onCreate={(players) =>
            mutate({
              action: 'create-result',
              players: players.map((player) => ({
                username: player.username,
                score: Number(player.score),
                penalty: Number(player.penalty || 0),
              })),
            })
          }
        />
      ) : section === 'matches' ? (
        overview?.matches.length ? (
          <div className="mt-4 space-y-2">
            {overview.matches.map((match) => (
              <div
                key={match.matchId}
                className="rounded-2xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      房间 {match.roomCode}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {match.playerNames}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(match.finishedAt).toLocaleString('zh-CN')} ·{' '}
                      {match.playerCount} 家
                    </p>
                  </div>
                  <AdminConfirm
                    trigger="撤销"
                    title={`撤销房间 ${match.roomCode} 的战绩？`}
                    description="这会删除整场对局的四家成绩，并立即影响历史战绩和所有排行榜，操作无法撤回。"
                    busy={busy}
                    onConfirm={() =>
                      mutate({
                        action: 'delete-match',
                        matchId: match.matchId,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={History}
            title="没有可管理的战绩"
            text="正式结束的半庄会显示在这里。"
          />
        )
      ) : section === 'season' && overview ? (
        <SeasonAdmin
          key={overview.currentSeason.id}
          overview={overview}
          busy={busy}
          onSave={(endDate) =>
            mutate({
              action: 'set-season-end',
              seasonId: overview.currentSeason.id,
              endDate,
            })
          }
        />
      ) : overview?.users.length ? (
        <div className="mt-4 space-y-2">
          {overview.users.map((account) => (
            <div key={account.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {account.username}
                    {account.isAdmin && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                        管理员
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {account.games} 场战绩 · 最近登录{' '}
                    {new Date(account.lastSeenAt).toLocaleDateString('zh-CN')}
                  </p>
                  {account.inActiveRoom && (
                    <p className="mt-1 text-[10px] text-destructive">
                      当前正在房间或对局中
                    </p>
                  )}
                </div>
                {!account.isAdmin && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AdminRenameDialog
                      account={account}
                      busy={busy}
                      error={error}
                      onOpen={() => {
                        setError('');
                        setSuccess('');
                      }}
                      onRename={(username) =>
                        mutate({
                          action: 'rename-user',
                          userId: account.id,
                          username,
                        })
                      }
                    />
                    <AdminConfirm
                      trigger="删除"
                      title={`删除账号“${account.username}”？`}
                      description="该账号会立即退出登录且无法恢复；原有战绩将改为匿名显示。正在房间或对局中的账号不能删除。"
                      busy={busy || account.inActiveRoom}
                      onConfirm={() =>
                        mutate({ action: 'delete-user', userId: account.id })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={Users}
          title="没有玩家账号"
          text="玩家首次登录后会显示在这里。"
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
  isAdmin,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  disabled: boolean;
  isAdmin: boolean;
}) {
  const items: Array<{
    value: Tab;
    label: string;
    icon: typeof History;
  }> = [
    { value: 'match', label: '对局', icon: DoorOpen },
    { value: 'history', label: '战绩', icon: History },
    { value: 'ranking', label: '排行', icon: BarChart3 },
  ];
  if (isAdmin) items.push({ value: 'admin', label: '管理', icon: ShieldCheck });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div
        className={`mx-auto grid h-16 max-w-[560px] px-4 ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}
      >
        {items.map((item) => (
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
  const [yakumanLeaderboard, setYakumanLeaderboard] = useState<
    YakumanLeaderboardRow[]
  >([]);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [currentSeason, setCurrentSeason] = useState<SeasonInfo | null>(null);
  const [rankingSeasonId, setRankingSeasonId] = useState('');
  const [rankingLoading, setRankingLoading] = useState(false);
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
      setYakumanLeaderboard(data.yakumanLeaderboard);
      setSeasons(data.seasons);
      setCurrentSeason(data.currentSeason);
      setRankingSeasonId(data.currentSeason.id);
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
    setYakumanLeaderboard([]);
    setSeasons([]);
    setCurrentSeason(null);
    setRankingSeasonId('');
    setTab('match');
  }

  async function changeRankingSeason(seasonId: string) {
    setRankingLoading(true);
    setError('');
    try {
      const data = await api<{
        leaderboard: LeaderboardRow[];
        yakumanLeaderboard: YakumanLeaderboardRow[];
      }>(`/api/leaderboard?season=${encodeURIComponent(seasonId)}`);
      setLeaderboard(data.leaderboard);
      setYakumanLeaderboard(data.yakumanLeaderboard);
      setRankingSeasonId(seasonId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '排行榜加载失败');
    } finally {
      setRankingLoading(false);
    }
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
      <AppHeader
        user={user}
        logout={logout}
        onRenamed={(next) => {
          setUser(next);
          void bootstrap();
        }}
      />
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
      {tab === 'ranking' && currentSeason && (
        <RankingView
          rows={leaderboard}
          yakumanRows={yakumanLeaderboard}
          seasons={seasons}
          currentSeason={currentSeason}
          seasonId={rankingSeasonId}
          loading={rankingLoading}
          onSeasonChange={changeRankingSeason}
        />
      )}
      {tab === 'admin' && user.isAdmin && <AdminView />}
      <BottomNav
        tab={tab}
        setTab={setTab}
        disabled={Boolean(locked)}
        isAdmin={user.isAdmin}
      />
    </Shell>
  );
}
