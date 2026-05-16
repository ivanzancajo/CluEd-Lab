import { useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Box, MapPin, Mail } from 'lucide-react';

interface EnvelopeAnimationProps {
  onComplete: () => void;
}

const CARDS = [
  { icon: User, color: 'border-blue-500 bg-blue-950', from: { x: -300, y: -200 }, delay: 0 },
  { icon: Box, color: 'border-emerald-500 bg-emerald-950', from: { x: 300, y: -200 }, delay: 0.15 },
  { icon: MapPin, color: 'border-red-500 bg-red-950', from: { x: 0, y: 280 }, delay: 0.3 },
] as const;

export function EnvelopeAnimation({ onComplete }: EnvelopeAnimationProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="relative flex items-center justify-center w-64 h-64">
        {CARDS.map(({ icon: Icon, color, from, delay }, index) => (
          <motion.div
            key={index}
            className={`absolute w-16 aspect-[2.5/3.5] rounded-lg border-2 ${color} flex flex-col items-center justify-center gap-1 shadow-lg`}
            initial={{ x: from.x, y: from.y, opacity: 1, scale: 1 }}
            animate={{ x: 0, y: 0, opacity: 0, scale: 0.2 }}
            transition={{ duration: 1.2, delay, ease: 'easeInOut' }}
          >
            <Icon className="w-6 h-6 opacity-80" />
          </motion.div>
        ))}

        <motion.div
          className="absolute flex flex-col items-center justify-center"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.6, ease: 'easeOut' }}
        >
          <Mail className="w-20 h-20 text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]" strokeWidth={1.5} />
          <motion.p
            className="mt-2 text-cyan-300 text-sm font-semibold tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.4 }}
          >
            Solución sellada
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
