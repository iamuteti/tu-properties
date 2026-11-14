import React, { useState } from 'react';
import { Smartphone, CreditCard, FileSpreadsheet, Calculator, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, FileCheck, Building, Coins, Send } from 'lucide-react';

interface InteractiveShowcaseProps {
  onStartTrial: () => void;
}

export const InteractiveShowcase: React.FC<InteractiveShowcaseProps> = ({ onStartTrial }) => {
  const [activeEngine, setActiveEngine] = useState<'payments' | 'tax' | 'csv' | 'deposit'>('payments');

  // Payments & FIFO Simulator state
  const [oldestInvoice, setOldestInvoice] = useState<number>(85000);
  const [currentInvoice, setCurrentInvoice] = useState<number>(45000);
  const [paymentAmount, setPaymentAmount] = useState<number>(100000);
  const [mpesaPhone, setMpesaPhone] = useState<string>('+254 712 345 678');
  const [stkStatus, setStkStatus] = useState<'idle' | 'pushing' | 'settled'>('settled');

  // Compute FIFO settlement:
  const oldestSettled = Math.min(oldestInvoice, paymentAmount);
  const remainingAfterOldest = Math.max(0, paymentAmount - oldestSettled);
  const currentSettled = Math.min(currentInvoice, remainingAfterOldest);
  const spendableCredit = Math.max(0, remainingAfterOldest - currentSettled);
  const totalOutstandingRemaining = oldestInvoice - oldestSettled + (currentInvoice - currentSettled);

  // Multi-Country Tax Simulator
  //
  // Every rate below is a real configured row: the tax rules that ship are KE
  // (VAT 16%, WHT 5%), GB (VAT 20%), DE (USt 19% and 7% for residential rent)
  // and US (California 8.75%, Texas 8.25%). The United States has no federal
  // VAT, so its national rate is 0 and the sales tax is a sub-national rule.
  const [selectedCountry, setSelectedCountry] = useState<'US' | 'GB' | 'DE' | 'KE' | 'ZA'>('US');
  const [grossRent, setGrossRent] = useState<number>(100000);

  const TAX_PRESETS = {
    US: {
      name: 'United States (Federal & State)',
      currency: 'USD',
      vatRate: 0,
      whtRate: 0,
      statutoryStaff: ['Federal Withholding (W-4)', 'FICA (Social Security & Medicare)', 'State Unemployment (SUTA)', 'FUTA'],
      note: 'No federal VAT — sales tax is a sub-national rule (CA 8.75%, TX 8.25%).',
    },
    GB: {
      name: 'United Kingdom',
      currency: 'GBP',
      vatRate: 20,
      whtRate: 0,
      statutoryStaff: ['PAYE Income Tax', 'Class 1 National Insurance (NIC)', 'Workplace Auto-Enrolment Pension (5% + 3%)'],
      note: 'VAT is quoted inclusive, the way a consumer bill must read.',
    },
    DE: {
      name: 'Germany',
      currency: 'EUR',
      vatRate: 19,
      whtRate: 0,
      statutoryStaff: ['Lohnsteuer (income tax)', 'Solidaritätszuschlag', 'Kranken- & Rentenversicherung', 'Kirchensteuer (optional)'],
      note: 'One tax code with two rates: 19% standard, 7% for residential rent.',
    },
    KE: {
      name: 'Kenya',
      currency: 'KES',
      vatRate: 16,
      whtRate: 5,
      statutoryStaff: ['PAYE', 'NSSF Tier I & II', 'SHIF (1.5% each side)', 'Housing Levy (1.5%)'],
      note: 'VAT 16% charged on rent, 5% rent withholding deducted and posted to the ledger.',
    },
    ZA: {
      name: 'South Africa',
      currency: 'ZAR',
      vatRate: 15,
      whtRate: 0, // Commercial rent standard VAT
      statutoryStaff: ['PAYE (progressive tax brackets)', 'UIF (1% + 1%)', 'SDL (1%)', 'Workmen Compensation'],
      note: 'Configured via tax schedules with time validity windows.',
    },
  };

  const currentTax = TAX_PRESETS[selectedCountry];
  const calculatedVAT = (grossRent * currentTax.vatRate) / 100;
  const calculatedWHT = (grossRent * currentTax.whtRate) / 100;
  const netAfterWHT = grossRent - calculatedWHT;

  // Deposit Settlement State
  const [securityDeposit, setSecurityDeposit] = useState<number>(90000);
  const [paintRepairs, setPaintRepairs] = useState<number>(12500);
  const [unpaidWater, setUnpaidWater] = useState<number>(3200);
  const netRefund = Math.max(0, securityDeposit - paintRepairs - unpaidWater);

  return (
    <section id="how-it-works" className="py-24 bg-canvas relative border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Live Interactive Engine</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight">See the concrete mechanisms in action.</h2>
          <p className="mt-4 text-base sm:text-lg text-ink-muted">Test the math: FIFO waterfall allocation, multi-country tax calculations, and dry-run CSV validation.</p>
        </div>

        {/* Engine Tabs */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          <button onClick={() => setActiveEngine('payments')} className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${activeEngine === 'payments' ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface/90 text-ink-muted hover:text-ink dark:hover:text-white border border-line'}`}>
            <Smartphone className="w-4 h-4" />
            <span>1. Payment Recording &amp; FIFO Allocation</span>
          </button>

          <button onClick={() => setActiveEngine('tax')} className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${activeEngine === 'tax' ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface/90 text-ink-muted hover:text-ink dark:hover:text-white border border-line'}`}>
            <Calculator className="w-4 h-4" />
            <span>2. Multi-Country Tax Engine</span>
          </button>

          <button onClick={() => setActiveEngine('csv')} className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${activeEngine === 'csv' ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface/90 text-ink-muted hover:text-ink dark:hover:text-white border border-line'}`}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>3. CSV Dry-Run Preview</span>
          </button>

          <button onClick={() => setActiveEngine('deposit')} className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${activeEngine === 'deposit' ? 'bg-brand-500 text-white shadow-sm' : 'bg-surface/90 text-ink-muted hover:text-ink dark:hover:text-white border border-line'}`}>
            <Coins className="w-4 h-4" />
            <span>4. Derived Deposit Settlement</span>
          </button>
        </div>

        {/* Engine Body Container */}
        <div className="mt-8 bg-surface/80 border border-line rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* SIMULATOR 1: PAYMENTS & FIFO WATERFALL */}
          {activeEngine === 'payments' && (
            <div className="space-y-6">
              <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Payment Recording & Waterfall Settlement
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-subtle mt-1">Rule: Oldest invoice settled first. Overpayments automatically become spendable credit. Amounts shown in KES.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 border border-emerald-800 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Payment Row Recorded
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Inputs Column */}
                <div className="lg:col-span-5 space-y-4 bg-surface/70 p-5 rounded-2xl border border-line">
                  <h4 className="text-xs font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider font-mono">Test Simulated Payment</h4>

                  <div>
                    <label className="text-xs text-ink-muted font-semibold block mb-1">Tenant Reference / Phone / Card</label>
                    <input type="text" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} className="w-full bg-surface border border-line-strong rounded-xl px-3.5 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-ink-subtle block mb-1">Invoice #1 (Oldest Arrears)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono">KES</span>
                        <input type="number" value={oldestInvoice} onChange={(e) => setOldestInvoice(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-12 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-ink-subtle block mb-1">Invoice #2 (Current Rent)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono">KES</span>
                        <input type="number" value={currentInvoice} onChange={(e) => setCurrentInvoice(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-12 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-brand-700 dark:text-brand-300 font-semibold block mb-1">Simulated Amount Paid by Tenant</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-ink-subtle font-mono font-bold">KES</span>
                      <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)} className="w-full bg-surface border-2 border-brand-500/50 rounded-xl pl-12 pr-3 py-2 text-base text-brand-700 dark:text-brand-300 font-mono font-bold focus:border-brand-400 focus:outline-none" />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setStkStatus('pushing');
                        setTimeout(() => setStkStatus('settled'), 600);
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Record Payment &amp; Allocate
                    </button>
                  </div>
                </div>

                {/* Results Column */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-3">
                      <span className="text-xs font-mono text-ink-subtle">Allocation Engine Result:</span>
                      <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">FIFO Waterfall Reconciled</span>
                    </div>

                    {/* Step 1 Waterfall */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-line">
                      <div>
                        <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Oldest Invoice (#INV-001)
                        </div>
                        <div className="text-[11px] text-ink-subtle font-mono mt-0.5">Original Balance: KES ${oldestInvoice.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block">-KES ${oldestSettled.toLocaleString()} Settled</span>
                        <span className="text-[10px] text-ink-subtle font-mono">Remaining: KES ${(oldestInvoice - oldestSettled).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Step 2 Waterfall */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-line">
                      <div>
                        <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Current Month Invoice (#INV-002)
                        </div>
                        <div className="text-[11px] text-ink-subtle font-mono mt-0.5">Original Balance: KES ${currentInvoice.toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block">-KES ${currentSettled.toLocaleString()} Settled</span>
                        <span className="text-[10px] text-ink-subtle font-mono">Remaining: KES ${(currentInvoice - currentSettled).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Step 3 Spendable Credit or Arrears */}
                    <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider font-mono">Tenant Spendable Credit Balance</div>
                        <div className="text-[11px] text-ink-muted mt-0.5">Overpayment booked to digital tenant wallet</div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-extrabold text-brand-700 dark:text-brand-300 font-mono">+KES ${spendableCredit.toLocaleString()}</span>
                        <span className="text-[10px] text-ink-subtle block">Auto-applied to next cycle</span>
                      </div>
                    </div>

                    {/* Receipt Output */}
                    <div className="pt-2 border-t border-line flex items-center justify-between text-xs text-ink-subtle font-mono">
                      <span>Receipt: REC-2026-88421.pdf</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Ledger Entry #TX-9902 Posted</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SIMULATOR 2: MULTI-COUNTRY TAX ENGINE */}
          {activeEngine === 'tax' && (
            <div className="space-y-6">
              <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-brand-700 dark:text-brand-300" />
                    Multi-Country Statutory Tax Engine (Configured as Data)
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-subtle mt-1">Tax laws are not hardcoded. Withholding tax, VAT and sales tax are rules with a rate, a country, a region and an effective date — one row per jurisdiction.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['US', 'GB', 'DE', 'KE', 'ZA'] as const).map((cc) => (
                    <button key={cc} onClick={() => setSelectedCountry(cc)} className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono cursor-pointer transition-all ${selectedCountry === cc ? 'bg-brand-500 text-white shadow-md' : 'bg-canvas text-ink-muted hover:text-ink dark:hover:text-white'}`}>
                      {cc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface p-5 rounded-2xl border border-line space-y-4">
                  <div className="text-xs font-bold text-brand-700 dark:text-brand-300 font-mono uppercase">Jurisdiction Selected</div>
                  <div className="text-xl font-extrabold text-ink">{currentTax.name}</div>
                  <p className="text-xs text-ink-muted">{currentTax.note}</p>
                  <div>
                    <label className="text-xs text-ink-subtle block mb-1">Monthly Commercial Rent Roll:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono font-bold">{currentTax.currency}</span>
                      <input type="number" value={grossRent} onChange={(e) => setGrossRent(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-16 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-2xl border border-line space-y-3 font-mono text-xs">
                  <div className="text-brand-700 dark:text-brand-300 font-bold uppercase tracking-wider text-[11px]">Derived Tax Withholding</div>
                  <div className="flex justify-between py-1.5 border-b border-line text-ink-muted">
                    <span>Configured WHT Rate:</span>
                    <span className="font-bold text-ink">{currentTax.whtRate}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line text-ink-muted">
                    <span>Configured VAT Rate:</span>
                    <span className="font-bold text-ink">{currentTax.vatRate}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line text-ink-muted">
                    <span>Derived WHT Deduction:</span>
                    <span className="font-bold text-rose-400">
                      - {currentTax.currency} {calculatedWHT.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line text-ink-muted">
                    <span>Derived Output VAT:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      + {currentTax.currency} {calculatedVAT.toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 flex justify-between font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Net to Landlord:</span>
                    <span>
                      {currentTax.currency} {netAfterWHT.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-2xl border border-line space-y-3">
                  <div className="text-xs font-bold text-brand-700 dark:text-brand-300 font-mono uppercase">Statutory Staff Deductions</div>
                  <p className="text-xs text-ink-subtle">Caretakers, guards, and estate managers payroll computed from the rules that exist for that country:</p>
                  <ul className="space-y-2 mt-2">
                    {currentTax.statutoryStaff.map((staffItem, idx) => (
                      <li key={idx} className="text-xs text-ink-muted flex items-center gap-2 p-2 rounded-lg bg-surface border border-line">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{staffItem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* SIMULATOR 3: CSV IMPORT DRY-RUN PREVIEW */}
          {activeEngine === 'csv' && (
            <div className="space-y-6">
              <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-brand-700 dark:text-brand-300" />
                    CSV Import Engine with Dry-Run Validation
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-subtle mt-1">Preview your dataset before writing to the database. Invalid rows are flagged with line-specific errors; valid rows import cleanly.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono bg-canvas px-3 py-1.5 rounded-lg text-ink-muted">
                  <span>Dry-Run Check: 4 Rows Parsed</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-line text-ink-subtle bg-surface">
                      <th className="py-2.5 px-3">CSV Row #</th>
                      <th className="py-2.5 px-3">Property Name</th>
                      <th className="py-2.5 px-3">Unit Code</th>
                      <th className="py-2.5 px-3">Tenant Full Name</th>
                      <th className="py-2.5 px-3">Monthly Rent</th>
                      <th className="py-2.5 px-3">Lease Start / End</th>
                      <th className="py-2.5 px-3 text-right">Dry-Run Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink-muted">
                    <tr className="bg-emerald-950/20">
                      <td className="py-3 px-3 text-ink-subtle">Row 02</td>
                      <td className="py-3 px-3 font-sans text-ink font-medium">Westlands Ridge</td>
                      <td className="py-3 px-3 font-bold text-ink">4B</td>
                      <td className="py-3 px-3 font-sans">K. Mwangi</td>
                      <td className="py-3 px-3">KES 85,000</td>
                      <td className="py-3 px-3">2026-01-01 → 2026-12-31</td>
                      <td className="py-3 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">VALID (Ready to commit)</span>
                      </td>
                    </tr>
                    <tr className="bg-rose-950/30">
                      <td className="py-3 px-3 text-ink-subtle">Row 03</td>
                      <td className="py-3 px-3 font-sans text-ink font-medium">Westlands Ridge</td>
                      <td className="py-3 px-3 font-bold text-ink">4B</td>
                      <td className="py-3 px-3 font-sans">J. Omondi</td>
                      <td className="py-3 px-3">KES 85,000</td>
                      <td className="py-3 px-3 text-rose-300">2026-06-01 → 2027-05-31</td>
                      <td className="py-3 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-sans font-bold flex items-center justify-end gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          ERROR: Overlapping Lease on Unit 4B
                        </span>
                      </td>
                    </tr>
                    <tr className="bg-emerald-950/20">
                      <td className="py-3 px-3 text-ink-subtle">Row 04</td>
                      <td className="py-3 px-3 font-sans text-ink font-medium">Lakeview Court</td>
                      <td className="py-3 px-3 font-bold text-ink">PH-01</td>
                      <td className="py-3 px-3 font-sans">R. Sharma</td>
                      <td className="py-3 px-3">INR 26,500</td>
                      <td className="py-3 px-3">2026-02-01 → 2027-01-31</td>
                      <td className="py-3 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">VALID (Ready to commit)</span>
                      </td>
                    </tr>
                    <tr className="bg-emerald-950/20">
                      <td className="py-3 px-3 text-ink-subtle">Row 05</td>
                      <td className="py-3 px-3 font-sans text-ink font-medium">Sandton View</td>
                      <td className="py-3 px-3 font-bold text-ink">Unit 14</td>
                      <td className="py-3 px-3 font-sans">M. Van Der Merwe</td>
                      <td className="py-3 px-3">ZAR 18,500</td>
                      <td className="py-3 px-3">2026-03-01 → 2027-02-28</td>
                      <td className="py-3 px-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">VALID (Ready to commit)</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-line flex items-center justify-between text-xs font-mono text-ink-subtle">
                <span>Summary: 3 valid rows ready for import • 1 error isolated safely with zero database disruption</span>
                <span className="text-brand-700 dark:text-brand-300">Database Guard Active</span>
              </div>
            </div>
          )}

          {/* SIMULATOR 4: DERIVED DEPOSIT SETTLEMENT */}
          {activeEngine === 'deposit' && (
            <div className="space-y-6">
              <div className="border-b border-line pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Coins className="w-5 h-5 text-brand-700 dark:text-brand-300" />
                    Deposit Settlement Derived From Verified Deductions
                  </h3>
                  <p className="text-xs sm:text-sm text-ink-subtle mt-1">No manual estimation. Security deposits are linked to move-out condition reports and final utility bills.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 px-3 py-1.5 rounded-lg">Derived Math Only</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-surface p-5 rounded-2xl border border-line space-y-4">
                  <div className="text-xs font-mono font-bold text-brand-700 dark:text-brand-300 uppercase">Move-Out Settlement Inputs</div>

                  <div>
                    <label className="text-xs text-ink-muted block mb-1">Initial Tenant Security Deposit Held (KES)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono">KES</span>
                      <input type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-12 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-ink-muted block mb-1">Approved Move-out Repairs (Linked Work Order #WO-419)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono">KES</span>
                      <input type="number" value={paintRepairs} onChange={(e) => setPaintRepairs(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-12 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-ink-muted block mb-1">Outstanding Utility Submeter Reading (Bill #UT-883, KES)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-ink-subtle font-mono">KES</span>
                      <input type="number" value={unpaidWater} onChange={(e) => setUnpaidWater(Number(e.target.value) || 0)} className="w-full bg-surface border border-line-strong rounded-xl pl-12 pr-3 py-2 text-sm text-ink font-mono focus:border-brand-400 focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-2xl border border-line space-y-4 font-mono text-xs">
                  <div className="text-xs font-mono font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider">Derived Settlement Statement</div>

                  <div className="space-y-2 border-b border-line pb-3 text-ink-muted">
                    <div className="flex justify-between">
                      <span>Total Deposit in Trust Account:</span>
                      <span className="text-ink font-bold">KES ${securityDeposit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>Less Approved Work Order:</span>
                      <span>- KES ${paintRepairs.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-rose-400">
                      <span>Less Unpaid Submeter Apportionment:</span>
                      <span>- KES ${unpaidWater.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between items-center text-sm font-bold font-sans">
                    <span className="text-ink">Net Derived Refund to Tenant:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-lg">KES ${netRefund.toLocaleString()}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-surface border border-line text-[11px] text-ink-subtle font-sans leading-relaxed">Once signed off by the letting manager, the settlement voucher is recorded and the general ledger is updated with the net refund.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Next step after the demo — the section used to end on a dead panel. */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-surface/70 border border-line">
          <p className="text-sm text-ink-muted text-center sm:text-left">These are the same rules the platform applies to a live organization — same allocation, same tax, same ledger.</p>
          <button onClick={onStartTrial} className="shrink-0 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer">
            Try it with your own portfolio
          </button>
        </div>
      </div>
    </section>
  );
};
