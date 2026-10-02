import { useState, useEffect } from 'react';

export function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 rounded-xl bg-white/90 shadow-sm border border-surface-200/60 select-none">
      <span className="font-mono text-base font-bold tabular-nums text-surface-800 tracking-tight">
        {String(displayHours).padStart(2, '0')}
      </span>
      <span className="font-mono text-base font-bold text-primary-500 clock-blink">:</span>
      <span className="font-mono text-base font-bold tabular-nums text-surface-800 tracking-tight">
        {String(minutes).padStart(2, '0')}
      </span>
      <span className="font-mono text-base font-bold text-primary-500 clock-blink">:</span>
      <span className="font-mono text-base font-bold tabular-nums text-primary-600 tracking-tight">
        {String(seconds).padStart(2, '0')}
      </span>
      <span className="text-[9px] font-bold text-surface-400 ml-1 leading-none">
        {ampm}
      </span>
    </div>
  );
}
