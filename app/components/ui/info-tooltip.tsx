'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface InfoTooltipProps {
  content: string;
  className?: string;
  iconClassName?: string;
}

export function InfoTooltip({ content, className, iconClassName }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className={cn("relative inline-block ml-1.5", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <Info 
        size={14} 
        className={cn("text-text-muted hover:text-primary transition-colors cursor-help", iconClassName)} 
      />
      
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-950 border border-border-strong rounded-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <p className="text-[11px] leading-relaxed text-text-primary normal-case tracking-normal font-normal">
            {content}
          </p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-border-strong" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[7px] border-transparent border-t-zinc-950 mt-[-1px]" />
        </div>
      )}
    </div>
  );
}
