import { useT } from '../context/LangContext'
import { PRICE_LABELS } from '../lib/paddle'
import { Icon } from './ui'

// Monthly / yearly subscription choice. `onPick('monthly'|'yearly')`.
export function PlanButtons({ onPick, busy }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex w-full max-w-[320px] flex-col gap-2">
      <button onClick={() => onPick('monthly')} disabled={busy} className="btn-accent w-full">
        {t('billing.payMonthly', { price: PRICE_LABELS.monthly })}
      </button>
      <button onClick={() => onPick('yearly')} disabled={busy} className="btn-ghost w-full">
        {t('billing.payYearly', { price: PRICE_LABELS.yearly })}
      </button>
      <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ok">
        <Icon name="star" size={14} /> {t('billing.yearlySave')}
      </p>
    </div>
  )
}
