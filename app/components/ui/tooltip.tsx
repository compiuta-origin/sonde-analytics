'use client';

import { useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-950 border border-border-strong rounded-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap">
          <p className="text-[10px] leading-none text-text-primary font-medium tracking-wide uppercase">
            {content}
          </p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border-strong" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-zinc-950 mt-[-1px]" />
        </div>
      )}
    </div>
  );
}
