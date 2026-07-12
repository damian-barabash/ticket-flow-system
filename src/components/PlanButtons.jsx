import { useT } from '../context/LangContext'
import { PRICE_LABELS } from '../lib/paddle'

// Monthly / yearly subscription choice. `onPick('monthly'|'yearly')`.
export function PlanButtons({ onPick, busy }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex w-full max-w-[300px] flex-col gap-2">
      <button onClick={() => onPick('monthly')} disabled={busy} className="btn-accent w-full">
        {t('billing.payMonthly', { price: PRICE_LABELS.monthly })}
      </button>
      <button onClick={() => onPick('yearly')} disabled={busy} className="btn-solid w-full">
        {t('billing.payYearly', { price: PRICE_LABELS.yearly })}
      </button>
      <p className="mt-1 text-center text-xs text-ok">★ {t('billing.yearlySave')}</p>
    </div>
  )
}
