import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useT } from '../context/LangContext'
import { EnterpriseModal } from '../components/EnterpriseModal'
import { Header } from './landing/Header'
import { Hero } from './landing/Hero'
import { TickerStats, Problem, Demo } from './landing/Story'
import { Spotlight, Features, UseCases, Compare } from './landing/Product'
import { Pricing, Apps, Faq } from './landing/Commerce'
import { FinalCta, Footer } from './landing/Closing'
import './landing/landing.css'

// Public landing — design v2 "Momentum" (black · signal red · white, all corners 90°).
export default function Landing() {
  const { session } = useAuth()
  const { lang } = useT()
  const navigate = useNavigate()
  const [ent, setEnt] = useState({ open: false, email: '' })

  // keep <html lang> in sync for screen readers / hyphenation
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const go = (path) => navigate(path)
  const openEnterprise = (email = '') => setEnt({ open: true, email: typeof email === 'string' ? email : '' })

  return (
    <div className="lp relative min-h-screen font-sans">
      <div className="lp-grain" aria-hidden="true" />
      <Header session={session} go={go} />
      <main>
        <Hero go={go} session={session} />
        <TickerStats />
        <Problem />
        <Demo />
        <Spotlight />
        <Features />
        <UseCases />
        <Compare />
        <Pricing go={go} onEnterprise={() => openEnterprise()} />
        <Apps go={go} />
        <Faq />
        <FinalCta go={go} onEnterprise={openEnterprise} session={session} />
      </main>
      <Footer go={go} />
      <EnterpriseModal open={ent.open} initialEmail={ent.email} onClose={() => setEnt({ open: false, email: '' })} />
    </div>
  )
}
