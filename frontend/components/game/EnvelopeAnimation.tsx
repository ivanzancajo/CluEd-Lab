import { useEffect, useRef } from 'react';
import { m } from 'motion/react';
import { User, Box, MapPin, Mail } from 'lucide-react';

interface EnvelopeAnimationProps {
  onComplete: () => void;
}

const CARDS = [
  { id: 'subject', icon: User, color: 'border-blue-500 bg-blue-950', from: { x: -300, y: -200 }, delay: 0 },
  { id: 'object', icon: Box, color: 'border-emerald-500 bg-emerald-950', from: { x: 300, y: -200 }, delay: 0.15 },
  { id: 'space', icon: MapPin, color: 'border-red-500 bg-red-950', from: { x: 0, y: 280 }, delay: 0.3 },
] as const;

export function EnvelopeAnimation({ onComplete }: EnvelopeAnimationProps) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    const timer = setTimeout(() => onCompleteRef.current(), 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="relative flex items-center justify-center size-64">
        {CARDS.map(({ id, icon: Icon, color, from, delay }) => (
          <m.div
            key={id}
            className={`absolute w-16 aspect-[2.5/3.5] rounded-lg border-2 ${color} flex flex-col items-center justify-center gap-1 shadow-lg`}
            initial={{ x: from.x, y: from.y, opacity: 1, scale: 1 }}
            animate={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
            transition={{ duration: 1.2, delay, ease: 'easeInOut' }}
          >
            <Icon className="size-6 opacity-80" />
          </m.div>
        ))}

        <m.div
          className="absolute flex flex-col items-center justify-center"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.6, ease: 'easeOut' }}
        >
          <Mail className="size-20 text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]" strokeWidth={1.5} />
          <m.p
            className="mt-2 text-cyan-300 text-sm font-semibold tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.4 }}
          >
            Solución sellada
          </m.p>
        </m.div>
      </div>
    </div>
  );
}
