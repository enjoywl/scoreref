import { useState } from "react";

function abbr(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AvatarProps {
  id?: number;
  name: string;
  className: string;
  textClass?: string;
}

export function TeamAvatar({ id, name, className, textClass }: AvatarProps) {
  const [err, setErr] = useState(false);
  if (err || !id) {
    return (
      <span className={`${className} inline-flex items-center justify-center font-bold uppercase bg-surface-alt ${textClass || "text-[10px]"}`}>
        {abbr(name)}
      </span>
    );
  }
  return (
    <img src={`/v1/image/team/${id}.png`} alt={name} className={className} loading="lazy" onError={() => setErr(true)} />
  );
}

export function LeagueAvatar({ id, name, className, textClass }: AvatarProps) {
  const [err, setErr] = useState(false);
  if (err || !id) {
    return (
      <span className={`${className} inline-flex items-center justify-center font-bold uppercase bg-surface-alt ${textClass || "text-[9px]"}`}>
        {abbr(name)}
      </span>
    );
  }
  return (
    <img src={`/v1/image/league/${id}.png`} alt={name} className={className} loading="lazy" onError={() => setErr(true)} />
  );
}
