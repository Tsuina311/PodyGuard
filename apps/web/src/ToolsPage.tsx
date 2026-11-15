import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagicRulesPanel } from './tracker/rules-assistant/RulesAssistantFrame';
export function ToolsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useLocation().state as { returnTo?: string } | null;
  return (
    <MagicRulesPanel
      onClose={() =>
        void navigate(
          state?.returnTo?.startsWith('/') && !state.returnTo.startsWith('//')
            ? state.returnTo
            : '/',
        )
      }
      loadingLabel={t('tracker.magicRules.loading')}
      failedMessage={t('tracker.magicRules.failed')}
      closeLabel={t('tracker.magicRules.close')}
    />
  );
}
