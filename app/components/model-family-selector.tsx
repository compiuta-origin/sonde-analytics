import { InfoTooltip } from '@/components/ui/info-tooltip';
import { MODEL_FAMILIES, getModelForTier } from '@/lib/models';
import { cn } from '@/lib/utils';
import { ArrowUpCircle, Check } from 'lucide-react';

interface ModelFamilySelectorProps {
  plan: string;
  selectedFamilies: Record<string, boolean>;
  webSearch: Record<string, boolean>;
  onToggleFamily: (familyId: string) => void;
  onToggleWebSearch: (familyId: string) => void;
  maxSelections?: number;
  showToast?: (message: string) => void;
}

export function ModelFamilySelector({
  plan,
  selectedFamilies,
  webSearch,
  onToggleFamily,
  onToggleWebSearch,
  maxSelections,
  showToast,
}: ModelFamilySelectorProps) {
  // Count currently selected families
  const selectedCount = Object.values(selectedFamilies).filter(Boolean).length;

  // Determine if we should allow multiple selections based on plan
  const isFreeUser = plan === 'free';
  const isProUser = plan === 'pro';

  // For free users, we want single selection behavior
  const shouldAllowMultiple = !isFreeUser;

  function handleFamilyToggle(familyId: string) {
    const isSelecting = !selectedFamilies[familyId];

    // For pro users: max 3 selections
    if (isProUser && maxSelections !== undefined) {
      if (isSelecting && selectedCount >= maxSelections) {
        showToast?.(
          `Pro plan allows a maximum of ${maxSelections} models per prompt.`
        );
        return;
      }
    }

    // For free users and others: let parent handle the logic
    onToggleFamily(familyId);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {MODEL_FAMILIES.map((family) => {
        const isSelected = selectedFamilies[family.id] || false;
        const currentModel = getModelForTier(family.id, plan);
        const proModel = getModelForTier(family.id, 'pro');
        const isUpgradeAvailable =
          plan === 'free' && currentModel.id !== proModel.id;

        return (
          <div
            key={family.id}
            className={cn(
              'relative p-4 border rounded-md transition-all duration-200',
              isSelected
                ? 'bg-surface border-primary/50 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                : 'bg-canvas border-border-subtle hover:border-border-strong'
            )}
          >
            {/* Header / Toggle Area */}
            <div
              className="flex items-start gap-4 cursor-pointer"
              onClick={() => handleFamilyToggle(family.id)}
            >
              <div
                className={cn(
                  'mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-primary border-primary text-surface'
                    : 'bg-transparent border-text-muted text-transparent'
                )}
              >
                <Check size={12} strokeWidth={3} />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <family.icon
                    size={18}
                    className={cn(
                      isSelected ? 'text-primary' : 'text-text-secondary'
                    )}
                  />
                  <span
                    className={cn(
                      'font-semibold',
                      isSelected ? 'text-text-primary' : 'text-text-secondary'
                    )}
                  >
                    {family.name}
                  </span>
                </div>

                <div className="text-xs text-text-muted font-light mb-2">
                  {family.description}
                </div>

                {/* Active Model Badge */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted border border-border-subtle text-text-secondary">
                    {currentModel.name}
                  </div>

                  {isUpgradeAvailable && (
                    <div className="flex items-center gap-1 text-[10px] text-text-muted">
                      <ArrowUpCircle size={10} className="text-primary" />
                      <span>
                        <span className="text-primary font-medium">Pro:</span>{' '}
                        {proModel.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Web Search Toggle (Always visible for discoverability) */}
            <div className="mt-4 pt-3 border-t border-border-subtle/50 ml-9">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={webSearch[family.id]}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelected) handleFamilyToggle(family.id);
                    onToggleWebSearch(family.id);
                  }}
                  className={cn(
                    'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-0 border',
                    webSearch[family.id]
                      ? 'bg-primary/20 border-primary/50'
                      : 'bg-transparent border-border-strong',
                    !isSelected && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out',
                      webSearch[family.id]
                        ? 'translate-x-5.5 bg-white/80'
                        : 'translate-x-1 bg-gray-300'
                    )}
                  />
                </button>
                <span
                  className={cn(
                    'text-xs font-medium cursor-pointer select-none',
                    webSearch[family.id]
                      ? 'text-text-primary'
                      : 'text-zinc-400',
                    !isSelected && 'opacity-50'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelected) onToggleFamily(family.id);
                    onToggleWebSearch(family.id);
                  }}
                >
                  Enable Web Search
                </span>
                <InfoTooltip
                  content="Enhance model responses with real-time web results. Uses OpenRouter's web search plugin."
                  iconClassName={cn(
                    webSearch[family.id]
                      ? 'text-text-primary'
                      : 'text-zinc-400',
                    !isSelected && 'opacity-50'
                  )}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
