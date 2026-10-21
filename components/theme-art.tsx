import type { SVGProps } from 'react';
import Image from 'next/image';

function Blossom() {
  return (
    <>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path
          key={angle}
          d="M0 1C-9-3-10-12-4-15L0-12 4-15C10-12 9-3 0 1Z"
          transform={`rotate(${angle})`}
          fill="currentColor"
          stroke="#c96589"
          strokeWidth=".35"
        />
      ))}
      <circle r="3.2" fill="#f3bb6e" />
      <circle r="1.3" fill="#bf5579" />
    </>
  );
}

export function SakuraFlower(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="-20 -20 40 40" fill="none" aria-hidden="true" {...props}>
      <Blossom />
    </svg>
  );
}

export function SakuraBranch({ className }: { className?: string }) {
  return (
    <Image
      src="/theme/sakura-branch.webp"
      alt=""
      aria-hidden="true"
      width={300}
      height={150}
      className={className}
    />
  );
}

export function MahjongTile({
  character = '東',
  className = '',
}: {
  character?: string;
  className?: string;
}) {
  return (
    <span className={`mahjong-tile ${className}`} aria-hidden="true">
      {character}
    </span>
  );
}

export function RankBadge({
  rank,
  podium = false,
}: {
  rank: number;
  podium?: boolean;
}) {
  return (
    <span
      className={`rank-badge rank-${rank <= 3 ? rank : 'other'} ${podium ? 'rank-podium' : ''}`}
      aria-label={`第 ${rank} 名`}
    >
      {podium && rank <= 3 && (
        <svg
          viewBox="0 0 64 64"
          className="rank-wreath"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M22 57C6 48 1 30 10 13L12 14C5 31 9 46 23 55ZM11 22C3 23 2 15 3 11 8 12 12 16 11 22ZM8 32C0 31 0 23 1 20 7 22 10 26 8 32ZM11 43C3 43 1 36 2 32 8 34 12 37 11 43ZM17 52C9 55 5 48 5 44 11 43 16 46 17 52ZM24 57C18 63 11 58 10 54 16 51 21 52 24 57ZM42 57C58 48 63 30 54 13L52 14C59 31 55 46 41 55ZM53 22C61 23 62 15 61 11 56 12 52 16 53 22ZM56 32C64 31 64 23 63 20 57 22 54 26 56 32ZM53 43C61 43 63 36 62 32 56 34 52 37 53 43ZM47 52C55 55 59 48 59 44 53 43 48 46 47 52ZM40 57C46 63 53 58 54 54 48 51 43 52 40 57Z" />
        </svg>
      )}
      <span className="rank-number">{rank}</span>
      {rank === 1 && !podium && (
        <svg
          viewBox="0 0 32 18"
          className="rank-crown"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="m3 4 7 5 6-9 6 9 7-5-3 14H6Z" />
        </svg>
      )}
    </span>
  );
}

export function LobbyDecoration() {
  return (
    <div className="lobby-decoration" aria-hidden="true">
      <SakuraBranch className="lobby-branch" />
      <MahjongTile character="東" className="lobby-tile-one" />
      <MahjongTile character="中" className="lobby-tile-two" />
      <svg className="lobby-paw" viewBox="0 0 60 60" fill="currentColor">
        <ellipse
          cx="29"
          cy="40"
          rx="15"
          ry="12"
          transform="rotate(-15 29 40)"
        />
        <ellipse cx="10" cy="26" rx="6" ry="8" transform="rotate(-25 10 26)" />
        <ellipse cx="24" cy="15" rx="6" ry="8" />
        <ellipse cx="39" cy="15" rx="6" ry="8" transform="rotate(20 39 15)" />
        <ellipse cx="50" cy="28" rx="6" ry="8" transform="rotate(35 50 28)" />
      </svg>
    </div>
  );
}
